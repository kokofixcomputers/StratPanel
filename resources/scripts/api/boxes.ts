import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { Share } from '@/lib/store';

export type BoxStatus = 'active' | 'suspended' | 'expired';

export interface BoxSummary {
    id: string;
    // The number the admin pages use.
    admin_id: number;
    name: string;
    status: BoxStatus;
    source: 'admin' | 'order';
    expires_at: string | null;
    notes: string | null;
    node: { id: number; name: string } | null;
    owner: { id: number; username: string; email: string } | null;
    limits: Share;
    used: Share;
    remaining: Share;
    servers: number;
    can_create: boolean;
}

export interface BoxServer {
    id: string;
    uuid: string;
    admin_id: number;
    name: string;
    status: string | null;
    node: string | null;
    address: string | null;
    limits: Share;
}

export interface BoxDetail extends BoxSummary {
    minimum: Share;
    servers_list: BoxServer[];
    nodes: { id: number; name: string; location: string | null; free_allocations: number }[];
    renew: { package: string; name: string; price: number; period_days: number; currency: string } | null;
}

export const useBoxes = () =>
    useSWR<BoxSummary[], AxiosError>('boxes', async () => (await http.get('/api/client/boxes')).data.data, {
        revalidateOnFocus: false,
    });

export const useBox = (id: string) =>
    useSWR<BoxDetail, AxiosError>(`box:${id}`, async () => (await http.get(`/api/client/boxes/${id}`)).data, {
        revalidateOnFocus: false,
    });

export const createBoxServer = async (
    id: string,
    body: Share & { name: string; description?: string; node_id?: number | null }
): Promise<BoxDetail> => (await http.post(`/api/client/boxes/${id}/servers`, body)).data;

export const resizeBoxServer = async (id: string, server: string, share: Share): Promise<BoxDetail> =>
    (await http.patch(`/api/client/boxes/${id}/servers/${server}`, share)).data;
