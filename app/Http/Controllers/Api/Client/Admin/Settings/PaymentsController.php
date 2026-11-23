<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Store\StoreSettings;

/** Settings > Payments: whether the store is open, the currency, and the keys of Stripe and PayPal. The secrets are never given back. */
class PaymentsController extends Controller
{
    public function __construct(private StoreSettings $settings)
    {
    }

    public function index(): JsonResponse
    {
        $base = rtrim((string) config('app.url'), '/') . '/api/store/webhooks/';

        return new JsonResponse([
            'enabled' => $this->settings->enabled(),
            'currency' => $this->settings->currency(),
            'stripe' => [
                'enabled' => $this->settings->get('stripe_enabled', 'false') === 'true',
                'secret_set' => $this->settings->get('stripe_secret') !== '',
                'webhook_secret_set' => $this->settings->get('stripe_webhook_secret') !== '',
                'webhook_url' => $base . 'stripe',
            ],
            'paypal' => [
                'enabled' => $this->settings->get('paypal_enabled', 'false') === 'true',
                'client_id' => $this->settings->get('paypal_client_id'),
                'secret_set' => $this->settings->get('paypal_secret') !== '',
                'mode' => $this->settings->get('paypal_mode', 'live'),
                'webhook_id' => $this->settings->get('paypal_webhook_id'),
                'webhook_url' => $base . 'paypal',
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'enabled' => 'required|boolean',
            'currency' => ['required', 'string', 'regex:/^[A-Za-z]{3}$/'],
            'stripe.enabled' => 'required|boolean',
            // A secret that is not sent stays as it is; an empty one is removed.
            'stripe.secret' => 'sometimes|nullable|string|max:255',
            'stripe.webhook_secret' => 'sometimes|nullable|string|max:255',
            'paypal.enabled' => 'required|boolean',
            'paypal.client_id' => 'sometimes|nullable|string|max:255',
            'paypal.secret' => 'sometimes|nullable|string|max:255',
            'paypal.mode' => 'required|in:live,sandbox',
            'paypal.webhook_id' => 'sometimes|nullable|string|max:255',
        ]);

        $this->settings->set('enabled', $data['enabled'] ? 'true' : 'false');
        $this->settings->set('currency', strtoupper($data['currency']));
        $this->settings->set('stripe_enabled', $data['stripe']['enabled'] ? 'true' : 'false');
        $this->settings->set('paypal_enabled', $data['paypal']['enabled'] ? 'true' : 'false');
        $this->settings->set('paypal_mode', $data['paypal']['mode']);
        foreach (['stripe_secret' => $data['stripe']['secret'] ?? null, 'stripe_webhook_secret' => $data['stripe']['webhook_secret'] ?? null,
            'paypal_secret' => $data['paypal']['secret'] ?? null, 'paypal_client_id' => $data['paypal']['client_id'] ?? null, 'paypal_webhook_id' => $data['paypal']['webhook_id'] ?? null] as $key => $value) {
            if ($value !== null) {
                $this->settings->set($key, trim($value));
            }
        }

        return $this->index();
    }
}
