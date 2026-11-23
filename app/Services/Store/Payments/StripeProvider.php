<?php

namespace Pterodactyl\Services\Store\Payments;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\StoreOrder;
use Illuminate\Http\Client\PendingRequest;
use Pterodactyl\Services\Store\StoreSettings;

/** Stripe Checkout: the person pays on a page of Stripe, the panel is told by the webhook and asks Stripe again when they come back. */
class StripeProvider implements PaymentProvider
{
    private const API = 'https://api.stripe.com/v1';

    /** How far the time of a webhook may be from ours, in seconds. */
    private const TOLERANCE = 300;

    public function __construct(private StoreSettings $settings)
    {
    }

    public function id(): string
    {
        return 'stripe';
    }

    public function name(): string
    {
        return 'Card (Stripe)';
    }

    public function configured(): bool
    {
        return $this->settings->get('stripe_enabled', 'false') === 'true' && $this->settings->get('stripe_secret') !== '';
    }

    private function http(): PendingRequest
    {
        return Http::withBasicAuth($this->settings->get('stripe_secret'), '')->asForm()->timeout(20)->acceptJson();
    }

    public function checkout(StoreOrder $order, string $returnUrl, string $cancelUrl): string
    {
        $response = $this->http()->post(self::API . '/checkout/sessions', [
            'mode' => 'payment',
            'client_reference_id' => $order->uuid,
            'metadata' => ['order' => $order->uuid],
            'payment_intent_data' => ['metadata' => ['order' => $order->uuid]],
            'success_url' => $returnUrl,
            'cancel_url' => $cancelUrl,
            'customer_email' => $order->user->email,
            // One line for every kind of thing in the cart, with how many of them.
            'line_items' => $order->items->groupBy(fn ($item) => $item->package_name . '|' . $item->amount . '|' . ($item->renewal ? 'r' : 'n'))->values()->map(fn ($group) => [
                'quantity' => $group->count(),
                'price_data' => [
                    'currency' => strtolower($order->currency),
                    'unit_amount' => $group->first()->amount,
                    'product_data' => ['name' => $group->first()->package_name . ($group->first()->renewal ? ' (renewal)' : '')],
                ],
            ])->all(),
        ]);

        if (!$response->successful() || !$response->json('url')) {
            throw new PaymentException('Stripe did not accept the payment: ' . ($response->json('error.message') ?: 'it could not be reached.'));
        }

        $order->forceFill(['provider_reference' => $response->json('id')])->save();

        return (string) $response->json('url');
    }

    public function status(StoreOrder $order, Request $returned): string
    {
        if (!$order->provider_reference) {
            return StoreOrder::PENDING;
        }
        $response = $this->http()->get(self::API . '/checkout/sessions/' . $order->provider_reference);
        if (!$response->successful()) {
            throw new PaymentException('Stripe could not be asked about this payment: ' . ($response->json('error.message') ?: 'it could not be reached.'));
        }

        return $this->statusOf($order, $response->json());
    }

    /** @param array<string, mixed> $session */
    private function statusOf(StoreOrder $order, array $session): string
    {
        if (($session['payment_status'] ?? '') === 'paid') {
            // Only a payment for exactly this order counts.
            if (($session['amount_total'] ?? null) !== $order->amount || strtoupper((string) ($session['currency'] ?? '')) !== strtoupper($order->currency)) {
                return StoreOrder::FAILED;
            }
            if (is_string($session['payment_intent'] ?? null)) {
                $order->forceFill(['provider_payment' => $session['payment_intent']])->save();
            }

            return StoreOrder::PAID;
        }

        return ($session['status'] ?? '') === 'expired' ? StoreOrder::CANCELED : StoreOrder::PENDING;
    }

    public function webhook(Request $request): ?array
    {
        $secret = $this->settings->get('stripe_webhook_secret');
        if ($secret === '' || !$this->signed($request->getContent(), (string) $request->header('Stripe-Signature'), $secret)) {
            return null;
        }

        $event = json_decode($request->getContent(), true);
        $type = (string) ($event['type'] ?? '');
        $object = $event['data']['object'] ?? [];

        if (in_array($type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'], true)) {
            $uuid = (string) ($object['client_reference_id'] ?? '');
            $order = StoreOrder::query()->where('uuid', $uuid)->where('provider', 'stripe')->first();
            if (!$order) {
                return null;
            }

            return ['order' => $uuid, 'status' => $this->statusOf($order, $object)];
        }

        if ($type === 'charge.refunded' && is_string($object['payment_intent'] ?? null)) {
            $order = StoreOrder::query()->where('provider', 'stripe')->where('provider_payment', $object['payment_intent'])->first();

            return $order ? ['order' => $order->uuid, 'status' => StoreOrder::REFUNDED] : null;
        }

        return null;
    }

    /** Whether the header is what Stripe makes of this body with the secret of the webhook, and is recent. */
    public function signed(string $body, string $header, string $secret): bool
    {
        $time = null;
        $signatures = [];
        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($key === 't') {
                $time = (int) $value;
            } elseif ($key === 'v1') {
                $signatures[] = $value;
            }
        }
        if ($time === null || abs(time() - $time) > self::TOLERANCE) {
            return false;
        }
        $expected = hash_hmac('sha256', $time . '.' . $body, $secret);
        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                return true;
            }
        }

        return false;
    }

    public function refund(StoreOrder $order): void
    {
        if (!$order->provider_payment) {
            throw new PaymentException('Stripe did not tell which payment this was, refund it in the Stripe dashboard.');
        }
        $response = $this->http()->post(self::API . '/refunds', ['payment_intent' => $order->provider_payment]);
        if (!$response->successful()) {
            throw new PaymentException('Stripe did not refund it: ' . ($response->json('error.message') ?: 'it could not be reached.'));
        }
    }
}
