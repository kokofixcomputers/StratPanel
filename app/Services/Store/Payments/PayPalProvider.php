<?php

namespace Pterodactyl\Services\Store\Payments;

use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\StoreOrder;
use Illuminate\Http\Client\PendingRequest;
use Pterodactyl\Services\Store\StoreSettings;

/** PayPal Orders: the person approves on PayPal, the panel captures the payment when they come back, and the webhook is a second way to hear of it. */
class PayPalProvider implements PaymentProvider
{
    public function __construct(private StoreSettings $settings)
    {
    }

    public function id(): string
    {
        return 'paypal';
    }

    public function name(): string
    {
        return 'PayPal';
    }

    public function configured(): bool
    {
        return $this->settings->get('paypal_enabled', 'false') === 'true' && $this->settings->get('paypal_client_id') !== '' && $this->settings->get('paypal_secret') !== '';
    }

    private function base(): string
    {
        return $this->settings->get('paypal_mode', 'live') === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    }

    private function token(): string
    {
        $response = Http::withBasicAuth($this->settings->get('paypal_client_id'), $this->settings->get('paypal_secret'))->asForm()->timeout(20)
            ->post($this->base() . '/v1/oauth2/token', ['grant_type' => 'client_credentials']);
        if (!$response->successful() || !$response->json('access_token')) {
            throw new PaymentException('PayPal did not accept the keys of the panel: ' . ($response->json('error_description') ?: 'it could not be reached.'));
        }

        return (string) $response->json('access_token');
    }

    private function http(): PendingRequest
    {
        return Http::withToken($this->token())->acceptJson()->asJson()->timeout(20);
    }

    public function checkout(StoreOrder $order, string $returnUrl, string $cancelUrl): string
    {
        $response = $this->http()->withHeaders(['PayPal-Request-Id' => $order->uuid])->post($this->base() . '/v2/checkout/orders', [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => $order->uuid,
                'custom_id' => $order->uuid,
                'description' => Str::limit($order->package_name, 120, ''),
                'amount' => ['currency_code' => strtoupper($order->currency), 'value' => StoreSettings::decimal($order->amount, $order->currency)],
            ]],
            'payment_source' => ['paypal' => ['experience_context' => [
                'return_url' => $returnUrl,
                'cancel_url' => $cancelUrl,
                'user_action' => 'PAY_NOW',
                'shipping_preference' => 'NO_SHIPPING',
            ]]],
        ]);

        $link = collect($response->json('links') ?? [])->first(fn ($l) => in_array($l['rel'] ?? '', ['payer-action', 'approve'], true));
        if (!$response->successful() || !$link || !$response->json('id')) {
            throw new PaymentException('PayPal did not accept the payment: ' . ($response->json('message') ?: 'it could not be reached.'));
        }

        $order->forceFill(['provider_reference' => $response->json('id')])->save();

        return (string) $link['href'];
    }

    public function status(StoreOrder $order, Request $returned): string
    {
        if (!$order->provider_reference) {
            return StoreOrder::PENDING;
        }
        $http = $this->http();

        // Always the order PayPal made for this one (kept on it), never one named in the address.
        $current = $http->get($this->base() . '/v2/checkout/orders/' . $order->provider_reference);
        if (!$current->successful()) {
            throw new PaymentException('PayPal could not be asked about this payment: ' . ($current->json('message') ?: 'it could not be reached.'));
        }
        $state = (string) $current->json('status');

        if ($state === 'APPROVED') {
            $captured = $this->http()->withHeaders(['PayPal-Request-Id' => $order->uuid . '-capture'])
                ->withBody('{}', 'application/json')->post($this->base() . '/v2/checkout/orders/' . $order->provider_reference . '/capture');
            if (!$captured->successful()) {
                throw new PaymentException('PayPal did not capture the payment: ' . ($captured->json('message') ?: 'it could not be reached.'));
            }
            $current = $captured;
            $state = (string) $captured->json('status');
        }

        if ($state === 'COMPLETED') {
            $capture = $current->json('purchase_units.0.payments.captures.0') ?? [];
            $paid = (string) ($capture['amount']['value'] ?? '');
            if ($paid !== StoreSettings::decimal($order->amount, $order->currency) || strtoupper((string) ($capture['amount']['currency_code'] ?? '')) !== strtoupper($order->currency)) {
                return StoreOrder::FAILED;
            }
            if (is_string($capture['id'] ?? null)) {
                $order->forceFill(['provider_payment' => $capture['id']])->save();
            }

            return StoreOrder::PAID;
        }

        return in_array($state, ['VOIDED'], true) ? StoreOrder::CANCELED : StoreOrder::PENDING;
    }

    public function webhook(Request $request): ?array
    {
        $webhookId = $this->settings->get('paypal_webhook_id');
        if ($webhookId === '') {
            return null;
        }
        $event = json_decode($request->getContent(), true);
        if (!is_array($event)) {
            return null;
        }

        // PayPal says whether the notification is its own.
        $verified = $this->http()->post($this->base() . '/v1/notifications/verify-webhook-signature', [
            'auth_algo' => (string) $request->header('PayPal-Auth-Algo'),
            'cert_url' => (string) $request->header('PayPal-Cert-Url'),
            'transmission_id' => (string) $request->header('PayPal-Transmission-Id'),
            'transmission_sig' => (string) $request->header('PayPal-Transmission-Sig'),
            'transmission_time' => (string) $request->header('PayPal-Transmission-Time'),
            'webhook_id' => $webhookId,
            'webhook_event' => $event,
        ]);
        if ($verified->json('verification_status') !== 'SUCCESS') {
            return null;
        }

        $type = (string) ($event['event_type'] ?? '');
        $uuid = (string) ($event['resource']['custom_id'] ?? '');
        if ($uuid === '' || !StoreOrder::query()->where('uuid', $uuid)->where('provider', 'paypal')->exists()) {
            return null;
        }

        return match ($type) {
            'PAYMENT.CAPTURE.COMPLETED' => ['order' => $uuid, 'status' => StoreOrder::PAID],
            'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED' => ['order' => $uuid, 'status' => StoreOrder::REFUNDED],
            'PAYMENT.CAPTURE.DENIED' => ['order' => $uuid, 'status' => StoreOrder::FAILED],
            default => null,
        };
    }

    public function refund(StoreOrder $order): void
    {
        if (!$order->provider_payment) {
            throw new PaymentException('PayPal did not tell which payment this was, refund it in PayPal.');
        }
        $response = $this->http()->withBody('{}', 'application/json')->post($this->base() . '/v2/payments/captures/' . $order->provider_payment . '/refund');
        if (!$response->successful()) {
            throw new PaymentException('PayPal did not refund it: ' . ($response->json('message') ?: 'it could not be reached.'));
        }
    }
}
