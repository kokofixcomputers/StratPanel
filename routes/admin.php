<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Admin;
use Pterodactyl\Http\Middleware\Admin\Servers\ServerInstalled;

Route::get('/', [Admin\BaseController::class, 'index'])->name('admin.index');

/*
|--------------------------------------------------------------------------
| Location Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/api
|
*/
Route::group(['prefix' => 'api'], function () {
    // Part of the React app, see Admin\SpaController; the keys are read and made through the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.api.index')->middleware('admin.can:root');
    Route::get('/new', Admin\SpaController::class)->name('admin.api.new')->middleware('admin.can:root');
});

/*
|--------------------------------------------------------------------------
| Location Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/locations
|
*/
Route::group(['prefix' => 'locations'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.locations')->middleware('admin.can:locations.view');
    Route::get('/view/{location:id}', Admin\SpaController::class)->name('admin.locations.view')->middleware('admin.can:locations.view');
});

/*
|--------------------------------------------------------------------------
| Database Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/databases
|
*/
Route::group(['prefix' => 'databases'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.databases')->middleware('admin.can:databases.view');
    Route::get('/view/{host:id}', Admin\SpaController::class)->name('admin.databases.view')->middleware('admin.can:databases.view');
});

/*
|--------------------------------------------------------------------------
| Settings Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/settings
|
*/
Route::group(['prefix' => 'settings'], function () {
    // Part of the React app, see Admin\SpaController; each page reads and saves its settings through the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.settings')->middleware('admin.can:settings.general.view');
    Route::get('/mail', Admin\SpaController::class)->name('admin.settings.mail')->middleware('admin.can:settings.mail.view');
    Route::get('/advanced', Admin\SpaController::class)->name('admin.settings.advanced')->middleware('admin.can:settings.advanced.view');
    Route::get('/branding', Admin\SpaController::class)->name('admin.settings.branding')->middleware('admin.can:settings.branding.view');
    Route::get('/authentication', Admin\SpaController::class)->name('admin.settings.authentication')->middleware('admin.can:settings.authentication.view');
    Route::get('/providers', Admin\SpaController::class)->name('admin.settings.providers')->middleware('admin.can:settings.providers.view');
    Route::get('/providers/new', Admin\SpaController::class)->name('admin.settings.providers.new')->middleware('admin.can:settings.providers.update');
    Route::get('/providers/{provider}', Admin\SpaController::class)->name('admin.settings.providers.edit')->whereNumber('provider')->middleware('admin.can:settings.providers.view');
    Route::get('/domains', Admin\SpaController::class)->name('admin.settings.domains')->middleware('admin.can:settings.domains.view');
    Route::get('/domains/new', Admin\SpaController::class)->name('admin.settings.domains.new')->middleware('admin.can:settings.domains.update');
    Route::get('/domains/zones/{zone}', Admin\SpaController::class)->name('admin.settings.domains.edit')->whereNumber('zone')->middleware('admin.can:settings.domains.view');
    Route::get('/pools', Admin\SpaController::class)->name('admin.settings.pools')->middleware('admin.can:settings.pools.view');
    Route::get('/trash', Admin\SpaController::class)->name('admin.settings.trash')->middleware('admin.can:settings.trash.view');
    Route::get('/tunnels', Admin\SpaController::class)->name('admin.settings.tunnels')->middleware('admin.can:settings.tunnels.view');
    Route::get('/backups', Admin\SpaController::class)->name('admin.settings.backups')->middleware('admin.can:settings.backups.view');
    Route::get('/certificates', Admin\SpaController::class)->name('admin.settings.certificates')->middleware('admin.can:settings.certificates.view');
    Route::get('/certificates/{certificate}', Admin\SpaController::class)->name('admin.settings.certificates.edit')->whereNumber('certificate')->middleware('admin.can:settings.certificates.view');
    Route::get('/curseforge', Admin\SpaController::class)->name('admin.settings.curseforge')->middleware('admin.can:settings.curseforge.view');
});

/*
|--------------------------------------------------------------------------
| Updates
|--------------------------------------------------------------------------
|
| Endpoint: /admin/updates
|
*/
Route::group(['prefix' => 'updates'], function () {
    // Part of the React app, see Admin\SpaController; it follows the updater through the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.updates')->middleware('admin.can:root');
});

/*
|--------------------------------------------------------------------------
| Extensions
|--------------------------------------------------------------------------
|
| Endpoint: /admin/extensions
|
*/
Route::group(['prefix' => 'extensions'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.extensions')->middleware('admin.can:extensions.view');
    Route::get('/{extension}/settings', Admin\SpaController::class)->name('admin.extensions.settings')->middleware('admin.can:extensions.view');
});

