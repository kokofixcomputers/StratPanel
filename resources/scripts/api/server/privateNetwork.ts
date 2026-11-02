import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export interface PrivateNetworkState {
    // Whether the panel has the private network on, and whether this server can join it (its node takes part).
    enabled: boolean;
    available: boolean;
    joined: boolean;
    address: string | null;
    node: string;
    // The servers of the same owner that are on it too.
    others: { name: string; address: string; identifier: string }[];
}

export const usePrivateNetwork = (config?: ConfigInterface<PrivateNetworkState, AxiosError>) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    return useSWR<PrivateNetworkState, AxiosError>(
        [uuid, '/private-network'],
        async () => (await http.get(`/api/client/servers/${uuid}/private-network`)).data,
        { revalidateOnFocus: false, ...(config || {}) }
    );
};

export const joinPrivateNetwork = async (uuid: string): Promise<PrivateNetworkState> =>
    (await http.post(`/api/client/servers/${uuid}/private-network`)).data;

export const leavePrivateNetwork = async (uuid: string): Promise<PrivateNetworkState> =>
    (await http.delete(`/api/client/servers/${uuid}/private-network`)).data;
