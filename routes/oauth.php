<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Auth;

/*
|--------------------------------------------------------------------------
| Signing in with other services
|--------------------------------------------------------------------------
|
| Endpoint: /auth/oauth
|
| Not behind the "guest" middleware like the rest of /auth: people who are signed in come here to link a service to their account.
*/

Route::get('/{provider}/redirect', [Auth\OAuthController::class, 'redirect'])->name('auth.oauth.redirect');
Route::get('/{provider}/callback', [Auth\OAuthController::class, 'callback'])->name('auth.oauth.callback');
