/**
 * The pages of the admin area: what the sidebar lists, the permission each needs and which of them are part of this app. A page that
 * is not part of the app yet is still listed (it is a normal link, the server answers with its own page), so nothing disappears
 * while the pages are moved over one by one.
 */
import React from 'react';
import {
    CloudDownloadIcon,
    CogIcon,
    CollectionIcon,
    DatabaseIcon,
    GlobeIcon,
    HomeIcon,
    KeyIcon,
    PuzzleIcon,
    ServerIcon,
    ShieldCheckIcon,
    UsersIcon,
    ViewGridIcon,
    ChipIcon,
} from '@heroicons/react/solid';

export type AdminGroup = 'main' | 'infrastructure' | 'management';

export interface AdminPageInfo {
    key: string;
    // The address of the page inside the admin area, '' is the first page.
    path: string;
    name: string;
    // Any one of these opens the page, 'root' is for root admins only.
    permissions: string[];
    group: AdminGroup;
    icon: React.ComponentType<{ className?: string }>;
    // Part of this app: a link inside the app. Otherwise a plain link to the page the server draws.
    ported: boolean;
}

export const GROUPS: { id: AdminGroup; title: string | null }[] = [
    { id: 'main', title: null },
    { id: 'infrastructure', title: 'Infrastructure' },
    { id: 'management', title: 'Management' },
];

export const SETTINGS_PERMISSIONS = [
    'settings.general.view',
    'settings.branding.view',
    'settings.authentication.view',
    'settings.providers.view',
    'settings.curseforge.view',
    'settings.domains.view',
    'settings.pools.view',
    'settings.trash.view',
    'settings.certificates.view',
    'settings.mail.view',
    'settings.advanced.view',
];

export const PAGES: AdminPageInfo[] = [
    {
        key: 'overview',
        path: '',
        name: 'Overview',
        permissions: ['overview.view'],
        group: 'main',
        icon: HomeIcon,
        ported: true,
    },
    {
        key: 'settings',
        path: '/settings',
        name: 'Settings',
        permissions: SETTINGS_PERMISSIONS,
        group: 'main',
        icon: CogIcon,
        ported: false,
    },
    {
        key: 'api',
        path: '/api',
        name: 'Application API',
        permissions: ['root'],
        group: 'main',
        icon: KeyIcon,
        ported: true,
    },
    {
        key: 'updates',
        path: '/updates',
        name: 'Updates',
        permissions: ['root'],
        group: 'main',
        icon: CloudDownloadIcon,
        ported: true,
    },
    {
        key: 'databases',
        path: '/databases',
        name: 'Databases',
        permissions: ['databases.view'],
        group: 'infrastructure',
        icon: DatabaseIcon,
        ported: true,
    },
    {
        key: 'locations',
        path: '/locations',
        name: 'Locations',
        permissions: ['locations.view'],
        group: 'infrastructure',
        icon: GlobeIcon,
        ported: true,
    },
    {
        key: 'nodes',
        path: '/nodes',
        name: 'Nodes',
        permissions: ['nodes.view'],
        group: 'infrastructure',
        icon: ChipIcon,
        ported: false,
    },
    {
        key: 'servers',
        path: '/servers',
        name: 'Servers',
        permissions: ['servers.view'],
        group: 'management',
        icon: ServerIcon,
        ported: false,
    },
    {
        key: 'users',
        path: '/users',
        name: 'Users',
        permissions: ['users.view'],
        group: 'management',
        icon: UsersIcon,
        ported: true,
    },
    {
        key: 'roles',
        path: '/roles',
        name: 'Roles',
        permissions: ['roles.view'],
        group: 'management',
        icon: ShieldCheckIcon,
        ported: true,
    },
    {
        key: 'mounts',
        path: '/mounts',
        name: 'Mounts',
        permissions: ['mounts.view'],
        group: 'management',
        icon: CollectionIcon,
        ported: true,
    },
    {
        key: 'nests',
        path: '/nests',
        name: 'Nests',
        permissions: ['nests.view'],
        group: 'management',
        icon: ViewGridIcon,
        ported: false,
    },
    {
        key: 'extensions',
        path: '/extensions',
        name: 'Extensions',
        permissions: ['extensions.view'],
        group: 'management',
        icon: PuzzleIcon,
        ported: true,
    },
];

/** Whether somebody with these permissions (and this root flag) may open a page. */
export const allowed = (page: Pick<AdminPageInfo, 'permissions'>, permissions: string[], root: boolean): boolean =>
    page.permissions.includes('root') ? root : root || page.permissions.some((p) => permissions.includes(p));

/** The address of a page of the admin area. */
export const adminUrl = (path = ''): string => `/admin${path}`;

/** The first page somebody may open, for those whose roles have no overview. */
export const firstPage = (permissions: string[], root: boolean): AdminPageInfo | undefined =>
    PAGES.find((page) => allowed(page, permissions, root));
