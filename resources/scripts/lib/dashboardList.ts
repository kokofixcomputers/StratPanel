import { Server } from '@/api/server/getServer';
import { ServerStats } from '@/api/server/getServerResourceUsage';
import { DashboardFolder, DashboardLayout, ServerMark } from '@/api/dashboardLayout';

/** What state a server is in, for the filter: reachable ones by their power state, the rest by why they cannot be used. */
export type StatusGroup = 'online' | 'offline' | 'other';

export interface ListFilters {
    query: string;
    status: StatusGroup | 'all';
    node: string;
    role: 'all' | 'owned' | 'shared';
    starred: boolean;
}

export type SortKey = 'name' | 'status';

export const noFilters: ListFilters = { query: '', status: 'all', node: '', role: 'all', starred: false };

export const filtersActive = (f: ListFilters): boolean =>
    f.query.trim() !== '' || f.status !== 'all' || f.node !== '' || f.role !== 'all' || f.starred;

export const statusGroup = (server: Server, stats: ServerStats | undefined): StatusGroup => {
    if (server.status || server.isTransferring || server.isNodeUnderMaintenance || stats?.isSuspended) return 'other';
    if (!stats) return 'other';

    return stats.status === 'running' ? 'online' : stats.status === 'offline' ? 'offline' : 'other';
};

export const addressOf = (server: Server): string =>
    [
        ...(server.domains ?? []),
        ...server.allocations.filter((a) => a.isDefault).map((a) => `${a.alias || a.ip}:${a.port}`),
    ].join(' ');

/** Every word of the search has to be in the name, description, address or node of the server. */
export const matchesQuery = (server: Server, query: string): boolean => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;

    const haystack = [server.name, server.description, addressOf(server), server.node].join('\n').toLowerCase();

    return words.every((w) => haystack.includes(w));
};

export const filterServers = (
    servers: Server[],
    filters: ListFilters,
    stats: Record<string, ServerStats>,
    marks: Record<string, ServerMark>
): Server[] =>
    servers.filter(
        (s) =>
            matchesQuery(s, filters.query) &&
            (filters.status === 'all' || statusGroup(s, stats[s.uuid]) === filters.status) &&
            (filters.node === '' || s.node === filters.node) &&
            (filters.role === 'all' || (filters.role === 'owned') === s.isOwner) &&
            (!filters.starred || !!marks[s.uuid]?.starred)
    );

const STATUS_ORDER: Record<StatusGroup, number> = { online: 0, other: 1, offline: 2 };

/** Starred servers first, then by name or by state (running ones first). */
export const sortServers = (
    servers: Server[],
    sort: SortKey,
    stats: Record<string, ServerStats>,
    marks: Record<string, ServerMark>
): Server[] =>
    [...servers].sort((a, b) => {
        const star = Number(!!marks[b.uuid]?.starred) - Number(!!marks[a.uuid]?.starred);
        if (star !== 0) return star;
        if (sort === 'status') {
            const s = STATUS_ORDER[statusGroup(a, stats[a.uuid])] - STATUS_ORDER[statusGroup(b, stats[b.uuid])];
            if (s !== 0) return s;
        }

        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

export interface ServerGroup {
    folder: DashboardFolder | null;
    servers: Server[];
}

/**
 * The servers by folder, in the order of the folders, then the ones that are in none. A folder that has nothing to show is left out
 * while a search or filter is on (otherwise it is shown empty, so a server can be dropped into it).
 */
export const groupServers = (servers: Server[], layout: DashboardLayout, hideEmpty: boolean): ServerGroup[] => {
    const folderOf = new Map(layout.servers.map((m) => [m.uuid, m.folder]));
    const known = new Set(layout.folders.map((f) => f.id));
    const groups: ServerGroup[] = layout.folders.map((folder) => ({
        folder,
        servers: servers.filter((s) => folderOf.get(s.uuid) === folder.id),
    }));
    const loose = servers.filter((s) => {
        const f = folderOf.get(s.uuid);

        return f === undefined || f === null || !known.has(f);
    });

    return [...groups.filter((g) => !hideEmpty || g.servers.length > 0), { folder: null, servers: loose }];
};

export type DotTone = 'online' | 'offline' | 'other' | 'empty';

export interface FolderSummary {
    online: number;
    offline: number;
    other: number;
    // The colour of the dot of a folder: green when something runs, amber when something is starting or cannot be reached, red when all are off.
    tone: DotTone;
}

/** How many of the servers are online, offline or something else, and the one dot that stands for all of them. */
export const folderSummary = (servers: Server[], stats: Record<string, ServerStats>): FolderSummary => {
    const counts = { online: 0, offline: 0, other: 0 };
    servers.forEach((s) => (counts[statusGroup(s, stats[s.uuid])] += 1));

    return {
        ...counts,
        tone: counts.online > 0 ? 'online' : counts.other > 0 ? 'other' : counts.offline > 0 ? 'offline' : 'empty',
    };
};
