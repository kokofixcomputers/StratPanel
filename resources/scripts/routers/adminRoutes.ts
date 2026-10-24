import React, { lazy } from 'react';

export interface AdminRoute {
    path: string;
    // Any one of these permissions opens it ('root' for root admins only).
    permissions: string[];
    component: React.LazyExoticComponent<React.ComponentType>;
}

const OverviewPage = lazy(
    () => import(/* webpackChunkName: "admin-overview" */ '@/components/admin/pages/OverviewPage')
);
const RolesPage = lazy(() => import(/* webpackChunkName: "admin-roles" */ '@/components/admin/pages/roles/RolesPage'));
const RoleEditor = lazy(
    () => import(/* webpackChunkName: "admin-roles" */ '@/components/admin/pages/roles/RoleEditor')
);
const LocationsPage = lazy(
    () => import(/* webpackChunkName: "admin-locations" */ '@/components/admin/pages/locations/LocationsPage')
);
const LocationPage = lazy(
    () => import(/* webpackChunkName: "admin-locations" */ '@/components/admin/pages/locations/LocationPage')
);

/**
 * The pages of the admin area that are part of this app. A page is added here when its Blade view is gone, the route that serves it in
 * routes/admin.php answers with the app (Admin\SpaController) instead.
 */
const DatabasesPage = lazy(
    () => import(/* webpackChunkName: "admin-databases" */ '@/components/admin/pages/databases/DatabasesPage')
);
const DatabaseHostPage = lazy(
    () => import(/* webpackChunkName: "admin-databases" */ '@/components/admin/pages/databases/DatabaseHostPage')
);

const MountsPage = lazy(
    () => import(/* webpackChunkName: "admin-mounts" */ '@/components/admin/pages/mounts/MountsPage')
);
const MountPage = lazy(
    () => import(/* webpackChunkName: "admin-mounts" */ '@/components/admin/pages/mounts/MountPage')
);

const UsersPage = lazy(() => import(/* webpackChunkName: "admin-users" */ '@/components/admin/pages/users/UsersPage'));
const UserEditor = lazy(
    () => import(/* webpackChunkName: "admin-users" */ '@/components/admin/pages/users/UserEditor')
);

const ApiKeysPage = lazy(() => import(/* webpackChunkName: "admin-api" */ '@/components/admin/pages/api/ApiKeysPage'));
const ApiKeyNewPage = lazy(
    () => import(/* webpackChunkName: "admin-api" */ '@/components/admin/pages/api/ApiKeyNewPage')
);
const ExtensionsPage = lazy(
    () => import(/* webpackChunkName: "admin-extensions" */ '@/components/admin/pages/extensions/ExtensionsPage')
);
const ExtensionSettingsPage = lazy(
    () => import(/* webpackChunkName: "admin-extensions" */ '@/components/admin/pages/extensions/ExtensionSettingsPage')
);
const UpdatesPage = lazy(
    () => import(/* webpackChunkName: "admin-updates" */ '@/components/admin/pages/updates/UpdatesPage')
);

export const ADMIN_ROUTES: AdminRoute[] = [
    { path: '/admin', permissions: ['overview.view'], component: OverviewPage },
    { path: '/admin/roles', permissions: ['roles.view'], component: RolesPage },
    { path: '/admin/roles/new', permissions: ['roles.create'], component: RoleEditor },
    { path: '/admin/roles/view/:id', permissions: ['roles.view'], component: RoleEditor },
    { path: '/admin/databases', permissions: ['databases.view'], component: DatabasesPage },
    { path: '/admin/databases/view/:id', permissions: ['databases.view'], component: DatabaseHostPage },
    { path: '/admin/mounts', permissions: ['mounts.view'], component: MountsPage },
    { path: '/admin/mounts/view/:id', permissions: ['mounts.view'], component: MountPage },
    { path: '/admin/users', permissions: ['users.view'], component: UsersPage },
    { path: '/admin/users/new', permissions: ['users.create'], component: UserEditor },
    { path: '/admin/users/view/:id', permissions: ['users.view'], component: UserEditor },
    { path: '/admin/api', permissions: ['root'], component: ApiKeysPage },
    { path: '/admin/api/new', permissions: ['root'], component: ApiKeyNewPage },
    { path: '/admin/extensions', permissions: ['extensions.view'], component: ExtensionsPage },
    { path: '/admin/extensions/:id/settings', permissions: ['extensions.view'], component: ExtensionSettingsPage },
    { path: '/admin/updates', permissions: ['root'], component: UpdatesPage },
    { path: '/admin/locations', permissions: ['locations.view'], component: LocationsPage },
    { path: '/admin/locations/view/:id', permissions: ['locations.view'], component: LocationPage },
];

export const PORTED_PATTERNS = ADMIN_ROUTES.map((route) => route.path);
