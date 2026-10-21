/**
 * The addresses people can connect to a server with: the domains that lead to it (those are shown first, they are what you give to a
 * friend), then the address of every allocation, the default one first. The first of the list is the one shown by itself.
 */
import { ip as formatIp } from '@/lib/formatters';

export interface ConnectionAddress {
    address: string;
    kind: 'domain' | 'ip';
    // The default allocation, which is the one the server uses for itself.
    primary: boolean;
}

interface Allocation {
    ip: string;
    alias: string | null;
    port: number;
    isDefault: boolean;
}

export const connectionAddresses = (server: { domains?: string[]; allocations: Allocation[] }): ConnectionAddress[] => {
    const seen = new Set<string>();
    const out: ConnectionAddress[] = [];
    const add = (entry: ConnectionAddress) => {
        if (seen.has(entry.address)) return;
        seen.add(entry.address);
        out.push(entry);
    };

    (server.domains ?? []).forEach((domain) => add({ address: domain, kind: 'domain', primary: false }));

    // The default allocation first. A name of an allocation (its alias) is a domain of the host, the raw IP address follows it.
    [...server.allocations]
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
        .forEach((allocation) => {
            const raw = `${formatIp(allocation.ip)}:${allocation.port}`;
            if (allocation.alias)
                add({ address: `${allocation.alias}:${allocation.port}`, kind: 'ip', primary: allocation.isDefault });
            add({ address: raw, kind: 'ip', primary: allocation.isDefault && !allocation.alias });
        });

    return out;
};

/** The address to show by itself: a domain when there is one, else the default allocation. Null when the server has nothing. */
export const primaryAddress = (server: { domains?: string[]; allocations: Allocation[] }): string | null =>
    connectionAddresses(server)[0]?.address ?? null;
