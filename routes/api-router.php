<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Api\Router;

/*
|--------------------------------------------------------------------------
| Minecraft Router API
|--------------------------------------------------------------------------
|
| Endpoint: /api/router
|
| Read by the standalone router that sends players to the right server based on the
| address they typed. Authenticated with PTERODACTYL_DOMAINS_ROUTER_TOKEN.
|
*/
Route::get('/domains', Router\DomainsController::class);
