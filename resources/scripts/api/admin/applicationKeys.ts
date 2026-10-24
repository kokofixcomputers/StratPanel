import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export interface ApplicationKey {
    identifier: string;
    key: string;
    memo: string | null;
    last_used_at: string | null;
    created_at: string;
    user: { id: number; username: string };
}

export interface KeyResources {
    resources: string[];
    levels: { none: number; read: number; write: number };
}

export const useApplicationKeys = () =>
    useSWR<{ keys: ApplicationKey[] }, AxiosError>(
        'admin:application-keys',
        async () => (await http.get('/api/client/admin/application-keys')).data,
        { revalidateOnFocus: false }
    );

export const useKeyResources = () =>
    useSWR<KeyResources, AxiosError>(
        'admin:application-keys:resources',
        async () => (await http.get('/api/client/admin/application-keys/resources')).data,
        { revalidateOnFocus: false }
    );

export const createApplicationKey = async (memo: string, levels: Record<string, number>): Promise<void> => {
    const body: Record<string, string | number> = { memo };
    Object.entries(levels).forEach(([resource, level]) => (body[`r_${resource}`] = level));
    await http.post('/api/client/admin/application-keys', body);
};

export const deleteApplicationKey = async (identifier: string): Promise<void> => {
    await http.delete(`/api/client/admin/application-keys/${identifier}`);
};
