import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { PoolAmounts } from '@/api/selfService';
import { useUserSWRKey } from '@/plugins/useSWRKey';

export interface ServerShare {
    identifier: string;
    name: string;
    memory: number;
    disk: number;
    cpu: number;
    allocations: number;
    backups: number;
    databases: number;
}

/** What the account may spend on servers and how its servers use it (memory and disk in MB, CPU in percent). */
export interface AccountResources {
    // Whether the panel pays servers from pools at all, and whether this account is held to one.
    enabled: boolean;
    limited: boolean;
    limits: PoolAmounts | null;
    used: PoolAmounts;
    remaining: PoolAmounts | null;
    servers: ServerShare[];
}

const useAccountResources = (config?: ConfigInterface<AccountResources, AxiosError>) => {
    const key = useUserSWRKey(['account', 'resources']);

    return useSWR<AccountResources, AxiosError>(
        key,
        async () => {
            const { data } = await http.get('/api/client/account/resources');

            return data.attributes as AccountResources;
        },
        { revalidateOnFocus: false, ...config }
    );
};

export default useAccountResources;
