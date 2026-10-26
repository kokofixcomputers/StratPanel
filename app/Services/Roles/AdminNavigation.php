<?php

namespace Pterodactyl\Services\Roles;

use Pterodactyl\Models\User;

/**
 * What the admin area shows a user, so the sidebar and the page they land on agree with what they may open.
 */
final class AdminNavigation
{
    /** The pages of Settings, in the order of its tabs: [permission, route name]. */
    private const SETTINGS = [
        ['settings.general.view', 'admin.settings'],
        ['settings.branding.view', 'admin.settings.branding'],
        ['settings.authentication.view', 'admin.settings.authentication'],
        ['settings.providers.view', 'admin.settings.providers'],
        ['settings.curseforge.view', 'admin.settings.curseforge'],
        ['settings.domains.view', 'admin.settings.domains'],
        ['settings.pools.view', 'admin.settings.pools'],
        ['settings.trash.view', 'admin.settings.trash'],
        ['settings.backups.view', 'admin.settings.backups'],
        ['settings.certificates.view', 'admin.settings.certificates'],
        ['settings.mail.view', 'admin.settings.mail'],
        ['settings.advanced.view', 'admin.settings.advanced'],
    ];

    /** The sections of the sidebar, in order: [permission (or "root"), route name]. */
    private const SECTIONS = [
        ['overview.view', 'admin.index'],
        ['databases.view', 'admin.databases'],
        ['locations.view', 'admin.locations'],
        ['nodes.view', 'admin.nodes'],
        ['servers.view', 'admin.servers'],
        ['users.view', 'admin.users'],
        ['roles.view', 'admin.roles'],
        ['mounts.view', 'admin.mounts'],
        ['nests.view', 'admin.nests'],
        ['extensions.view', 'admin.extensions'],
        ['root', 'admin.api.index'],
        ['root', 'admin.updates'],
    ];

    /** The first page of Settings the user may open, null when they may open none. */
    public static function settingsHome(User $user): ?string
    {
        foreach (self::SETTINGS as [$permission, $route]) {
            if ($user->hasPermission($permission)) {
                return $route;
            }
        }

        return null;
    }

    /** Whether any page of Settings is open to the user. */
    public static function hasSettings(User $user): bool
    {
        return self::settingsHome($user) !== null;
    }

    /** Whether the user may open the section of the sidebar behind this permission ("root" for what is only for root admins). */
    public static function allows(User $user, string $permission): bool
    {
        return $permission === 'root' ? (bool) $user->root_admin : $user->hasPermission($permission);
    }

    /** Where somebody who may not see the overview goes instead: the first page they may open. */
    public static function landingRoute(User $user): ?string
    {
        foreach (self::SECTIONS as [$permission, $route]) {
            if (self::allows($user, $permission)) {
                return $route;
            }
        }

        return self::settingsHome($user);
    }
}
