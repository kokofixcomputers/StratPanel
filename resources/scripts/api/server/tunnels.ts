import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export interface TunnelState {
    id: number;
    status: 'pending' | 'active' | 'failed';
    // Where players connect, once the tunnel is open.
    address: string | null;
    error: string | null;
}

export interface TunnelAllocation {
    id: number;
    ip: string;
    port: number;
    isPrimary: boolean;
    tunnel: TunnelState | null;
}

export interface Tunnels {
    // Whether an admin turned tunnels on, and how many a server may have.
    enabled: boolean;
    max: number;
    allocations: TunnelAllocation[];
}

const toTunnels = (data: any): Tunnels => ({
    enabled: !!data.enabled,
    max: data.max,
    allocations: (data.allocations as any[]).map((a) => ({
        id: a.id,
        ip: a.ip,
        port: a.port,
        isPrimary: !!a.is_primary,
        tunnel: a.tunnel
            ? { id: a.tunnel.id, status: a.tunnel.status, address: a.tunnel.address, error: a.tunnel.error }
            : null,
    })),
});

/** The tunnels of the server. It looks again every couple of seconds while a tunnel is being opened. */
export const useTunnels = (config?: ConfigInterface<Tunnels, AxiosError>) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    return useSWR<Tunnels, AxiosError>(
        [uuid, '/tunnels'],
        async () => toTunnels((await http.get(`/api/client/servers/${uuid}/tunnels`)).data),
        { revalidateOnFocus: false, ...(config || {}) }
    );
};

export const openTunnel = async (uuid: string, allocation: number): Promise<Tunnels> =>
    toTunnels((await http.post(`/api/client/servers/${uuid}/tunnels`, { allocation_id: allocation })).data);

export const closeTunnel = async (uuid: string, tunnel: number): Promise<Tunnels> =>
    toTunnels((await http.delete(`/api/client/servers/${uuid}/tunnels/${tunnel}`)).data);
