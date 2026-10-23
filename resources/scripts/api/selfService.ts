import http from '@/api/http';
import { rawDataToServerObject, Server } from '@/api/server/getServer';

export interface SelfService {
    enabled: boolean;
    canCreate: boolean;
    maxServers: number;
    owned: number;
    limits: Specs;
    max: Specs;
    nodes: SelfServiceNode[];
    // The resource pool of this person, null when the panel does not use pools.
    pool: ResourcePool | null;
}

/** What a person may spend on servers: the pool they have, what their servers use and what is left (memory and disk in MB, CPU in percent). */
export interface ResourcePool {
    limits: PoolAmounts;
    used: PoolAmounts;
    remaining: PoolAmounts;
    minimum: PoolAmounts;
}

export interface PoolAmounts {
    memory: number;
    disk: number;
    cpu: number;
    allocations: number;
    backups: number;
}

export interface SelfServiceNode {
    id: number;
    name: string;
    location: string | null;
    description: string | null;
    pingUrl: string;
    memoryFree: number;
    diskFree: number;
    freeAllocations: number;
}

export interface Specs {
    memory: number;
    disk: number;
    cpu: number;
    // How many allocations the server starts with. Only chosen with resource pools, otherwise it is two.
    allocations?: number;
    // How many backups the server may keep. Only chosen with resource pools.
    backups?: number;
}

export const getSelfService = async (): Promise<SelfService> => {
    const { data } = await http.get('/api/client/self-service');
    const a = data.attributes;

    return {
        enabled: a.enabled,
        canCreate: a.can_create,
        maxServers: a.max_servers,
        owned: a.owned,
        limits: a.limits,
        max: a.max || a.limits,
        pool: a.pool ?? null,
        nodes: (a.nodes || []).map((n: any) => ({
            id: n.id,
            name: n.name,
            location: n.location,
            description: n.description,
            pingUrl: n.ping_url,
            memoryFree: n.memory_free,
            diskFree: n.disk_free,
            freeAllocations: n.free_allocations,
        })),
    };
};

export const createServer = async (
    name: string,
    description?: string,
    specs?: Specs,
    nodeId?: number | null
): Promise<Server> => {
    const { data } = await http.post('/api/client/self-service', {
        name,
        description,
        ...(specs || {}),
        ...(nodeId ? { node_id: nodeId } : {}),
    });

    return rawDataToServerObject(data);
};
