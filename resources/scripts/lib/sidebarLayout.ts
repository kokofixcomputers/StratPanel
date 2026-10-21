/**
 * The three sidebars of the panel as the theme editor lets an admin arrange them: inside a server (components/server/ServerSidebar.tsx), outside
 * of a server on the dashboard (components/dashboard/DashboardSidebar.tsx, can be left off) and inside the account pages
 * (components/dashboard/AccountSidebar.tsx). Each one is a list of categories (like "Manage" or "Configuration" in the admin area) with items in
 * them. Items can be hidden or moved to another category, categories can be added, renamed, moved and removed, and links of your own can be
 * put in a category. The settings are `sidebars` in the theme config.
 *
 * Items are named by a key: the path of a built in item ("/files"), or "extra:<id>" for a link of your own. A layout without categories
 * means the default ones.
 */
export type SidebarId = 'server' | 'dashboard' | 'account';

export interface SidebarExtra {
    id: string;
    label: string;
    // A path of the panel or an http(s) address.
    url: string;
    newTab: boolean;
}

export interface SidebarCategory {
    id: string;
    title: string;
    // The keys of the items in it, in order.
    items: string[];
}

export interface SidebarLayout {
    // Empty: the default categories of the sidebar.
    categories: SidebarCategory[];
    // Keys of built in items that are not shown.
    hidden: string[];
    extra: SidebarExtra[];
}

export interface DashboardSidebarLayout extends SidebarLayout {
    // The sidebar outside of servers is off unless an admin turns it on.
    enabled: boolean;
}

export interface SidebarsConfig {
    server: SidebarLayout;
    dashboard: DashboardSidebarLayout;
    account: SidebarLayout;
}

export const EMPTY_LAYOUT: SidebarLayout = { categories: [], hidden: [], extra: [] };

export const DEFAULT_SIDEBARS: SidebarsConfig = {
    server: EMPTY_LAYOUT,
    dashboard: { ...EMPTY_LAYOUT, enabled: false },
    account: EMPTY_LAYOUT,
};

export interface DefaultSidebar {
    title: string;
    // What the built in items are called, in the order they come.
    labels: Record<string, string>;
    categories: { id: string; title: string; keys: string[] }[];
}

/** What each sidebar has without any change. Items an extension adds are not here, they land in "More". */
export const SIDEBAR_DEFAULTS: Record<SidebarId, DefaultSidebar> = {
    server: {
        title: 'Inside a server',
        labels: {
            '/': 'Console',
            '/players': 'Players',
            '/versions': 'Versions',
            '/properties': 'Properties',
            '/mods': 'Content',
            '/worlds': 'Worlds',
            '/tools': 'Tools',
            '/files': 'Files',
            '/import': 'Importer',
            '/databases': 'Databases',
            '/schedules': 'Schedules',
            '/users': 'Users',
            '/backups': 'Backups',
            '/network': 'Network',
            '/domains': 'Domains',
            '/startup': 'Environment Variables',
            '/settings': 'Settings',
            '/activity': 'Activity',
        },
        categories: [
            { id: 'server', title: 'Server', keys: ['/', '/players'] },
            { id: 'minecraft', title: 'Minecraft', keys: ['/versions', '/properties', '/mods', '/worlds', '/tools'] },
            {
                id: 'manage',
                title: 'Manage',
                keys: ['/files', '/import', '/databases', '/schedules', '/backups', '/users'],
            },
            {
                id: 'configuration',
                title: 'Configuration',
                keys: ['/network', '/domains', '/startup', '/settings', '/activity'],
            },
        ],
    },
    dashboard: {
        title: 'Outside of servers',
        labels: { '/': 'Servers', '/create': 'Create a server', '/account': 'Account', '/admin': 'Admin area' },
        categories: [{ id: 'panel', title: 'Panel', keys: ['/', '/create', '/account', '/admin'] }],
    },
    account: {
        title: 'Account',
        labels: {
            '/': 'Account',
            '/api': 'API Credentials',
            '/ssh': 'SSH Keys',
            '/providers': 'Providers',
            '/passkeys': 'Passkeys',
            '/activity': 'Activity',
        },
        categories: [
            { id: 'account', title: 'Account', keys: ['/', '/api', '/ssh', '/providers', '/passkeys', '/activity'] },
        ],
    },
};

