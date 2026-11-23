import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';
import { BoxDetail, BoxSummary } from '@/api/boxes';
import { Share } from '@/lib/store';

const base = '/api/client/admin';

export interface BoxPage {
    boxes: BoxSummary[];
    nodes: { id: number; name: string }[];
    pagination: ReturnType<typeof getPaginationSet>;
}

export const useAdminBoxes = (search: string, ownerId: string | null, page: number) =>
    useSWR<BoxPage, AxiosError>(
        `admin:boxes:${search}:${ownerId}:${page}`,
        async () => {
            const { data } = await http.get(`${base}/boxes`, {
                params: { search: search || undefined, owner_id: ownerId || undefined, page },
            });

            return {
                boxes: data.boxes,
                nodes: data.nodes,
                pagination: getPaginationSet(data.pagination as PaginationDataSet),
            };
        },
        { revalidateOnFocus: false }
    );

export const useAdminBox = (id: number) =>
    useSWR<BoxDetail, AxiosError>(`admin:box:${id}`, async () => (await http.get(`${base}/boxes/${id}`)).data, {
        revalidateOnFocus: false,
    });

export interface NewBox extends Share {
    user_id: number;
    name: string;
    node_id: number | null;
    expires_at?: string | null;
    notes?: string | null;
}

export const createBox = async (body: NewBox): Promise<BoxDetail> => (await http.post(`${base}/boxes`, body)).data;

export const updateBox = async (id: number, body: Partial<Share> & Record<string, unknown>): Promise<BoxDetail> =>
    (await http.patch(`${base}/boxes/${id}`, body)).data;

export const suspendBox = async (id: number, suspended: boolean): Promise<BoxDetail> =>
    (await http.post(`${base}/boxes/${id}/suspend`, { suspended })).data;

export const deleteBox = async (id: number, servers: 'refuse' | 'detach' | 'delete'): Promise<void> => {
    await http.delete(`${base}/boxes/${id}`, { data: { servers } });
};

export interface AdminPackage extends Share {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    kind: 'server' | 'box';
    active: boolean;
    sort: number;
    price: number;
    period_days: number | null;
    node_id: number | null;
    egg_id: number | null;
    sold: number;
}

export interface PackageList {
    currency: string;
    packages: AdminPackage[];
    nodes: { id: number; name: string }[];
    eggs: { id: number; name: string }[];
}

export const usePackages = () =>
    useSWR<PackageList, AxiosError>('admin:packages', async () => (await http.get(`${base}/packages`)).data, {
        revalidateOnFocus: false,
    });

export const usePackage = (id: number | null) =>
    useSWR<AdminPackage, AxiosError>(
        id === null ? null : `admin:package:${id}`,
        async () => (await http.get(`${base}/packages/${id}`)).data,
        { revalidateOnFocus: false }
    );

export const savePackage = async (
    id: number | null,
    body: Omit<AdminPackage, 'id' | 'uuid' | 'sold'>
): Promise<AdminPackage> =>
    (await (id === null ? http.post(`${base}/packages`, body) : http.patch(`${base}/packages/${id}`, body))).data;

export const deletePackage = async (id: number): Promise<void> => {
    await http.delete(`${base}/packages/${id}`);
};

export interface AdminOrder {
    id: number;
    uuid: string;
    user: { id: number; username: string };
    package: string;
    amount: number;
    currency: string;
    provider: string;
    status: 'pending' | 'paid' | 'canceled' | 'failed' | 'refunded';
    items: {
        name: string;
        kind: 'server' | 'box';
        renewal: boolean;
        box_id: number | null;
        server_id: number | null;
        done: boolean;
        error: string | null;
    }[];
    setting_up: boolean;
    error: string | null;
    paid_at: string | null;
    created_at: string | null;
}

export const useOrders = (search: string, page: number) =>
    useSWR(
        `admin:orders:${search}:${page}`,
        async () => {
            const { data } = await http.get(`${base}/orders`, { params: { search: search || undefined, page } });

            return {
                orders: data.orders as AdminOrder[],
                pagination: getPaginationSet(data.pagination as PaginationDataSet),
            };
        },
        { revalidateOnFocus: false }
    );

export const refundOrder = async (id: number, revoke: boolean): Promise<void> => {
    await http.post(`${base}/orders/${id}/refund`, { revoke });
};

export const fulfillOrder = async (id: number): Promise<{ setting_up: boolean; error: string | null }> =>
    (await http.post(`${base}/orders/${id}/fulfill`)).data;

export interface Payments {
    enabled: boolean;
    currency: string;
    stripe: { enabled: boolean; secret_set: boolean; webhook_secret_set: boolean; webhook_url: string };
    paypal: {
        enabled: boolean;
        client_id: string;
        secret_set: boolean;
        mode: 'live' | 'sandbox';
        webhook_id: string;
        webhook_url: string;
    };
}
