<?php

namespace Pterodactyl\Services\Palette;

use Illuminate\Support\Facades\Route;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Roles\AdminNavigation;

/**
 * The pages and actions of the admin area the search box offers, so the box on the dashboard (React) and on the admin pages
 * (plain JavaScript) show the same list. Only what the user may open is in it: the same permissions as the routes themselves.
 */
final class AdminDestinations
{
    /**
     * [permission ("root" for root admins only), route name, label, kind (page or action), search words]
     */
    public const ITEMS = [
        ['overview.view', 'admin.index', 'Overview', 'page', 'admin home dashboard stats'],
        ['servers.view', 'admin.servers', 'Servers', 'page', 'list all servers manage'],
        ['users.view', 'admin.users', 'Users', 'page', 'accounts people members'],
        ['nodes.view', 'admin.nodes', 'Nodes', 'page', 'wings daemons machines'],
        ['locations.view', 'admin.locations', 'Locations', 'page', 'regions datacenters'],
        ['databases.view', 'admin.databases', 'Database hosts', 'page', 'mysql mariadb'],
        ['roles.view', 'admin.roles', 'Roles', 'page', 'permissions staff admin'],
        ['mounts.view', 'admin.mounts', 'Mounts', 'page', 'folders shared'],
        ['nests.view', 'admin.nests', 'Nests and eggs', 'page', 'eggs software templates'],
        ['extensions.view', 'admin.extensions', 'Extensions', 'page', 'plugins addons stratext'],
        ['root', 'admin.api.index', 'Application API keys', 'page', 'tokens credentials'],
        ['root', 'admin.updates', 'Updates', 'page', 'update upgrade version panel router edge wings nightly release'],
        ['settings.general.view', 'admin.settings', 'Settings: General', 'page', 'name company title'],
        ['settings.branding.view', 'admin.settings.branding', 'Settings: Branding', 'page', 'logo favicon colors links theme'],
        ['settings.authentication.view', 'admin.settings.authentication', 'Settings: Sign in', 'page', 'login captcha registration signup 2fa'],
        ['settings.providers.view', 'admin.settings.providers', 'Settings: Sign-in providers', 'page', 'oauth github discord google sso'],
        ['settings.curseforge.view', 'admin.settings.curseforge', 'Settings: CurseForge', 'page', 'api key mods'],
        ['settings.domains.view', 'admin.settings.domains', 'Settings: Domains', 'page', 'subdomain dns cloudflare custom domain zones'],
        ['settings.trash.view', 'admin.settings.trash', 'Settings: Trash bin', 'page', 'deleted files retention'],
        ['settings.certificates.view', 'admin.settings.certificates', 'Settings: Certificates', 'page', 'https ssl tls lets encrypt'],
        ['settings.mail.view', 'admin.settings.mail', 'Settings: Mail', 'page', 'smtp email'],
        ['settings.advanced.view', 'admin.settings.advanced', 'Settings: Advanced', 'page', 'recaptcha timeouts'],
        ['servers.create', 'admin.servers.new', 'Create a server', 'action', 'new add'],
        ['users.create', 'admin.users.new', 'Create a user', 'action', 'new add account'],
        ['nodes.create', 'admin.nodes.new', 'Add a node', 'action', 'new create wings'],
        ['roles.create', 'admin.roles.new', 'Create a role', 'action', 'new add permissions'],
        ['nests.create', 'admin.nests.new', 'Create a nest', 'action', 'new add'],
        ['eggs.create', 'admin.nests.egg.new', 'Create an egg', 'action', 'new add software'],
        ['root', 'admin.api.new', 'Create an application API key', 'action', 'new token'],
        ['settings.domains.update', 'admin.settings.domains.new', 'Add a domain people can take a name under', 'action', 'subdomain dns cloudflare zone new'],
        ['settings.providers.update', 'admin.settings.providers.new', 'Add a sign-in provider', 'action', 'new oauth github discord'],
        ['root', 'admin.updates', 'Update the panel', 'action', 'update upgrade install nightly release restart'],
        ['root', 'admin.updates', 'Restore a panel backup', 'action', 'undo rollback revert restore backups'],
        ['root', 'admin.updates', 'Update the router and edge', 'action', 'update mc-router panel-edge'],
        ['nodes.view', 'admin.nodes', 'Update Wings on a node', 'action', 'update upgrade wings daemon'],
    ];

    /**
     * @return array<int, array{id: string, label: string, url: string, kind: string, words: string}>
     */
    public static function for(User $user): array
    {
        $items = [];
        foreach (self::ITEMS as $i => [$permission, $route, $label, $kind, $words]) {
            if (!Route::has($route) || !AdminNavigation::allows($user, $permission)) {
                continue;
            }
            $items[] = ['id' => 'admin:' . $i, 'label' => $label, 'url' => route($route, [], false), 'kind' => $kind, 'words' => $words];
        }

        return $items;
    }
}
