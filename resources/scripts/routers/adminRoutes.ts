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
export const ADMIN_ROUTES: AdminRoute[] = [
    { path: '/admin', permissions: ['overview.view'], component: OverviewPage },
    { path: '/admin/roles', permissions: ['roles.view'], component: RolesPage },
    { path: '/admin/roles/new', permissions: ['roles.create'], component: RoleEditor },
    { path: '/admin/roles/view/:id', permissions: ['roles.view'], component: RoleEditor },
    { path: '/admin/locations', permissions: ['locations.view'], component: LocationsPage },
    { path: '/admin/locations/view/:id', permissions: ['locations.view'], component: LocationPage },
];

export const PORTED_PATTERNS = ADMIN_ROUTES.map((route) => route.path);
