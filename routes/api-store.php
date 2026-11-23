<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Api\Store;

/*
|--------------------------------------------------------------------------
| Store webhooks
|--------------------------------------------------------------------------
|
| Endpoint: /api/store
|
| Called by Stripe and PayPal when a payment changes. Without a session: every notification is checked against the keys of the admin
| (Stripe signs it, PayPal is asked) before anything is believed.
|
*/
Route::post('/webhooks/{provider}', Store\WebhookController::class)->where('provider', 'stripe|paypal');
