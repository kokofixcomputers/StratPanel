/**
 * The search box in the top bar: what it offers (pages, servers, actions of the server that is open, admin pages) and how what
 * is typed is matched against it. Pure functions, the box itself is components/palette/CommandPalette.tsx.
 */
import { PowerSignal } from '@/api/server/sendPowerAction';

export type IconKey =
    | 'server'
    | 'page'
    | 'play'
    | 'stop'
    | 'restart'
    | 'kill'
    | 'backup'
    | 'admin'
    | 'plus'
    | 'user'
    | 'theme'
    | 'console';

export type PaletteAction =
    // A page of the panel itself, no reload.
    | { type: 'go'; to: string }
    // A page that is not part of the React app (the admin area): a normal page load.
    | { type: 'open'; href: string }
    // Does something and says what it did, shown for a moment afterwards.
    | { type: 'run'; run: () => Promise<string | void> };

export interface PaletteItem {
    id: string;
    label: string;
    // A few words to the right: what kind of thing it is.
    hint?: string;
    group: string;
    // Words that find the item without being in its name.
    words?: string;
    icon: IconKey;
    action: PaletteAction;
    // Shown whatever is typed: it is what the words were understood as, not something that has to contain them.
    always?: boolean;
}

/** The groups in the order they show when nothing is typed. */
export const GROUP_ORDER = ['Suggested', 'This server', 'Servers', 'Go to', 'Admin', 'Account'];

const isWordStart = (text: string, at: number) => at === 0 || !/[a-z0-9]/.test(text[at - 1]);

const subsequence = (text: string, token: string): boolean => {
    let at = 0;
    for (const c of text) if (c === token[at] && ++at === token.length) return true;

    return false;
};

const tokenScore = (token: string, label: string, words: string): number => {
    const at = label.indexOf(token);
    if (at === 0) return 100;
    if (at > 0) return isWordStart(label, at) ? 70 : 40;
    if (words.includes(token)) return 25;
    // "bkup" finds "Backups": the letters in order, for words long enough that this is not a coincidence.
    if (token.length >= 3 && subsequence(label, token)) return 10;

    return 0;
};

/** 0 when the item does not match every word of the query, else how well it does. */
export const scoreItem = (item: PaletteItem, query: string): number => {
    if (item.always) return 1000;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return 1;

    const label = item.label.toLowerCase();
    const words = `${item.words ?? ''} ${item.group} ${item.hint ?? ''}`.toLowerCase();
    let total = 0;
    for (const token of tokens) {
        const score = tokenScore(token, label, words);
        if (score === 0) return 0;
        total += score;
    }

    return total + (label.startsWith(query.trim().toLowerCase()) ? 50 : 0);
};

export interface PaletteSection {
    group: string;
    items: PaletteItem[];
}

const LIMITS: Record<string, number> = { Servers: 6, Suggested: 4 };

/**
 * The items that match, in sections. With nothing typed the sections keep their usual order and a few items each; with a query the
 * section holding the best match comes first.
 */
export const rankItems = (items: PaletteItem[], query: string): PaletteSection[] => {
    const typed = query.trim() !== '';
    const sections = new Map<string, { items: { item: PaletteItem; score: number; index: number }[]; best: number }>();

    items.forEach((item, index) => {
        const score = scoreItem(item, query);
        if (score === 0) return;
        const section = sections.get(item.group) ?? { items: [], best: 0 };
        section.items.push({ item, score, index });
        section.best = Math.max(section.best, score);
        sections.set(item.group, section);
    });

    const order = (group: string) => {
        const at = GROUP_ORDER.indexOf(group);

        return at < 0 ? GROUP_ORDER.length : at;
    };

    return Array.from(sections.entries())
        .sort(([ga, a], [gb, b]) => (typed ? b.best - a.best || order(ga) - order(gb) : order(ga) - order(gb)))
        .map(([group, section]) => ({
            group,
            items: section.items
                .sort((a, b) => (typed ? b.score - a.score : 0) || a.index - b.index)
                .slice(0, typed ? LIMITS[group] ?? 8 : LIMITS[group] ?? 6)
                .map((entry) => entry.item),
        }));
};

/** What a person has to be allowed for a page or an action; an array means any of them (like the menu of the server does). */
export const hasPermission = (granted: string[], required: string | string[] | null): boolean => {
    if (required === null) return true;
    if (granted[0] === '*') return true;
    const any = Array.isArray(required) ? required : [required];

    return any.some((permission) =>
        permission.endsWith('.*')
            ? granted.some((p) => p.startsWith(permission.split('.')[0]))
            : granted.indexOf(permission) >= 0
    );
};