/** The default groups of the server sidebar, still used where only the titles and paths are needed. */
export const SIDEBAR_GROUPS = SIDEBAR_DEFAULTS.server.categories.map((c) => ({ title: c.title, paths: c.keys }));
export const SIDEBAR_LABELS = SIDEBAR_DEFAULTS.server.labels;

/** What an entry of a category is called when it is a link of your own. */
export const extraKey = (id: string): string => `extra:${id}`;

/** The categories as they are now: the layout's own, or the default ones made explicit so they can be edited. */
export const explicitCategories = (id: SidebarId, layout: SidebarLayout): SidebarCategory[] =>
    layout.categories.length > 0
        ? layout.categories
        : SIDEBAR_DEFAULTS[id].categories.map((c) => ({ id: c.id, title: c.title, items: [...c.keys] }));

export interface ResolvedEntry {
    key: string;
    extra?: SidebarExtra;
}

export interface ResolvedCategory {
    id: string;
    title: string;
    entries: ResolvedEntry[];
}

/**
 * What a sidebar shows. `available` are the keys of the built in items that exist for this person right now (an item that needs a permission
 * is not there without it). Hidden ones are left out, the ones the layout does not place come last in "More" so that a new page of an
 * extension shows up instead of vanishing, and categories with nothing in them are not drawn.
 */
export const resolveSidebar = (id: SidebarId, layout: SidebarLayout, available: string[]): ResolvedCategory[] => {
    const have = new Set(available);
    const extras = new Map(layout.extra.map((e) => [e.id, e]));
    const placed = new Set<string>();
    const out: ResolvedCategory[] = [];

    for (const category of explicitCategories(id, layout)) {
        const entries: ResolvedEntry[] = [];
        for (const key of category.items) {
            placed.add(key);
            if (key.startsWith('extra:')) {
                const extra = extras.get(key.slice(6));
                if (extra) entries.push({ key, extra });
            } else if (have.has(key) && !layout.hidden.includes(key)) {
                entries.push({ key });
            }
        }
        if (entries.length > 0) out.push({ id: category.id, title: category.title, entries });
    }

    const rest = available.filter((key) => !placed.has(key) && !layout.hidden.includes(key));
    if (rest.length > 0) out.push({ id: 'more', title: 'More', entries: rest.map((key) => ({ key })) });

    return out;
};

/**
 * Settings saved before the sidebars were three: the server sidebar had an order, hidden items and links that belonged to one of the four
 * groups. They become categories of the server sidebar.
 */
export const migrateServerSidebar = (old: {
    order?: string[];
    hidden?: string[];
    extra?: (SidebarExtra & { group?: string })[];
}): SidebarLayout => {
    const order = old.order ?? [];
    const rank = (key: string, fallback: number) => {
        const at = order.indexOf(key);

        return at === -1 ? order.length + fallback : at;
    };
    const extras = old.extra ?? [];

    return {
        hidden: old.hidden ?? [],
        extra: extras.map(({ id, label, url, newTab }) => ({ id, label, url, newTab })),
        categories: SIDEBAR_DEFAULTS.server.categories.map((category) => {
            const keys = [
                ...category.keys,
                ...extras.filter((e) => e.group === category.title).map((e) => extraKey(e.id)),
            ];

            return {
                id: category.id,
                title: category.title,
                items: keys
                    .map((key, index) => ({ key, at: rank(key, index) }))
                    .sort((a, b) => a.at - b.at)
                    .map(({ key }) => key),
            };
        }),
    };
};

/** Fills in what a link of your own may hold: {id} and {uuid} stand for the server. */
export const fillUrl = (url: string, server: { id: string; uuid: string }): string =>
    url.replace(/\{id\}/g, server.id).replace(/\{uuid\}/g, server.uuid);

/** Only a path of the panel or an http(s) address is a link, anything else (javascript:) is not. */
export const safeUrl = (url: string): boolean => /^(\/(?!\/)|https?:\/\/)[^\s<>"']*$/.test(url);
