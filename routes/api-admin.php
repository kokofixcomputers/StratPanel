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

    Route::get('/lookups/nodes', [Admin\LookupsController::class, 'nodes'])->middleware('admin.can:databases.view,databases.create,databases.update,servers.view,servers.create,nodes.view,mounts.view,mounts.update');

    Route::get('/lookups/eggs', [Admin\LookupsController::class, 'eggs'])->middleware('admin.can:mounts.view,mounts.update,servers.view,servers.create,nests.view');

    Route::prefix('/users')->group(function () {
        Route::get('/', [Admin\UsersController::class, 'index'])->middleware('admin.can:users.view');
        Route::get('/meta', [Admin\UsersController::class, 'meta'])->middleware('admin.can:users.view,users.create');
        Route::post('/', [Admin\UsersController::class, 'store'])->middleware('admin.can:users.create');
        Route::get('/{person}', [Admin\UsersController::class, 'view'])->whereNumber('person')->middleware('admin.can:users.view');
        Route::patch('/{person}', [Admin\UsersController::class, 'update'])->whereNumber('person')->middleware('admin.can:users.update');
        Route::delete('/{person}', [Admin\UsersController::class, 'destroy'])->whereNumber('person')->middleware('admin.can:users.delete');
        Route::put('/{person}/roles', [Admin\UsersController::class, 'syncRoles'])->whereNumber('person')->middleware('admin.can:roles.assign');
        Route::patch('/{person}/pool', [Admin\UsersController::class, 'updatePool'])->whereNumber('person')->middleware('admin.can:users.update');
    });

    Route::prefix('/mounts')->group(function () {
        Route::get('/', [Admin\MountsController::class, 'index'])->middleware('admin.can:mounts.view');
        Route::post('/', [Admin\MountsController::class, 'store'])->middleware('admin.can:mounts.create');
        Route::get('/{mount}', [Admin\MountsController::class, 'view'])->whereNumber('mount')->middleware('admin.can:mounts.view');
        Route::patch('/{mount}', [Admin\MountsController::class, 'update'])->whereNumber('mount')->middleware('admin.can:mounts.update');
        Route::delete('/{mount}', [Admin\MountsController::class, 'destroy'])->whereNumber('mount')->middleware('admin.can:mounts.delete');
        Route::post('/{mount}/eggs', [Admin\MountsController::class, 'addEggs'])->whereNumber('mount')->middleware('admin.can:mounts.update');
        Route::post('/{mount}/nodes', [Admin\MountsController::class, 'addNodes'])->whereNumber('mount')->middleware('admin.can:mounts.update');
        Route::delete('/{mount}/eggs/{egg}', [Admin\MountsController::class, 'removeEgg'])->whereNumber(['mount', 'egg'])->middleware('admin.can:mounts.update');
        Route::delete('/{mount}/nodes/{node}', [Admin\MountsController::class, 'removeNode'])->whereNumber(['mount', 'node'])->middleware('admin.can:mounts.update');
    });

    Route::prefix('/databases')->group(function () {
        Route::get('/', [Admin\DatabaseHostsController::class, 'index'])->middleware('admin.can:databases.view');
        Route::post('/', [Admin\DatabaseHostsController::class, 'store'])->middleware('admin.can:databases.create');
        Route::get('/{host}', [Admin\DatabaseHostsController::class, 'view'])->whereNumber('host')->middleware('admin.can:databases.view');
        Route::patch('/{host}', [Admin\DatabaseHostsController::class, 'update'])->whereNumber('host')->middleware('admin.can:databases.update');
        Route::delete('/{host}', [Admin\DatabaseHostsController::class, 'destroy'])->whereNumber('host')->middleware('admin.can:databases.delete');
    });

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

    Route::prefix('/application-keys')->group(function () {
        Route::get('/', [Admin\ApplicationKeysController::class, 'index'])->middleware('admin.can:root');
        Route::get('/resources', [Admin\ApplicationKeysController::class, 'resources'])->middleware('admin.can:root');
        Route::post('/', [Admin\ApplicationKeysController::class, 'store'])->middleware('admin.can:root');
        Route::delete('/{identifier}', [Admin\ApplicationKeysController::class, 'destroy'])->middleware('admin.can:root');
    });

    Route::prefix('/extensions')->group(function () {
        Route::get('/', [Admin\ExtensionsController::class, 'index'])->middleware('admin.can:extensions.view');
        Route::get('/{extension}/settings', [Admin\ExtensionsController::class, 'settings'])->middleware('admin.can:extensions.view');
        Route::patch('/{extension}/settings', [Admin\ExtensionsController::class, 'saveSettings'])->middleware('admin.can:extensions.manage');
        Route::post('/{extension}/toggle', [Admin\ExtensionsController::class, 'toggle'])->middleware('admin.can:extensions.manage');
        Route::post('/{extension}/clear-error', [Admin\ExtensionsController::class, 'clearError'])->middleware('admin.can:extensions.manage');
    });

    Route::prefix('/updates')->group(function () {
        Route::get('/', [Admin\UpdatesController::class, 'index'])->middleware('admin.can:root');
        Route::get('/status', [Admin\UpdatesController::class, 'status'])->middleware('admin.can:root');
        Route::post('/', [Admin\UpdatesController::class, 'run'])->middleware('admin.can:root');
    });

    // The notice that a newer web interface exists is shown on every page of the admin area, to whoever may update.
    Route::get('/ui-update', [Admin\UpdatesController::class, 'ui'])->middleware('admin.can:root');

    Route::prefix('/settings')->group(function () {
        Route::get('/general', [Admin\Settings\SettingsController::class, 'general'])->middleware('admin.can:settings.general.view');
        Route::patch('/general', [Admin\Settings\SettingsController::class, 'updateGeneral'])->middleware('admin.can:settings.general.update');
        Route::get('/advanced', [Admin\Settings\SettingsController::class, 'advanced'])->middleware('admin.can:settings.advanced.view');
        Route::patch('/advanced', [Admin\Settings\SettingsController::class, 'updateAdvanced'])->middleware('admin.can:settings.advanced.update');
        Route::get('/mail', [Admin\Settings\SettingsController::class, 'mail'])->middleware('admin.can:settings.mail.view');
        Route::patch('/mail', [Admin\Settings\SettingsController::class, 'updateMail'])->middleware('admin.can:settings.mail.update');
        Route::post('/mail/test', [Admin\Settings\SettingsController::class, 'testMail'])->middleware('admin.can:settings.mail.update');
        Route::get('/trash', [Admin\Settings\SettingsController::class, 'trash'])->middleware('admin.can:settings.trash.view');
        Route::patch('/trash', [Admin\Settings\SettingsController::class, 'updateTrash'])->middleware('admin.can:settings.trash.update');
        Route::get('/pools', [Admin\Settings\SettingsController::class, 'pools'])->middleware('admin.can:settings.pools.view');
        Route::patch('/pools', [Admin\Settings\SettingsController::class, 'updatePools'])->middleware('admin.can:settings.pools.update');
        Route::get('/curseforge', [Admin\Settings\SettingsController::class, 'curseforge'])->middleware('admin.can:settings.curseforge.view');
        Route::patch('/curseforge', [Admin\Settings\SettingsController::class, 'updateCurseforge'])->middleware('admin.can:settings.curseforge.update');
        Route::post('/curseforge/test', [Admin\Settings\SettingsController::class, 'testCurseforge'])->middleware('admin.can:settings.curseforge.update');
        Route::get('/authentication', [Admin\Settings\SettingsController::class, 'authentication'])->middleware('admin.can:settings.authentication.view');
        Route::patch('/authentication', [Admin\Settings\SettingsController::class, 'updateAuthentication'])->middleware('admin.can:settings.authentication.update');
        Route::get('/branding', [Admin\Settings\SettingsController::class, 'branding'])->middleware('admin.can:settings.branding.view');
        // A POST because it can carry a file, which PHP does not read from a PATCH.
        Route::post('/branding', [Admin\Settings\SettingsController::class, 'updateBranding'])->middleware('admin.can:settings.branding.update');

        Route::prefix('/providers')->group(function () {
            Route::get('/', [Admin\Settings\ProvidersController::class, 'index'])->middleware('admin.can:settings.providers.view');
            Route::get('/blank', [Admin\Settings\ProvidersController::class, 'blank'])->middleware('admin.can:settings.providers.update');
            Route::post('/', [Admin\Settings\ProvidersController::class, 'store'])->middleware('admin.can:settings.providers.update');
            Route::get('/{provider}', [Admin\Settings\ProvidersController::class, 'view'])->whereNumber('provider')->middleware('admin.can:settings.providers.view');
            Route::patch('/{provider}', [Admin\Settings\ProvidersController::class, 'update'])->whereNumber('provider')->middleware('admin.can:settings.providers.update');
            Route::delete('/{provider}', [Admin\Settings\ProvidersController::class, 'destroy'])->whereNumber('provider')->middleware('admin.can:settings.providers.update');
        });

        Route::prefix('/domains')->group(function () {
            Route::get('/', [Admin\Settings\DomainsController::class, 'index'])->middleware('admin.can:settings.domains.view');
            Route::patch('/', [Admin\Settings\DomainsController::class, 'update'])->middleware('admin.can:settings.domains.update');
            Route::get('/blank', [Admin\Settings\DomainsController::class, 'blank'])->middleware('admin.can:settings.domains.update');
            Route::post('/zones', [Admin\Settings\DomainsController::class, 'store'])->middleware('admin.can:settings.domains.update');
            Route::get('/zones/{zone}', [Admin\Settings\DomainsController::class, 'view'])->whereNumber('zone')->middleware('admin.can:settings.domains.view');
            Route::patch('/zones/{zone}', [Admin\Settings\DomainsController::class, 'updateZone'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
            Route::post('/zones/{zone}/test', [Admin\Settings\DomainsController::class, 'test'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
            Route::delete('/zones/{zone}', [Admin\Settings\DomainsController::class, 'destroy'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
        });

        Route::prefix('/certificates')->group(function () {
            Route::get('/', [Admin\Settings\CertificatesController::class, 'index'])->middleware('admin.can:settings.certificates.view');
            Route::post('/', [Admin\Settings\CertificatesController::class, 'store'])->middleware('admin.can:settings.certificates.update');
            Route::patch('/letsencrypt', [Admin\Settings\CertificatesController::class, 'acme'])->middleware('admin.can:settings.certificates.update');
            Route::get('/{certificate}', [Admin\Settings\CertificatesController::class, 'view'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.view');
            Route::patch('/{certificate}', [Admin\Settings\CertificatesController::class, 'update'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.update');
            Route::delete('/{certificate}', [Admin\Settings\CertificatesController::class, 'destroy'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.update');
        });
    });
});
