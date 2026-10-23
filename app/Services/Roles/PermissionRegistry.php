<?php

namespace Pterodactyl\Services\Roles;

/**
 * Every permission a role can hold, grouped the way the role editor shows them. A permission is "<group>.<action>" (the actions of a
 * settings page are "<page>.view" and "<page>.update", so "settings.mail.update").
 *
 * Root admins are not listed here: they pass every check without holding anything.
 *
 * The "view" of a group is what lets somebody see its pages, every other permission of a group needs it, so holding "servers.delete"
 * holds "servers.view" too (see normalize()).
 */
final class PermissionRegistry
{
    /** The part of the panel that is for somebody with a role that has an "admin" permission: the permissions of the sidebar. */
    public const OVERVIEW = 'overview.view';

    /**
     * @var array<string, array{label: string, description: string, permissions: array<string, string>}>
     */
    private const GROUPS = [
        'overview' => [
            'label' => 'Overview',
            'description' => 'The first page of the admin area, with totals, node usage and recent activity.',
            'permissions' => [
                'overview.view' => 'See the overview',
            ],
        ],
        'users' => [
            'label' => 'Users',
            'description' => 'Accounts of the panel. Root admins can not be changed by anybody else, and nobody can change an account that holds permissions they do not hold themselves.',
            'permissions' => [
                'users.view' => 'See users and their details',
                'users.create' => 'Create users',
                'users.update' => 'Change users (name, email, password, language)',
                'users.delete' => 'Delete users',
            ],
        ],
        'roles' => [
            'label' => 'Roles',
            'description' => 'Roles and who has them. Roles can only hold, grant and be given with permissions the person doing it holds too.',
            'permissions' => [
                'roles.view' => 'See roles and their members',
                'roles.create' => 'Create roles',
                'roles.update' => 'Change roles (name and permissions)',
                'roles.delete' => 'Delete roles',
                'roles.assign' => 'Give roles to users and take them away',
            ],
        ],
        'servers' => [
            'label' => 'Servers',
            'description' => 'Servers on the nodes, in the admin area.',
            'permissions' => [
                'servers.view' => 'See servers and their details',
                'servers.create' => 'Create servers',
                'servers.update' => 'Change details (name, owner, description)',
                'servers.build' => 'Change the build (resources, limits, allocations)',
                'servers.startup' => 'Change startup (command, variables, image)',
                'servers.databases' => 'Create and delete databases of a server',
                'servers.mounts' => 'Add and remove mounts of a server',
                'servers.domains' => 'Add and remove domains of a server',
                'servers.reinstall' => 'Reinstall a server and change its install status',
                'servers.suspend' => 'Suspend and unsuspend a server',
                'servers.transfer' => 'Transfer a server to another node',
                'servers.delete' => 'Delete servers',
                'servers.access' => 'Open every server in the panel with full control, like its owner',
            ],
        ],
        'nodes' => [
            'label' => 'Nodes',
            'description' => 'The machines servers run on.',
            'permissions' => [
                'nodes.view' => 'See nodes, their servers and system information',
                'nodes.create' => 'Create nodes',
                'nodes.update' => 'Change node settings',
                'nodes.configuration' => 'See the configuration and make deployment tokens of a node',
                'nodes.certificate' => 'Choose the https certificate of a node and give it to the node (this sends the private key to the node)',
                'nodes.software' => 'Update the Wings software of nodes (they restart Wings; servers keep running)',
                'nodes.allocations' => 'Create, change and remove allocations',
                'nodes.delete' => 'Delete nodes',
            ],
        ],
        'locations' => [
            'label' => 'Locations',
            'description' => 'Where nodes are.',
            'permissions' => [
                'locations.view' => 'See locations',
                'locations.create' => 'Create locations',
                'locations.update' => 'Change locations',
                'locations.delete' => 'Delete locations',
            ],
        ],
        'databases' => [
            'label' => 'Database hosts',
            'description' => 'The database servers that servers get their databases from.',
            'permissions' => [
                'databases.view' => 'See database hosts',
                'databases.create' => 'Add database hosts',
                'databases.update' => 'Change database hosts',
                'databases.delete' => 'Remove database hosts',
            ],
        ],
        'nests' => [
            'label' => 'Nests and eggs',
            'description' => 'The kinds of servers that can be made.',
            'permissions' => [
                'nests.view' => 'See nests and eggs',
                'nests.create' => 'Create nests',
                'nests.update' => 'Change nests',
                'nests.delete' => 'Delete nests',
                'eggs.create' => 'Create eggs',
                'eggs.update' => 'Change eggs, their variables and scripts',
                'eggs.delete' => 'Delete eggs',
                'eggs.import' => 'Import and update eggs from files',
                'eggs.export' => 'Export eggs to files',
            ],
        ],
        'mounts' => [
            'label' => 'Mounts',
            'description' => 'Folders of a node that servers can use.',
            'permissions' => [
                'mounts.view' => 'See mounts',
                'mounts.create' => 'Create mounts',
                'mounts.update' => 'Change mounts, their eggs and nodes',
                'mounts.delete' => 'Delete mounts',
            ],
        ],
        'extensions' => [
            'label' => 'Extensions',
            'description' => 'Extensions run PHP as part of the panel; installing them is done on the command line.',
            'permissions' => [
                'extensions.view' => 'See extensions and their problems',
                'extensions.manage' => 'Switch extensions on and off and change their settings',
            ],
        ],
        'settings' => [
            'label' => 'Settings',
            'description' => 'Settings of the panel. Mail, authentication and providers hold secrets: changing them can lock people out or send mail on behalf of the panel.',
            'permissions' => [
                'settings.general.view' => 'See general settings',
                'settings.general.update' => 'Change general settings',
                'settings.branding.view' => 'See branding',
                'settings.branding.update' => 'Change branding, announcements and links',
                'settings.mail.view' => 'See mail settings',
                'settings.mail.update' => 'Change mail settings and send test mails',
                'settings.authentication.view' => 'See the captcha, passkey and sign up settings',
                'settings.authentication.update' => 'Change the captcha, passkey and sign up settings',
                'settings.providers.view' => 'See sign in providers',
                'settings.providers.update' => 'Add, change and remove sign in providers',
                'settings.certificates.view' => 'See the certificates the panel is served with (never their private keys)',
                'settings.certificates.update' => 'Add, replace and delete certificates and their private keys',
                'settings.domains.view' => 'See how people get a domain, and the domains of the panel (never their DNS keys)',
                'settings.domains.update' => 'Allow or stop people bringing their own domain, add and remove the domains people can take a name under, and their DNS keys',
                'settings.pools.view' => 'See the resource pool settings',
                'settings.pools.update' => 'Turn resource pools on and off and change what people get',
                'settings.trash.view' => 'See the trash bin settings',
                'settings.trash.update' => 'Turn the trash bin on and off and change how long it keeps things',
                'settings.curseforge.view' => 'See the CurseForge settings',
                'settings.curseforge.update' => 'Change the CurseForge key',
                'settings.advanced.view' => 'See advanced settings',
                'settings.advanced.update' => 'Change advanced settings',
            ],
        ],
    ];

