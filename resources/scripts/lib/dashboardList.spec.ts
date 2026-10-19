import { Server } from '@/api/server/getServer';
import { ServerStats } from '@/api/server/getServerResourceUsage';
import { DashboardLayout, ServerMark } from '@/api/dashboardLayout';
import {
    filterServers,
    filtersActive,
    groupServers,
    matchesQuery,
    noFilters,
    sortServers,
    statusGroup,
} from '@/lib/dashboardList';

const server = (uuid: string, name: string, extra: Partial<Server> = {}): Server =>
    ({
        uuid,
        name,
        description: '',
        node: 'Frankfurt',
        status: null,
        isOwner: true,
        isTransferring: false,
        isNodeUnderMaintenance: false,
        allocations: [{ id: 1, ip: '10.0.0.5', alias: null, port: 25565, notes: null, isDefault: true }],
        ...extra,
    } as unknown as Server);

const stat = (status: ServerStats['status'], isSuspended = false) => ({ status, isSuspended } as ServerStats);

const a = server('a', 'Survival SMP', { description: 'with friends' });
const b = server('b', 'Creative Plots', { node: 'Dallas', isOwner: false });
const c = server('c', 'Lobby 10');
const d = server('d', 'Lobby 2');

describe('matchesQuery', () => {
    it('needs every word, in the name, description, address or node', () => {
        expect(matchesQuery(a, '')).toBe(true);
        expect(matchesQuery(a, 'survival friends')).toBe(true);
        expect(matchesQuery(a, 'SURVIVAL smp')).toBe(true);
        expect(matchesQuery(a, '25565')).toBe(true);
        expect(matchesQuery(b, 'dallas')).toBe(true);
        expect(matchesQuery(a, 'survival creative')).toBe(false);
    });
});

describe('statusGroup', () => {
    it('groups by power state and by why a server cannot be used', () => {
        expect(statusGroup(a, stat('running'))).toBe('online');
        expect(statusGroup(a, stat('offline'))).toBe('offline');
        expect(statusGroup(a, stat('starting'))).toBe('other');
        expect(statusGroup(a, undefined)).toBe('other');
        expect(statusGroup(a, stat('running', true))).toBe('other');
        expect(statusGroup(server('x', 'x', { status: 'installing' as any }), stat('running'))).toBe('other');
        expect(statusGroup(server('x', 'x', { isNodeUnderMaintenance: true }), stat('running'))).toBe('other');
    });
});

describe('filterServers', () => {
    const stats = { a: stat('running'), b: stat('offline'), c: stat('offline'), d: stat('running') };
    const marks: Record<string, ServerMark> = { c: { uuid: 'c', folder: null, starred: true } };

    it('combines the filters', () => {
        const all = [a, b, c, d];
        expect(filterServers(all, noFilters, stats, marks)).toHaveLength(4);
        expect(filterServers(all, { ...noFilters, status: 'online' }, stats, marks)).toEqual([a, d]);
        expect(filterServers(all, { ...noFilters, node: 'Dallas' }, stats, marks)).toEqual([b]);
        expect(filterServers(all, { ...noFilters, role: 'shared' }, stats, marks)).toEqual([b]);
        expect(filterServers(all, { ...noFilters, role: 'owned' }, stats, marks)).toEqual([a, c, d]);
        expect(filterServers(all, { ...noFilters, starred: true }, stats, marks)).toEqual([c]);
        expect(filterServers(all, { ...noFilters, query: 'lobby', status: 'online' }, stats, marks)).toEqual([d]);
    });

    it('knows when a filter is on', () => {
        expect(filtersActive(noFilters)).toBe(false);
        expect(filtersActive({ ...noFilters, query: '  ' })).toBe(false);
        expect(filtersActive({ ...noFilters, query: 'x' })).toBe(true);
        expect(filtersActive({ ...noFilters, starred: true })).toBe(true);
    });
});

describe('sortServers', () => {
    const stats = { a: stat('offline'), b: stat('running'), c: stat('running'), d: stat('offline') };
    const marks: Record<string, ServerMark> = { d: { uuid: 'd', folder: null, starred: true } };

    it('puts starred first and sorts names the way people count', () => {
        expect(sortServers([a, b, c, d], 'name', stats, marks).map((s) => s.uuid)).toEqual(['d', 'b', 'c', 'a']);
        expect(sortServers([c, d], 'name', {}, {}).map((s) => s.uuid)).toEqual(['d', 'c']);
    });

    it('can sort running servers first', () => {
        expect(sortServers([a, b, c], 'status', stats, {}).map((s) => s.uuid)).toEqual(['b', 'c', 'a']);
    });
});

describe('groupServers', () => {
    const layout: DashboardLayout = {
        folders: [
            { id: 1, name: 'Survival' },
            { id: 2, name: 'Empty' },
        ],
        servers: [
            { uuid: 'a', folder: 1, starred: false },
            { uuid: 'b', folder: 99, starred: true },
        ],
    };

    it('puts servers in their folder and the rest in none', () => {
        const groups = groupServers([a, b, c], layout, false);
        expect(groups.map((g) => [g.folder?.name ?? null, g.servers.map((s) => s.uuid)])).toEqual([
            ['Survival', ['a']],
            ['Empty', []],
            [null, ['b', 'c']],
        ]);
    });

    it('leaves out folders with nothing to show while filtering', () => {
        expect(groupServers([a], layout, true).map((g) => g.folder?.name ?? null)).toEqual(['Survival', null]);
    });
});
