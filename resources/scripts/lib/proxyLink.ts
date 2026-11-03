/**
 * Pointing a proxy at one of the servers of the account: which address to use for it (the private network when both joined it), and
 * which of the servers an address in velocity.toml belongs to, so the proxy page can show that server instead of an address.
 */
import { Server } from '@/api/server/getServer';
import { ip } from '@/lib/formatters';

type Linkable = Pick<Server, 'uuid' | 'node' | 'privateAddress' | 'allocations'>;

export const defaultAllocation = (server: Pick<Server, 'allocations'>) =>
    server.allocations.find((a) => a.isDefault) || server.allocations[0];

/** The address players use, the allocation of the server. */
export const publicAddressOf = (server: Pick<Server, 'allocations'>): string | null => {
    const allocation = defaultAllocation(server);

    return allocation ? `${allocation.alias || ip(allocation.ip)}:${allocation.port}` : null;
};

/** The address on the private network with the port of the server (the container listens on the port of its allocation). */
export const privateAddressOf = (server: Pick<Server, 'allocations' | 'privateAddress'>): string | null => {
    const allocation = defaultAllocation(server);

    return server.privateAddress && allocation ? `${server.privateAddress}:${allocation.port}` : null;
};

/** The private address when the proxy and the server are both on the private network, else the public one. */
export const backendAddressOf = (
    server: Pick<Server, 'allocations' | 'privateAddress'>,
    proxy: Pick<Server, 'privateAddress'>
): string | null => (proxy.privateAddress ? privateAddressOf(server) : null) || publicAddressOf(server);

export const splitAddress = (address: string): { host: string; port: number } | null => {
    const match = address.trim().match(/^(.+):(\d{1,5})$/);

    return match ? { host: match[1].toLowerCase(), port: Number(match[2]) } : null;
};

const LOOPBACK = ['127.0.0.1', 'localhost', '0.0.0.0', '[::1]'];

/**
 * The server an address in velocity.toml is. It has to be the port of the server, and the host one of: its private address, its
 * allocation (IP or alias) or, when it runs on the same node as the proxy, the loopback address.
 */
export const findLinked = <T extends Linkable>(
    address: string,
    servers: T[],
    proxy: Pick<Server, 'uuid' | 'node'>
): T | null => {
    const parts = splitAddress(address);
    if (!parts) return null;

    return (
        servers.find((server) => {
            if (server.uuid === proxy.uuid) return false;
            const allocation = defaultAllocation(server);
            if (!allocation || allocation.port !== parts.port) return false;

            return (
                parts.host === server.privateAddress ||
                parts.host === allocation.ip.toLowerCase() ||
                parts.host === (allocation.alias || '').toLowerCase() ||
                (server.node === proxy.node && LOOPBACK.includes(parts.host))
            );
        }) || null
    );
};

/** Whether the address of an entry is on the private network. */
export const isPrivateAddress = (address: string, servers: Linkable[]): boolean => {
    const host = splitAddress(address)?.host;

    return !!host && servers.some((server) => server.privateAddress === host);
};
