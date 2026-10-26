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

const SettingsGeneralPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/GeneralPage')
);
const SettingsAdvancedPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/AdvancedPage')
);
const SettingsMailPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/MailPage')
);
const SettingsTrashPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/TrashPage')
);
const SettingsPoolsPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/PoolsPage')
);
const SettingsCurseForgePage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/CurseForgePage')
);
const SettingsAuthenticationPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/AuthenticationPage')
);
const SettingsBrandingPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/BrandingPage')
);
const SettingsProvidersPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/ProvidersPage')
);
const SettingsProviderPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/ProviderPage')
);
const SettingsDomainsPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/DomainsPage')
);
const SettingsDomainZonePage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/DomainZonePage')
);
const SettingsTunnelsPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/TunnelsPage')
);
const SettingsBackupsPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/BackupsPage')
);
const SettingsCertificatesPage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/CertificatesPage')
);
const SettingsCertificatePage = lazy(
    () => import(/* webpackChunkName: "admin-settings" */ '@/components/admin/pages/settings/CertificatePage')
);

const NestsPage = lazy(() => import(/* webpackChunkName: "admin-nests" */ '@/components/admin/pages/nests/NestsPage'));
const NestPage = lazy(() => import(/* webpackChunkName: "admin-nests" */ '@/components/admin/pages/nests/NestPage'));
const EggEditor = lazy(() => import(/* webpackChunkName: "admin-nests" */ '@/components/admin/pages/nests/EggEditor'));
const EggVariablesPage = lazy(
    () => import(/* webpackChunkName: "admin-nests" */ '@/components/admin/pages/nests/EggVariablesPage')
);
const EggScriptPage = lazy(
    () => import(/* webpackChunkName: "admin-nests" */ '@/components/admin/pages/nests/EggScriptPage')
);

const NodesPage = lazy(() => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodesPage'));
const NodeCreatePage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeCreatePage')
);
const NodePage = lazy(() => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodePage'));
const NodeSettingsPage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeSettingsPage')
);
const NodeConfigurationPage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeConfigurationPage')
);
const NodeCertificatePage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeCertificatePage')
);
const NodeAllocationsPage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeAllocationsPage')
);
const NodeServersPage = lazy(
    () => import(/* webpackChunkName: "admin-nodes" */ '@/components/admin/pages/nodes/NodeServersPage')
);

const ServersPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServersPage')
);
const ServerCreatePage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerCreatePage')
);
const ServerPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerPage')
);
const ServerDetailsPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerDetailsPage')
);
const ServerBuildPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerBuildPage')
);
const ServerStartupPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerStartupPage')
);
const ServerDatabasesPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerDatabasesPage')
);
const ServerMountsPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerMountsPage')
);
const ServerDomainsPage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerDomainsPage')
);
const ServerManagePage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerManagePage')
);
const ServerDeletePage = lazy(
    () => import(/* webpackChunkName: "admin-servers" */ '@/components/admin/pages/servers/ServerDeletePage')
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
    { path: '/admin/settings', permissions: ['settings.general.view'], component: SettingsGeneralPage },
    { path: '/admin/settings/branding', permissions: ['settings.branding.view'], component: SettingsBrandingPage },
    {
        path: '/admin/settings/authentication',
        permissions: ['settings.authentication.view'],
        component: SettingsAuthenticationPage,
    },
    { path: '/admin/settings/providers', permissions: ['settings.providers.view'], component: SettingsProvidersPage },
    {
        path: '/admin/settings/providers/new',
        permissions: ['settings.providers.update'],
        component: SettingsProviderPage,
    },
    {
        path: '/admin/settings/providers/:id',
        permissions: ['settings.providers.view'],
        component: SettingsProviderPage,
    },
    {
        path: '/admin/settings/curseforge',
        permissions: ['settings.curseforge.view'],
        component: SettingsCurseForgePage,
    },
    { path: '/admin/settings/domains', permissions: ['settings.domains.view'], component: SettingsDomainsPage },
    {
        path: '/admin/settings/domains/new',
        permissions: ['settings.domains.update'],
        component: SettingsDomainZonePage,
    },
    {
        path: '/admin/settings/domains/zones/:id',
        permissions: ['settings.domains.view'],
        component: SettingsDomainZonePage,
    },
    { path: '/admin/settings/pools', permissions: ['settings.pools.view'], component: SettingsPoolsPage },
    { path: '/admin/settings/trash', permissions: ['settings.trash.view'], component: SettingsTrashPage },
    { path: '/admin/settings/tunnels', permissions: ['settings.tunnels.view'], component: SettingsTunnelsPage },
    { path: '/admin/settings/backups', permissions: ['settings.backups.view'], component: SettingsBackupsPage },
    {
        path: '/admin/settings/certificates',
        permissions: ['settings.certificates.view'],
        component: SettingsCertificatesPage,
    },
    {
        path: '/admin/settings/certificates/:id',
        permissions: ['settings.certificates.view'],
        component: SettingsCertificatePage,
    },
    { path: '/admin/settings/mail', permissions: ['settings.mail.view'], component: SettingsMailPage },
    { path: '/admin/settings/advanced', permissions: ['settings.advanced.view'], component: SettingsAdvancedPage },
    { path: '/admin/nests', permissions: ['nests.view'], component: NestsPage },
    { path: '/admin/nests/view/:id', permissions: ['nests.view'], component: NestPage },
    { path: '/admin/nests/egg/new', permissions: ['eggs.create'], component: EggEditor },
    { path: '/admin/nests/egg/:id', permissions: ['nests.view'], component: EggEditor },
    { path: '/admin/nests/egg/:id/variables', permissions: ['nests.view'], component: EggVariablesPage },
    { path: '/admin/nests/egg/:id/scripts', permissions: ['nests.view'], component: EggScriptPage },
    { path: '/admin/nodes', permissions: ['nodes.view'], component: NodesPage },
    { path: '/admin/nodes/new', permissions: ['nodes.create'], component: NodeCreatePage },
    { path: '/admin/nodes/view/:id', permissions: ['nodes.view'], component: NodePage },
    { path: '/admin/nodes/view/:id/settings', permissions: ['nodes.view'], component: NodeSettingsPage },
    {
        path: '/admin/nodes/view/:id/configuration',
        permissions: ['nodes.configuration'],
        component: NodeConfigurationPage,
    },
    { path: '/admin/nodes/view/:id/certificate', permissions: ['nodes.view'], component: NodeCertificatePage },
    { path: '/admin/nodes/view/:id/allocation', permissions: ['nodes.view'], component: NodeAllocationsPage },
    { path: '/admin/nodes/view/:id/servers', permissions: ['nodes.view'], component: NodeServersPage },
    { path: '/admin/servers', permissions: ['servers.view'], component: ServersPage },
    { path: '/admin/servers/new', permissions: ['servers.create'], component: ServerCreatePage },
    { path: '/admin/servers/view/:id', permissions: ['servers.view'], component: ServerPage },
    { path: '/admin/servers/view/:id/details', permissions: ['servers.view'], component: ServerDetailsPage },
    { path: '/admin/servers/view/:id/build', permissions: ['servers.view'], component: ServerBuildPage },
    { path: '/admin/servers/view/:id/startup', permissions: ['servers.view'], component: ServerStartupPage },
    { path: '/admin/servers/view/:id/database', permissions: ['servers.view'], component: ServerDatabasesPage },
    { path: '/admin/servers/view/:id/mounts', permissions: ['servers.view'], component: ServerMountsPage },
    { path: '/admin/servers/view/:id/domains', permissions: ['servers.view'], component: ServerDomainsPage },
    { path: '/admin/servers/view/:id/manage', permissions: ['servers.view'], component: ServerManagePage },
    { path: '/admin/servers/view/:id/delete', permissions: ['servers.delete'], component: ServerDeletePage },
    { path: '/admin/api', permissions: ['root'], component: ApiKeysPage },
    { path: '/admin/api/new', permissions: ['root'], component: ApiKeyNewPage },
    { path: '/admin/extensions', permissions: ['extensions.view'], component: ExtensionsPage },
    { path: '/admin/extensions/:id/settings', permissions: ['extensions.view'], component: ExtensionSettingsPage },
    { path: '/admin/updates', permissions: ['root'], component: UpdatesPage },
    { path: '/admin/locations', permissions: ['locations.view'], component: LocationsPage },
    { path: '/admin/locations/view/:id', permissions: ['locations.view'], component: LocationPage },
];

export const PORTED_PATTERNS = ADMIN_ROUTES.map((route) => route.path);
