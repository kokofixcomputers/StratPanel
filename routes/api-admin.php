<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Api\Client\Admin;
use Pterodactyl\Http\Middleware\AdminAuthenticate;

/*
|--------------------------------------------------------------------------
| Admin API
|--------------------------------------------------------------------------
|
| Endpoint: /api/client/admin
|
| What the pages of the admin area (the React app) read and change. It is the session of the person, like the rest of the client API,
| and every route names the permission it needs with admin.can, the same one the page itself has. Mounted from routes/api-client.php.
|
*/

Route::middleware(AdminAuthenticate::class)->group(function () {
    Route::get('/overview', Admin\OverviewController::class)->middleware('admin.can:overview.view');

    Route::prefix('/locations')->group(function () {
        Route::get('/', [Admin\LocationsController::class, 'index'])->middleware('admin.can:locations.view');
        Route::post('/', [Admin\LocationsController::class, 'store'])->middleware('admin.can:locations.create');
        Route::get('/{location}', [Admin\LocationsController::class, 'view'])->whereNumber('location')->middleware('admin.can:locations.view');
        Route::patch('/{location}', [Admin\LocationsController::class, 'update'])->whereNumber('location')->middleware('admin.can:locations.update');
        Route::delete('/{location}', [Admin\LocationsController::class, 'destroy'])->whereNumber('location')->middleware('admin.can:locations.delete');
    });

    Route::prefix('/roles')->group(function () {
        Route::get('/', [Admin\RolesController::class, 'index'])->middleware('admin.can:roles.view');
        Route::get('/permissions', [Admin\RolesController::class, 'permissions'])->middleware('admin.can:roles.view,roles.create');
        Route::post('/', [Admin\RolesController::class, 'store'])->middleware('admin.can:roles.create');
        Route::get('/{role}', [Admin\RolesController::class, 'view'])->whereNumber('role')->middleware('admin.can:roles.view');
        Route::patch('/{role}', [Admin\RolesController::class, 'update'])->whereNumber('role')->middleware('admin.can:roles.update');
        Route::delete('/{role}', [Admin\RolesController::class, 'destroy'])->whereNumber('role')->middleware('admin.can:roles.delete');
        Route::post('/{role}/members', [Admin\RolesController::class, 'addMember'])->whereNumber('role')->middleware('admin.can:roles.assign');
        Route::delete('/{role}/members/{person}', [Admin\RolesController::class, 'removeMember'])->whereNumber(['role', 'person'])->middleware('admin.can:roles.assign');
    });
});