    /**
     * What every account may do without a role (as far as the panel allows it), and a role can take away or, where the panel has a switch
     * for it, allow. These are not admin permissions: they never open the admin area.
     *
     * @var array<string, string>
     */
    private const USER = [
        'self.servers.create' => 'Create a server for themselves (the self service of the dashboard; "grant" works when the panel has it switched off)',
        'self.domains.add' => 'Add domains to their servers',
        'self.api_keys.create' => 'Create API keys for their account',
        'self.ssh_keys.create' => 'Add SSH keys to their account',
    ];

    /** @return array<string, string> the permissions of everybody, see USER */
    public static function user(): array
    {
        return self::USER;
    }

    /** Whether this is a permission of everybody (not an admin one). */
    public static function isUser(string $permission): bool
    {
        return isset(self::USER[$permission]);
    }

    /** @return list<string> the keys that can be denied or granted by a role: the admin ones and the ones of everybody */
    public static function known(): array
    {
        return array_merge(self::all(), array_keys(self::USER));
    }

    /**
     * The permissions a role denies: known ones only, in the order of the registry. Unlike a grant, a denial brings nothing else with it
     * (denying the "view" of a group is handled where it is checked).
     *
     * @param  iterable<mixed>  $permissions
     * @return list<string>
     */
    public static function normalizeDenied(iterable $permissions): array
    {
        $given = [];
        foreach ($permissions as $permission) {
            if (is_string($permission) && (self::exists($permission) || self::isUser($permission))) {
                $given[$permission] = true;
            }
        }

        return array_values(array_filter(self::known(), fn (string $key) => isset($given[$key])));
    }

    /** @return array<string, array{label: string, description: string, permissions: array<string, string>}> */
    public static function groups(): array
    {
        return self::GROUPS;
    }

    /** @return list<string> every permission key */
    public static function all(): array
    {
        $keys = [];
        foreach (self::GROUPS as $group) {
            array_push($keys, ...array_keys($group['permissions']));
        }

        return $keys;
    }

    public static function exists(string $permission): bool
    {
        return in_array($permission, self::all(), true);
    }

    public static function label(string $permission): ?string
    {
        foreach (self::GROUPS as $group) {
            if (isset($group['permissions'][$permission])) {
                return $group['permissions'][$permission];
            }
        }

        return null;
    }

    /**
     * What a list of permissions comes to: only known ones, every permission of a group with the "view" of that group, no duplicates
     * and in the order of the registry.
     *
     * @param  iterable<mixed>  $permissions
     * @return list<string>
     */
    public static function normalize(iterable $permissions): array
    {
        $given = [];
        foreach ($permissions as $permission) {
            if (is_string($permission) && (self::exists($permission) || self::isUser($permission))) {
                $given[$permission] = true;
            }
        }

        // The "view" a permission of its group needs. The settings pages are groups of their own: "settings.mail.update" needs
        // "settings.mail.view".
        foreach (array_keys($given) as $permission) {
            $view = self::viewOf($permission);
            if ($view !== null) {
                $given[$view] = true;
            }
        }

        return array_values(array_filter(self::known(), fn (string $key) => isset($given[$key])));
    }

    /** The "view" permission that comes with another one, null when it has none (or is one itself). */
    public static function viewOf(string $permission): ?string
    {
        if ($permission === 'servers.access' || str_ends_with($permission, '.view')) {
            return null;
        }

        $parts = explode('.', $permission);
        // settings.mail.update -> settings.mail.view, servers.delete -> servers.view, eggs.update -> nests.view
        $view = $parts[0] === 'settings' ? "settings.{$parts[1]}.view" : ($parts[0] === 'eggs' ? 'nests.view' : $parts[0] . '.view');

        return self::exists($view) ? $view : null;
    }
}
