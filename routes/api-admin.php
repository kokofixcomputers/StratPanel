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
            Route::post('/zones/{zone}/certificate', [Admin\Settings\DomainsController::class, 'requestCertificate'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
            Route::post('/zones/{zone}/test', [Admin\Settings\DomainsController::class, 'test'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
            Route::delete('/zones/{zone}', [Admin\Settings\DomainsController::class, 'destroy'])->whereNumber('zone')->middleware('admin.can:settings.domains.update');
        });

        Route::prefix('/backups')->group(function () {
            Route::get('/', [Admin\Settings\BackupsController::class, 'index'])->middleware('admin.can:settings.backups.view');
            Route::post('/', [Admin\Settings\BackupsController::class, 'store'])->middleware('admin.can:settings.backups.update');
            Route::post('/test', [Admin\Settings\BackupsController::class, 'test'])->middleware('admin.can:settings.backups.update');
            Route::patch('/{destination}', [Admin\Settings\BackupsController::class, 'update'])->whereNumber('destination')->middleware('admin.can:settings.backups.update');
            Route::delete('/{destination}', [Admin\Settings\BackupsController::class, 'destroy'])->whereNumber('destination')->middleware('admin.can:settings.backups.update');
            Route::post('/{destination}/backfill', [Admin\Settings\BackupsController::class, 'backfill'])->whereNumber('destination')->middleware('admin.can:settings.backups.update');
            Route::post('/{destination}/prune', [Admin\Settings\BackupsController::class, 'prune'])->whereNumber('destination')->middleware('admin.can:settings.backups.update');
            Route::post('/{destination}/retry', [Admin\Settings\BackupsController::class, 'retry'])->whereNumber('destination')->middleware('admin.can:settings.backups.update');
        });

        Route::prefix('/certificates')->group(function () {
            Route::get('/', [Admin\Settings\CertificatesController::class, 'index'])->middleware('admin.can:settings.certificates.view');
            Route::post('/', [Admin\Settings\CertificatesController::class, 'store'])->middleware('admin.can:settings.certificates.update');
            Route::patch('/letsencrypt', [Admin\Settings\CertificatesController::class, 'acme'])->middleware('admin.can:settings.certificates.update');
            Route::post('/letsencrypt/issue', [Admin\Settings\CertificatesController::class, 'issue'])->middleware('admin.can:settings.certificates.update');
            Route::post('/{certificate}/renew', [Admin\Settings\CertificatesController::class, 'renew'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.update');
            Route::get('/{certificate}', [Admin\Settings\CertificatesController::class, 'view'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.view');
            Route::patch('/{certificate}', [Admin\Settings\CertificatesController::class, 'update'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.update');
            Route::delete('/{certificate}', [Admin\Settings\CertificatesController::class, 'destroy'])->whereNumber('certificate')->middleware('admin.can:settings.certificates.update');
        });
    });

    Route::prefix('/nests')->group(function () {
        Route::get('/', [Admin\NestsController::class, 'index'])->middleware('admin.can:nests.view');
        Route::get('/lookup', [Admin\NestsController::class, 'lookup'])->middleware('admin.can:nests.view,eggs.create,eggs.import');
        Route::post('/', [Admin\NestsController::class, 'store'])->middleware('admin.can:nests.create');
        Route::get('/{nest}', [Admin\NestsController::class, 'view'])->whereNumber('nest')->middleware('admin.can:nests.view');
        Route::patch('/{nest}', [Admin\NestsController::class, 'update'])->whereNumber('nest')->middleware('admin.can:nests.update');
        Route::delete('/{nest}', [Admin\NestsController::class, 'destroy'])->whereNumber('nest')->middleware('admin.can:nests.delete');
    });

    Route::prefix('/eggs')->group(function () {
        Route::post('/', [Admin\EggsController::class, 'store'])->middleware('admin.can:eggs.create');
        Route::post('/import', [Admin\EggsController::class, 'import'])->middleware('admin.can:eggs.import');
        Route::get('/{egg}', [Admin\EggsController::class, 'view'])->whereNumber('egg')->middleware('admin.can:nests.view');
        Route::patch('/{egg}', [Admin\EggsController::class, 'updateEgg'])->whereNumber('egg')->middleware('admin.can:eggs.update');
        Route::delete('/{egg}', [Admin\EggsController::class, 'destroy'])->whereNumber('egg')->middleware('admin.can:eggs.delete');
        // A POST because it carries a file, which PHP does not read from a PUT or a PATCH.
        Route::post('/{egg}/import', [Admin\EggsController::class, 'updateFromFile'])->whereNumber('egg')->middleware('admin.can:eggs.import');
        Route::get('/{egg}/variables', [Admin\EggVariablesController::class, 'index'])->whereNumber('egg')->middleware('admin.can:nests.view');
        Route::post('/{egg}/variables', [Admin\EggVariablesController::class, 'store'])->whereNumber('egg')->middleware('admin.can:eggs.update');
        Route::patch('/{egg}/variables/{variable}', [Admin\EggVariablesController::class, 'updateVariable'])->whereNumber(['egg', 'variable'])->middleware('admin.can:eggs.update');
        Route::delete('/{egg}/variables/{variable}', [Admin\EggVariablesController::class, 'destroy'])->whereNumber(['egg', 'variable'])->middleware('admin.can:eggs.update');
        Route::get('/{egg}/script', [Admin\EggVariablesController::class, 'script'])->whereNumber('egg')->middleware('admin.can:nests.view');
        Route::patch('/{egg}/script', [Admin\EggVariablesController::class, 'updateScript'])->whereNumber('egg')->middleware('admin.can:eggs.update');
    });

    Route::prefix('/nodes')->group(function () {
        Route::get('/', [Admin\NodesController::class, 'index'])->middleware('admin.can:nodes.view');
        Route::get('/form', [Admin\NodesController::class, 'form'])->middleware('admin.can:nodes.create,nodes.update');
        Route::post('/', [Admin\NodesController::class, 'store'])->middleware('admin.can:nodes.create');
        Route::post('/update', [Admin\NodesController::class, 'updateAllWings'])->middleware('admin.can:nodes.software');
        Route::get('/{node}', [Admin\NodesController::class, 'view'])->whereNumber('node')->middleware('admin.can:nodes.view');
        Route::patch('/{node}', [Admin\NodesController::class, 'updateNode'])->whereNumber('node')->middleware('admin.can:nodes.update');
        Route::delete('/{node}', [Admin\NodesController::class, 'destroy'])->whereNumber('node')->middleware('admin.can:nodes.delete');
        Route::get('/{node}/system-information', [Admin\NodesController::class, 'systemInformation'])->whereNumber('node')->middleware('admin.can:nodes.view');
        Route::post('/{node}/update', [Admin\NodesController::class, 'updateWings'])->whereNumber('node')->middleware('admin.can:nodes.software');
        Route::get('/{node}/configuration', [Admin\NodesController::class, 'configuration'])->whereNumber('node')->middleware('admin.can:nodes.configuration');
        Route::post('/{node}/configuration/token', [Admin\NodesController::class, 'token'])->whereNumber('node')->middleware('admin.can:nodes.configuration');

        Route::get('/{node}/allocations', [Admin\NodeAllocationsController::class, 'index'])->whereNumber('node')->middleware('admin.can:nodes.view');
        Route::post('/{node}/allocations', [Admin\NodeAllocationsController::class, 'store'])->whereNumber('node')->middleware('admin.can:nodes.allocations');
        Route::delete('/{node}/allocations', [Admin\NodeAllocationsController::class, 'destroyMany'])->whereNumber('node')->middleware('admin.can:nodes.allocations');
        Route::post('/{node}/allocations/alias', [Admin\NodeAllocationsController::class, 'setAlias'])->whereNumber('node')->middleware('admin.can:nodes.allocations');
        Route::post('/{node}/allocations/remove-block', [Admin\NodeAllocationsController::class, 'destroyBlock'])->whereNumber('node')->middleware('admin.can:nodes.allocations');
        Route::delete('/{node}/allocations/{allocation}', [Admin\NodeAllocationsController::class, 'destroy'])->whereNumber(['node', 'allocation'])->middleware('admin.can:nodes.allocations');
        Route::get('/{node}/servers', [Admin\NodeAllocationsController::class, 'servers'])->whereNumber('node')->middleware('admin.can:nodes.view');

        Route::get('/{node}/certificate', [Admin\NodeCertificateController::class, 'view'])->whereNumber('node')->middleware('admin.can:nodes.view');
        Route::patch('/{node}/certificate', [Admin\NodeCertificateController::class, 'update'])->whereNumber('node')->middleware('admin.can:nodes.certificate');
        Route::post('/{node}/certificate/push', [Admin\NodeCertificateController::class, 'push'])->whereNumber('node')->middleware('admin.can:nodes.certificate');
        Route::post('/{node}/certificate/enable', [Admin\NodeCertificateController::class, 'enableHttps'])->whereNumber('node')->middleware('admin.can:nodes.certificate');
    });

    // The people to choose an owner from, and the allocations of a node that are free: for the forms of servers.
    Route::get('/lookups/people', [Admin\ServersController::class, 'people'])->middleware('admin.can:users.view,servers.create,servers.update,roles.assign');
    Route::get('/nodes/{node}/free-allocations', [Admin\ServersController::class, 'freeAllocations'])->whereNumber('node')->middleware('admin.can:servers.create,servers.build,servers.transfer');

    Route::prefix('/servers')->group(function () {
        Route::get('/', [Admin\ServersController::class, 'index'])->middleware('admin.can:servers.view');
        Route::get('/form', [Admin\ServersController::class, 'form'])->middleware('admin.can:servers.create');
        Route::post('/', [Admin\ServersController::class, 'store'])->middleware('admin.can:servers.create');
        Route::get('/{serverId}', [Admin\ServersController::class, 'view'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::patch('/{serverId}', [Admin\ServersController::class, 'updateDetails'])->whereNumber('serverId')->middleware('admin.can:servers.update');
        Route::delete('/{serverId}', [Admin\ServersController::class, 'destroy'])->whereNumber('serverId')->middleware('admin.can:servers.delete');

        Route::get('/{serverId}/build', [Admin\ServerSettingsController::class, 'build'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::patch('/{serverId}/build', [Admin\ServerSettingsController::class, 'updateBuild'])->whereNumber('serverId')->middleware('admin.can:servers.build');
        Route::get('/{serverId}/startup', [Admin\ServerSettingsController::class, 'startup'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::patch('/{serverId}/startup', [Admin\ServerSettingsController::class, 'updateStartup'])->whereNumber('serverId')->middleware('admin.can:servers.startup');

        Route::get('/{serverId}/databases', [Admin\ServerExtrasController::class, 'databases'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::post('/{serverId}/databases', [Admin\ServerExtrasController::class, 'createDatabase'])->whereNumber('serverId')->middleware('admin.can:servers.databases');
        Route::patch('/{serverId}/databases/{database}', [Admin\ServerExtrasController::class, 'resetDatabasePassword'])->whereNumber(['serverId', 'database'])->middleware('admin.can:servers.databases');
        Route::delete('/{serverId}/databases/{database}', [Admin\ServerExtrasController::class, 'deleteDatabase'])->whereNumber(['serverId', 'database'])->middleware('admin.can:servers.databases');
        Route::get('/{serverId}/mounts', [Admin\ServerExtrasController::class, 'mounts'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::post('/{serverId}/mounts', [Admin\ServerExtrasController::class, 'addMount'])->whereNumber('serverId')->middleware('admin.can:servers.mounts');
        Route::delete('/{serverId}/mounts/{mount}', [Admin\ServerExtrasController::class, 'deleteMount'])->whereNumber(['serverId', 'mount'])->middleware('admin.can:servers.mounts');
        Route::get('/{serverId}/domains', [Admin\ServerExtrasController::class, 'domains'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::post('/{serverId}/domains', [Admin\ServerExtrasController::class, 'addDomain'])->whereNumber('serverId')->middleware('admin.can:servers.domains');
        Route::delete('/{serverId}/domains/{domain}', [Admin\ServerExtrasController::class, 'deleteDomain'])->whereNumber(['serverId', 'domain'])->middleware('admin.can:servers.domains');

        Route::get('/{serverId}/manage', [Admin\ServerManageController::class, 'view'])->whereNumber('serverId')->middleware('admin.can:servers.view');
        Route::post('/{serverId}/manage/reinstall', [Admin\ServerManageController::class, 'reinstall'])->whereNumber('serverId')->middleware('admin.can:servers.reinstall');
        Route::post('/{serverId}/manage/toggle', [Admin\ServerManageController::class, 'toggleInstall'])->whereNumber('serverId')->middleware('admin.can:servers.reinstall');
        Route::post('/{serverId}/manage/suspension', [Admin\ServerManageController::class, 'suspension'])->whereNumber('serverId')->middleware('admin.can:servers.suspend');
        Route::post('/{serverId}/manage/transfer', [Admin\ServerManageController::class, 'transfer'])->whereNumber('serverId')->middleware('admin.can:servers.transfer');
    });
});