/** The pages of a server, as its menu lists them: [name, path, permission]. */
export const SERVER_PAGES: [string, string, string | string[] | null][] = [
    ['Console', '/', null],
    ['Players', '/players', 'control.*'],
    ['Versions', '/versions', 'file.*'],
    ['Properties', '/properties', 'file.*'],
    ['Content: mods, plugins, datapacks', '/mods', 'file.*'],
    ['Worlds', '/worlds', 'file.*'],
    ['Tools', '/tools', null],
    ['Files', '/files', 'file.*'],
    ['Importer', '/import', 'file.create'],
    ['Databases', '/databases', 'database.*'],
    ['Schedules', '/schedules', 'schedule.*'],
    ['Users (who can access)', '/users', 'user.*'],
    ['Backups', '/backups', 'backup.*'],
    ['Network and ports', '/network', 'allocation.*'],
    ['Domains', '/domains', 'allocation.*'],
    ['Trash', '/trash', 'trash.*'],
    ['Startup: environment variables', '/startup', 'startup.*'],
    ['Settings', '/settings', ['settings.*', 'file.sftp']],
    ['Activity', '/activity', 'activity.*'],
];

const PAGE_WORDS: Record<string, string> = {
    '/': 'logs terminal command',
    '/mods': 'plugins datapacks modrinth curseforge hangar install',
    '/files': 'editor sftp upload folder',
    '/properties': 'server.properties motd gamemode difficulty',
    '/backups': 'snapshot restore download',
    '/settings': 'rename reinstall sftp debug',
    '/network': 'allocations ip',
    '/startup': 'variables java flags memory',
    '/versions': 'paper fabric forge update minecraft version',
};

export interface ServerLike {
    id: string;
    uuid: string;
    name: string;
    trash: { enabled: boolean };
}

/** The pages of the server that is open and that the person may open. */
export const serverPageItems = (server: ServerLike, granted: string[]): PaletteItem[] =>
    SERVER_PAGES.filter(
        ([, path, permission]) => hasPermission(granted, permission) && (path !== '/trash' || server.trash.enabled)
    ).map(([name, path]) => ({
        id: `page:${path}`,
        label: name,
        hint: server.name,
        group: 'This server',
        words: PAGE_WORDS[path] ?? '',
        icon: path === '/' ? 'console' : 'page',
        action: { type: 'go', to: `/server/${server.id}${path === '/' ? '' : path}` },
    }));

const POWER: { signal: PowerSignal; label: string; permission: string; icon: IconKey; words: string; done: string }[] =
    [
        {
            signal: 'start',
            label: 'Start',
            permission: 'control.start',
            icon: 'play',
            words: 'boot launch run turn on',
            done: 'Start sent',
        },
        {
            signal: 'restart',
            label: 'Restart',
            permission: 'control.restart',
            icon: 'restart',
            words: 'reboot reload',
            done: 'Restart sent',
        },
        {
            signal: 'stop',
            label: 'Stop',
            permission: 'control.stop',
            icon: 'stop',
            words: 'shutdown turn off halt',
            done: 'Stop sent',
        },
        {
            signal: 'kill',
            label: 'Kill',
            permission: 'control.stop',
            icon: 'kill',
            words: 'force terminate crash frozen',
            done: 'Kill sent',
        },
    ];

export interface ServerActions {
    power: (signal: PowerSignal) => Promise<unknown>;
    backup: () => Promise<unknown>;
}

/** Start, stop, restart and a backup of the server that is open, as far as the person may. */
export const serverActionItems = (server: ServerLike, granted: string[], actions: ServerActions): PaletteItem[] => {
    const items: PaletteItem[] = POWER.filter((p) => hasPermission(granted, p.permission)).map((p) => ({
        id: `power:${p.signal}`,
        label: `${p.label} the server`,
        hint: server.name,
        group: 'This server',
        words: p.words,
        icon: p.icon,
        action: {
            type: 'run',
            run: async () => {
                await actions.power(p.signal);

                return `${p.done} to ${server.name}`;
            },
        },
    }));

    if (hasPermission(granted, 'backup.create')) {
        items.push({
            id: 'backup:create',
            label: 'Back up now',
            hint: server.name,
            group: 'This server',
            words: 'create backup snapshot save',
            icon: 'backup',
            action: {
                type: 'run',
                run: async () => {
                    await actions.backup();

                    return `Backup of ${server.name} started`;
                },
            },
        });
    }

    return items;
};

export interface ListedServer {
    id: string;
    uuid: string;
    name: string;
    node: string;
    internalId: number | string;
    description: string;
    address: string;
    canControl: { start: boolean; stop: boolean; restart: boolean };
}

