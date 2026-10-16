import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export type TrashItemType = 'file' | 'directory' | 'schedule';

export interface TrashItem {
    id: string;
    type: TrashItemType;
    name: string;
    // The folder a file was in, null for a schedule.
    path: string | null;
    size: number | null;
    deletedBy: string | null;
    deletedAt: Date | null;
    expiresAt: Date;
}

export interface TrashList {
    enabled: boolean;
    retentionDays: number;
    items: TrashItem[];
}

const toItem = (data: any): TrashItem => ({
    id: data.id,
    type: data.type,
    name: data.name,
    path: data.path,
    size: data.size,
    deletedBy: data.deleted_by,
    deletedAt: data.deleted_at ? new Date(data.deleted_at) : null,
    expiresAt: new Date(data.expires_at),
});

export const useTrash = (config?: ConfigInterface<TrashList, AxiosError>) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    return useSWR<TrashList, AxiosError>(
        [uuid, '/trash'],
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/trash`);

            return {
                enabled: !!data.enabled,
                retentionDays: data.retention_days,
                items: (data.data as any[]).map(toItem),
            };
        },
        { revalidateOnMount: true, revalidateOnFocus: false, ...(config || {}) }
    );
};

/** Puts an item back, resolves with where it is now. */
export const restoreTrashItem = async (uuid: string, id: string): Promise<string> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/trash/${id}/restore`);

    return data.restored_to;
};

export const deleteTrashItem = async (uuid: string, id: string): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/trash/${id}`);
};

export const emptyTrash = async (uuid: string): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/trash`);
};
