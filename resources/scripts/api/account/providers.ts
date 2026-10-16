import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { useUserSWRKey } from '@/plugins/useSWRKey';

export interface LinkedProvider {
    key: string;
    name: string;
    type: string;
    enabled: boolean;
    linked: boolean;
    // Who the person is at the service, when it is linked.
    account: string | null;
    linkedAt: Date | null;
    lastUsedAt: Date | null;
}

export interface ProviderList {
    // False for somebody who signed up with a service and has not chosen a password.
    passwordSet: boolean;
    providers: LinkedProvider[];
}

const useProviders = (config?: ConfigInterface<ProviderList, AxiosError>) => {
    const key = useUserSWRKey(['account', 'providers']);

    return useSWR<ProviderList, AxiosError>(
        key,
        async () => {
            const { data } = await http.get('/api/client/account/providers');

            return {
                passwordSet: !!data.password_set,
                providers: (data.data as any[]).map((row) => ({
                    key: row.key,
                    name: row.name,
                    type: row.type,
                    enabled: !!row.enabled,
                    linked: !!row.linked,
                    account: row.account,
                    linkedAt: row.linked_at ? new Date(row.linked_at) : null,
                    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
                })),
            };
        },
        { revalidateOnMount: true, revalidateOnFocus: false, ...(config || {}) }
    );
};

const unlinkProvider = async (key: string): Promise<void> => {
    await http.delete(`/api/client/account/providers/${encodeURIComponent(key)}`);
};

export { useProviders, unlinkProvider };
