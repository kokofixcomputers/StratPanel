/**
 * Resource pools (see app/Services/Pools/ResourcePool.php): what is left of a person's pool after the server they are making.
 * Memory and disk are in MB, CPU is a percentage.
 */
import { PoolAmounts, Specs } from '@/api/selfService';

export type PoolKey = keyof PoolAmounts;

export const POOL_KEYS: PoolKey[] = ['memory', 'disk', 'cpu', 'allocations', 'backups', 'databases'];

/** What the pool has left once a server with these specs is made; never below zero. */
export const poolAfter = (remaining: PoolAmounts, specs: Specs): PoolAmounts => ({
    memory: Math.max(0, remaining.memory - specs.memory),
    disk: Math.max(0, remaining.disk - specs.disk),
    cpu: Math.max(0, remaining.cpu - specs.cpu),
    allocations: Math.max(0, remaining.allocations - (specs.allocations ?? 1)),
    backups: Math.max(0, remaining.backups - (specs.backups ?? 0)),
    databases: Math.max(0, remaining.databases - (specs.databases ?? 0)),
});

/** Whether these specs fit in what is left (the server would refuse them otherwise). */
export const fitsPool = (remaining: PoolAmounts, specs: Specs): boolean =>
    POOL_KEYS.every(
        (key) =>
            (key === 'allocations'
                ? specs.allocations ?? 1
                : key === 'backups'
                ? specs.backups ?? 0
                : key === 'databases'
                ? specs.databases ?? 0
                : specs[key]) <= remaining[key]
    );

/** The specs cut down to what is left, and to the least a server can have, for a pool that has little left. */
export const clampToPool = (specs: Specs, remaining: PoolAmounts, minimum: PoolAmounts): Specs => ({
    memory: Math.min(specs.memory, Math.max(minimum.memory, remaining.memory)),
    disk: Math.min(specs.disk, Math.max(minimum.disk, remaining.disk)),
    cpu: Math.min(specs.cpu, Math.max(minimum.cpu, remaining.cpu)),
    allocations: Math.min(specs.allocations ?? 1, Math.max(minimum.allocations, remaining.allocations)),
    backups: Math.min(specs.backups ?? 0, Math.max(minimum.backups, remaining.backups)),
    databases: Math.min(specs.databases ?? 0, Math.max(minimum.databases, remaining.databases)),
});
