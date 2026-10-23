import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export interface MountRow {
    id: number;
    name: string;
    source: string;
    target: string;
    eggs: number;
    nodes: number;
    servers: number;
}

export interface Mount {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    source: string;
    target: string;
    read_only: boolean;
    user_mountable: boolean;
    eggs: { id: number; name: string }[];
    nodes: { id: number; name: string; fqdn: string }[];
}

export interface MountInput {
    name: string;
    description: string;
    source: string;
    target: string;
    read_only: boolean;
    user_mountable: boolean;
}

export const useMounts = () =>
    useSWR<{ mounts: MountRow[] }, AxiosError>(
        'admin:mounts',
        async () => (await http.get('/api/client/admin/mounts')).data,
        { revalidateOnFocus: false }
    );

export const useMount = (id: string | undefined) =>
    useSWR<Mount, AxiosError>(
        id ? `admin:mounts:${id}` : null,
        async () => (await http.get(`/api/client/admin/mounts/${id}`)).data,
        {
            revalidateOnFocus: false,
        }
    );

export const createMount = async (input: MountInput): Promise<Mount> =>
    (await http.post('/api/client/admin/mounts', input)).data;

export const updateMount = (id: number, input: MountInput) => http.patch(`/api/client/admin/mounts/${id}`, input);

export const deleteMount = (id: number) => http.delete(`/api/client/admin/mounts/${id}`);

export const addEggs = (id: number, eggs: number[]) => http.post(`/api/client/admin/mounts/${id}/eggs`, { eggs });

export const addNodes = (id: number, nodes: number[]) => http.post(`/api/client/admin/mounts/${id}/nodes`, { nodes });

export const removeEgg = (id: number, egg: number) => http.delete(`/api/client/admin/mounts/${id}/eggs/${egg}`);

export const removeNode = (id: number, node: number) => http.delete(`/api/client/admin/mounts/${id}/nodes/${node}`);
