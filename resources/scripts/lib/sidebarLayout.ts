/**
 * The navigation of a server (components/server/ServerSidebar.tsx) as the theme editor lets an admin arrange it: items can be hidden, put
 * in another order inside their group, and links of your own can be added to a group. The settings are `sidebar` in the theme config.
 */
export interface SidebarGroup {
    title: string;
    paths: string[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
    { title: 'Server', paths: ['/', '/players'] },
    { title: 'Minecraft', paths: ['/versions', '/properties', '/mods', '/worlds', '/tools'] },
    { title: 'Manage', paths: ['/files', '/import', '/databases', '/schedules', '/backups', '/users'] },
    { title: 'Configuration', paths: ['/network', '/domains', '/startup', '/settings', '/activity'] },
];

/** The names of the built-in items, for the editor (the sidebar itself takes the names of the routes). */
export const SIDEBAR_LABELS: Record<string, string> = {
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
};

/** What an entry of the order list is called: the path of an item, or "extra:<id>" for a link of your own. */
export const extraKey = (id: string): string => `extra:${id}`;

/**
 * Puts entries in the order of the list. Entries the list does not know keep their place after the ones it does, in their own order, so
 * an item that is new (an extension's page) shows up instead of vanishing.
 */
export const arrange = <T extends { key: string }>(entries: T[], order: string[]): T[] => {
    const rank = (key: string, fallback: number) => {
        const at = order.indexOf(key);

        return at === -1 ? order.length + fallback : at;
    };

    return entries
        .map((entry, index) => ({ entry, at: rank(entry.key, index) }))
        .sort((a, b) => a.at - b.at)
        .map(({ entry }) => entry);
};

/** Fills in what a link of your own may hold: {id} and {uuid} stand for the server. */
export const fillUrl = (url: string, server: { id: string; uuid: string }): string =>
    url.replace(/\{id\}/g, server.id).replace(/\{uuid\}/g, server.uuid);

/** Only a path of the panel or an http(s) address is a link, anything else (javascript:) is not. */
export const safeUrl = (url: string): boolean => /^(\/(?!\/)|https?:\/\/)[^\s<>"']*$/.test(url);
