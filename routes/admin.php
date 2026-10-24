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

    // Still read by the pages that are not part of the app yet (a list of people to choose from).
    Route::get('/accounts.json', [Admin\UserController::class, 'json'])->name('admin.users.json')->middleware('admin.can:users.view,servers.create,servers.update,roles.assign');
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
    Route::get('/', [Admin\Servers\ServerController::class, 'index'])->name('admin.servers')->middleware('admin.can:servers.view');
    Route::get('/new', [Admin\Servers\CreateServerController::class, 'index'])->name('admin.servers.new')->middleware('admin.can:servers.create');
    Route::get('/view/{server:id}', [Admin\Servers\ServerViewController::class, 'index'])->name('admin.servers.view')->middleware('admin.can:servers.view');

    Route::group(['middleware' => [ServerInstalled::class]], function () {
        Route::get('/view/{server:id}/details', [Admin\Servers\ServerViewController::class, 'details'])->name('admin.servers.view.details')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/build', [Admin\Servers\ServerViewController::class, 'build'])->name('admin.servers.view.build')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/startup', [Admin\Servers\ServerViewController::class, 'startup'])->name('admin.servers.view.startup')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/database', [Admin\Servers\ServerViewController::class, 'database'])->name('admin.servers.view.database')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/mounts', [Admin\Servers\ServerViewController::class, 'mounts'])->name('admin.servers.view.mounts')->middleware('admin.can:servers.view');
        Route::get('/view/{server:id}/domains', [Admin\Servers\ServerDomainsController::class, 'index'])->name('admin.servers.view.domains')->middleware('admin.can:servers.view');
    });

    Route::get('/view/{server:id}/export', Admin\Servers\ServerExportController::class)->name('admin.servers.view.export')->middleware('admin.can:servers.view');
    Route::get('/view/{server:id}/manage', [Admin\Servers\ServerViewController::class, 'manage'])->name('admin.servers.view.manage')->middleware('admin.can:servers.view');
    Route::get('/view/{server:id}/delete', [Admin\Servers\ServerViewController::class, 'delete'])->name('admin.servers.view.delete')->middleware('admin.can:servers.delete');

    Route::post('/new', [Admin\Servers\CreateServerController::class, 'store'])->middleware('admin.can:servers.create');
    Route::post('/view/{server:id}/build', [Admin\ServersController::class, 'updateBuild'])->middleware('admin.can:servers.build');
    Route::post('/view/{server:id}/startup', [Admin\ServersController::class, 'saveStartup'])->middleware('admin.can:servers.startup');
    Route::post('/view/{server:id}/database', [Admin\ServersController::class, 'newDatabase'])->middleware('admin.can:servers.databases');
    Route::post('/view/{server:id}/mounts', [Admin\ServersController::class, 'addMount'])->name('admin.servers.view.mounts.store')->middleware('admin.can:servers.mounts');
    Route::post('/view/{server:id}/domains', [Admin\Servers\ServerDomainsController::class, 'store'])->name('admin.servers.view.domains.store')->middleware('admin.can:servers.domains');
    Route::post('/view/{server:id}/manage/toggle', [Admin\ServersController::class, 'toggleInstall'])->name('admin.servers.view.manage.toggle')->middleware('admin.can:servers.reinstall');
    Route::post('/view/{server:id}/manage/suspension', [Admin\ServersController::class, 'manageSuspension'])->name('admin.servers.view.manage.suspension')->middleware('admin.can:servers.suspend');
    Route::post('/view/{server:id}/manage/reinstall', [Admin\ServersController::class, 'reinstallServer'])->name('admin.servers.view.manage.reinstall')->middleware('admin.can:servers.reinstall');
    Route::post('/view/{server:id}/manage/transfer', [Admin\Servers\ServerTransferController::class, 'transfer'])->name('admin.servers.view.manage.transfer')->middleware('admin.can:servers.transfer');
    Route::post('/view/{server:id}/delete', [Admin\ServersController::class, 'delete'])->middleware('admin.can:servers.delete');

    Route::patch('/view/{server:id}/details', [Admin\ServersController::class, 'setDetails'])->middleware('admin.can:servers.update');
    Route::patch('/view/{server:id}/database', [Admin\ServersController::class, 'resetDatabasePassword'])->middleware('admin.can:servers.databases');

    Route::delete('/view/{server:id}/database/{database:id}/delete', [Admin\ServersController::class, 'deleteDatabase'])->name('admin.servers.view.database.delete')->middleware('admin.can:servers.databases');
    Route::delete('/view/{server:id}/domains/{domain}', [Admin\Servers\ServerDomainsController::class, 'destroy'])->name('admin.servers.view.domains.delete')->middleware('admin.can:servers.domains');
    Route::delete('/view/{server:id}/mounts/{mount:id}', [Admin\ServersController::class, 'deleteMount'])
        ->name('admin.servers.view.mounts.delete')->middleware('admin.can:servers.mounts');
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
    Route::get('/', [Admin\Nodes\NodeController::class, 'index'])->name('admin.nodes')->middleware('admin.can:nodes.view');
    Route::get('/new', [Admin\NodesController::class, 'create'])->name('admin.nodes.new')->middleware('admin.can:nodes.create');
    Route::get('/view/{node:id}', [Admin\Nodes\NodeViewController::class, 'index'])->name('admin.nodes.view')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/settings', [Admin\Nodes\NodeViewController::class, 'settings'])->name('admin.nodes.view.settings')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/configuration', [Admin\Nodes\NodeViewController::class, 'configuration'])->name('admin.nodes.view.configuration')->middleware('admin.can:nodes.configuration');
    Route::get('/view/{node:id}/allocation', [Admin\Nodes\NodeViewController::class, 'allocations'])->name('admin.nodes.view.allocation')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/servers', [Admin\Nodes\NodeViewController::class, 'servers'])->name('admin.nodes.view.servers')->middleware('admin.can:nodes.view');
    Route::get('/view/{node:id}/system-information', Admin\Nodes\SystemInformationController::class)->middleware('admin.can:nodes.view');

    Route::get('/view/{node:id}/certificate', [Admin\Nodes\NodeCertificateController::class, 'index'])->name('admin.nodes.view.certificate')->middleware('admin.can:nodes.view');
    Route::patch('/view/{node:id}/certificate', [Admin\Nodes\NodeCertificateController::class, 'update'])->middleware('admin.can:nodes.certificate');
    Route::post('/view/{node:id}/certificate/push', [Admin\Nodes\NodeCertificateController::class, 'push'])->name('admin.nodes.view.certificate.push')->middleware('admin.can:nodes.certificate');
    Route::post('/view/{node:id}/certificate/enable', [Admin\Nodes\NodeCertificateController::class, 'enableHttps'])->name('admin.nodes.view.certificate.enable')->middleware('admin.can:nodes.certificate');
    Route::post('/update', [Admin\Nodes\NodeUpdateController::class, 'all'])->name('admin.nodes.update')->middleware('admin.can:nodes.software');
    Route::post('/view/{node:id}/update', [Admin\Nodes\NodeUpdateController::class, 'node'])->name('admin.nodes.view.update')->middleware('admin.can:nodes.software');
    Route::post('/new', [Admin\NodesController::class, 'store'])->middleware('admin.can:nodes.create');
    Route::post('/view/{node:id}/allocation', [Admin\NodesController::class, 'createAllocation'])->middleware('admin.can:nodes.allocations');
    Route::post('/view/{node:id}/allocation/remove', [Admin\NodesController::class, 'allocationRemoveBlock'])->name('admin.nodes.view.allocation.removeBlock')->middleware('admin.can:nodes.allocations');
    Route::post('/view/{node:id}/allocation/alias', [Admin\NodesController::class, 'allocationSetAlias'])->name('admin.nodes.view.allocation.setAlias')->middleware('admin.can:nodes.allocations');
    Route::post('/view/{node:id}/settings/token', Admin\NodeAutoDeployController::class)->name('admin.nodes.view.configuration.token')->middleware('admin.can:nodes.configuration');

    Route::patch('/view/{node:id}/settings', [Admin\NodesController::class, 'updateSettings'])->middleware('admin.can:nodes.update');

    Route::delete('/view/{node:id}/delete', [Admin\NodesController::class, 'delete'])->name('admin.nodes.view.delete')->middleware('admin.can:nodes.delete');
    Route::delete('/view/{node:id}/allocation/remove/{allocation:id}', [Admin\NodesController::class, 'allocationRemoveSingle'])->name('admin.nodes.view.allocation.removeSingle')->middleware('admin.can:nodes.allocations');
    Route::delete('/view/{node:id}/allocations', [Admin\NodesController::class, 'allocationRemoveMultiple'])->name('admin.nodes.view.allocation.removeMultiple')->middleware('admin.can:nodes.allocations');
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
