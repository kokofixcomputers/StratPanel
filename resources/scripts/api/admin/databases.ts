import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';

export interface HostRow {
    id: number;
    name: string;
    host: string;
    port: number;
    username: string;
    databases: number;
    node: { id: number; name: string } | null;
}

export interface HostInput {
    name: string;
    host: string;
    port: string;
    username: string;
    password: string;
    node_id: string;
}

export interface HostDatabase {
    id: number;
    database: string;
    username: string;
    remote: string;
    max_connections: number | null;
    server: { id: number; name: string };
}

export interface HostDetails {
    host: { id: number; name: string; host: string; port: number; username: string; node_id: number | null };
    databases: HostDatabase[];
    pagination: PaginationDataSet;
}

export const useHosts = () =>
    useSWR<{ hosts: HostRow[] }, AxiosError>(
        'admin:databases',
        async () => (await http.get('/api/client/admin/databases')).data,
        { revalidateOnFocus: false }
    );

export const useHost = (id: string | undefined, page: number) =>
    useSWR<HostDetails, AxiosError>(
        id ? `admin:databases:${id}:${page}` : null,
        async () => {
            const { data } = await http.get(`/api/client/admin/databases/${id}`, { params: { page } });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const createHost = async (input: HostInput): Promise<{ id: number }> =>
    (await http.post('/api/client/admin/databases', input)).data;

export const updateHost = (id: number, input: HostInput) => http.patch(`/api/client/admin/databases/${id}`, input);

export const deleteHost = (id: number) => http.delete(`/api/client/admin/databases/${id}`);