/** Every server as an item that opens it. Admins also get the admin page of each one. */
export const serverItems = (servers: ListedServer[], asAdmin: boolean, query: string): PaletteItem[] => {
    const items: PaletteItem[] = [];
    servers.forEach((s) => {
        const words = `${s.address} ${s.node} ${s.description}`;
        items.push({
            id: `server:${s.uuid}`,
            label: s.name,
            hint: s.node,
            group: 'Servers',
            words,
            icon: 'server',
            action: { type: 'go', to: `/server/${s.id}` },
        });
        // Only when searching: for every server it would double the list.
        if (asAdmin && query.trim() !== '') {
            items.push({
                id: `server-admin:${s.uuid}`,
                label: `${s.name}: admin page`,
                hint: 'Admin',
                group: 'Servers',
                words,
                icon: 'admin',
                action: { type: 'open', href: `/admin/servers/view/${s.internalId}` },
            });
        }
    });

    return items;
};

const VERBS: Record<string, { signal: PowerSignal; permission: 'start' | 'stop' | 'restart'; done: string }> = {
    start: { signal: 'start', permission: 'start', done: 'Start sent' },
    restart: { signal: 'restart', permission: 'restart', done: 'Restart sent' },
    stop: { signal: 'stop', permission: 'stop', done: 'Stop sent' },
    kill: { signal: 'kill', permission: 'stop', done: 'Kill sent' },
};

/** "restart survival" offers to restart the servers with survival in their name, whatever page is open. */
export const verbItems = (
    query: string,
    servers: ListedServer[],
    power: (uuid: string, signal: PowerSignal) => Promise<unknown>
): PaletteItem[] => {
    const match = /^(start|restart|stop|kill)\s+(.+)$/i.exec(query.trim());
    if (!match) return [];
    const verb = VERBS[match[1].toLowerCase()];
    const words = match[2].toLowerCase().split(/\s+/).filter(Boolean);

    return servers
        .filter(
            (s) => s.canControl[verb.permission] && words.every((w) => `${s.name} ${s.node}`.toLowerCase().includes(w))
        )
        .slice(0, 5)
        .map((s) => ({
            id: `verb:${verb.signal}:${s.uuid}`,
            label: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${s.name}`,
            hint: 'Power',
            group: 'Servers',
            // Not matched again by the word of the verb alone: the query already holds it and the name.
            words: `${match[1]} ${s.name}`,
            icon:
                verb.signal === 'start'
                    ? 'play'
                    : verb.signal === 'restart'
                    ? 'restart'
                    : verb.signal === 'kill'
                    ? 'kill'
                    : 'stop',
            action: {
                type: 'run',
                run: async () => {
                    await power(s.uuid, verb.signal);

                    return `${verb.done} to ${s.name}`;
                },
            },
        }));
};

/** The pages that are always there. */
export const goToItems = (): PaletteItem[] => [
    {
        id: 'go:home',
        label: 'Dashboard',
        hint: 'Your servers',
        group: 'Go to',
        words: 'home servers list',
        icon: 'server',
        action: { type: 'go', to: '/' },
    },
    {
        id: 'go:account',
        label: 'Account settings',
        group: 'Account',
        words: 'profile email password two factor 2fa',
        icon: 'user',
        action: { type: 'go', to: '/account' },
    },
    {
        id: 'go:api',
        label: 'API credentials',
        group: 'Account',
        words: 'keys token',
        icon: 'user',
        action: { type: 'go', to: '/account/api' },
    },
    {
        id: 'go:ssh',
        label: 'SSH keys',
        group: 'Account',
        words: 'sftp public key',
        icon: 'user',
        action: { type: 'go', to: '/account/ssh' },
    },
    {
        id: 'go:providers',
        label: 'Sign-in providers',
        group: 'Account',
        words: 'github discord google linked accounts',
        icon: 'user',
        action: { type: 'go', to: '/account/providers' },
    },
    {
        id: 'go:passkeys',
        label: 'Passkeys',
        group: 'Account',
        words: 'webauthn security key',
        icon: 'user',
        action: { type: 'go', to: '/account/passkeys' },
    },
    {
        id: 'go:activity',
        label: 'Account activity',
        group: 'Account',
        words: 'log history logins',
        icon: 'user',
        action: { type: 'go', to: '/account/activity' },
    },
];

export interface AdminEntry {
    id: string;
    label: string;
    url: string;
    kind: string;
    words: string;
}

export const adminItems = (entries: AdminEntry[]): PaletteItem[] =>
    entries.map((e) => ({
        id: e.id,
        label: e.label,
        hint: e.kind === 'action' ? 'Admin action' : 'Admin',
        group: 'Admin',
        words: e.words,
        icon: e.kind === 'action' ? 'plus' : 'admin',
        action: { type: 'open', href: e.url },
    }));