/*
|--------------------------------------------------------------------------
| User Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/users
|
*/
Route::group(['prefix' => 'users'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.users')->middleware('admin.can:users.view');
    Route::get('/new', Admin\SpaController::class)->name('admin.users.new')->middleware('admin.can:users.create');
    Route::get('/view/{user:id}', Admin\SpaController::class)->name('admin.users.view')->middleware('admin.can:users.view');
});

/*
|--------------------------------------------------------------------------
| Server Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/servers
|
*/
Route::group(['prefix' => 'servers'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.servers')->middleware('admin.can:servers.view');
    Route::get('/new', Admin\SpaController::class)->name('admin.servers.new')->middleware('admin.can:servers.create');
    Route::get('/view/{server:id}', Admin\SpaController::class)->name('admin.servers.view')->middleware('admin.can:servers.view');

    // Only for a server that is installed.
    Route::group(['middleware' => [ServerInstalled::class]], function () {
        Route::get('/view/{server:id}/details', Admin\SpaController::class)->name('admin.servers.view.details')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/build', Admin\SpaController::class)->name('admin.servers.view.build')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/startup', Admin\SpaController::class)->name('admin.servers.view.startup')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/database', Admin\SpaController::class)->name('admin.servers.view.database')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/mounts', Admin\SpaController::class)->name('admin.servers.view.mounts')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/domains', Admin\SpaController::class)->name('admin.servers.view.domains')->middleware('admin.can:servers.view');
    });

    Route::get('/view/{server:id}/manage', Admin\SpaController::class)->name('admin.servers.view.manage')->middleware('admin.can:servers.view');
    Route::get('/view/{server:id}/delete', Admin\SpaController::class)->name('admin.servers.view.delete')->middleware('admin.can:servers.delete');

    // A file to download, not a page.
    Route::get('/view/{server:id}/export', Admin\Servers\ServerExportController::class)->name('admin.servers.view.export')->middleware('admin.can:servers.view');
});

/*
|--------------------------------------------------------------------------
| Node Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/nodes
|
*/
Route::group(['prefix' => 'nodes'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.nodes')->middleware('admin.can:nodes.view');
    Route::get('/new', Admin\SpaController::class)->name('admin.nodes.new')->middleware('admin.can:nodes.create');
    Route::get('/view/{node:id}', Admin\SpaController::class)->name('admin.nodes.view')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/settings', Admin\SpaController::class)->name('admin.nodes.view.settings')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/configuration', Admin\SpaController::class)->name('admin.nodes.view.configuration')->middleware('admin.can:nodes.configuration');
    Route::get('/view/{node:id}/allocation', Admin\SpaController::class)->name('admin.nodes.view.allocation')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/servers', Admin\SpaController::class)->name('admin.nodes.view.servers')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/certificate', Admin\SpaController::class)->name('admin.nodes.view.certificate')->middleware('admin.can:nodes.view');
});

/*
|--------------------------------------------------------------------------
| Role Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/roles
|
*/
Route::group(['prefix' => 'roles'], function () {
    // The pages are part of the React app (Admin\SpaController), they read and change roles through the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.roles')->middleware('admin.can:roles.view');
    Route::get('/new', Admin\SpaController::class)->name('admin.roles.new')->middleware('admin.can:roles.create');
    Route::get('/view/{role:id}', Admin\SpaController::class)->name('admin.roles.view')->middleware('admin.can:roles.view');
});

/*
|--------------------------------------------------------------------------
| Mount Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/mounts
|
*/
Route::group(['prefix' => 'mounts'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.mounts')->middleware('admin.can:mounts.view');
    Route::get('/view/{mount:id}', Admin\SpaController::class)->name('admin.mounts.view')->middleware('admin.can:mounts.view');
});

/*
|--------------------------------------------------------------------------
| Nest Controller Routes
|--------------------------------------------------------------------------
|
| Endpoint: /admin/nests
|
*/
Route::group(['prefix' => 'nests'], function () {
    // Part of the React app, see Admin\SpaController; the data comes from the admin API.
    Route::get('/', Admin\SpaController::class)->name('admin.nests')->middleware('admin.can:nests.view');
    Route::get('/view/{nest:id}', Admin\SpaController::class)->name('admin.nests.view')->middleware('admin.can:nests.view');
    Route::get('/egg/new', Admin\SpaController::class)->name('admin.nests.egg.new')->middleware('admin.can:eggs.create');
    Route::get('/egg/{egg:id}', Admin\SpaController::class)->name('admin.nests.egg.view')->middleware('admin.can:nests.view');
    Route::get('/egg/{egg:id}/variables', Admin\SpaController::class)->name('admin.nests.egg.variables')->middleware('admin.can:nests.view');
    Route::get('/egg/{egg:id}/scripts', Admin\SpaController::class)->name('admin.nests.egg.scripts')->middleware('admin.can:nests.view');

    // A file to download, not a page.
    Route::get('/egg/{egg:id}/export', [Admin\Nests\EggShareController::class, 'export'])->name('admin.nests.egg.export')->middleware('admin.can:eggs.export');
});
