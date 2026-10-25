import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export interface Share {
    memory: number;
    disk: number;
    cpu: number;
}

export interface SplitPart extends Share {
    uuid: string;
    name: string;
    isRoot: boolean;
}

export interface SplitState {
    root: string;
    current: string;
    canManage: boolean;
    splittable: boolean;
    isPart: boolean;
    maxParts: number;
    minimum: Share;
    total: Share;
    parts: SplitPart[];
}

const toState = (data: any): SplitState => ({
    root: data.root,
    current: data.current,
    canManage: !!data.can_manage,
    splittable: !!data.splittable,
    isPart: !!data.is_part,
    maxParts: data.max_parts,
    minimum: data.minimum,
    total: data.total,
    parts: (data.parts as any[]).map((part) => ({
        uuid: part.uuid,
        name: part.name,
        isRoot: !!part.is_root,
        memory: part.memory,
        disk: part.disk,
        cpu: part.cpu,
    })),
});

export const useSplit = (config?: ConfigInterface<SplitState, AxiosError>) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    return useSWR<SplitState, AxiosError>(
        [uuid, '/split'],
        async () => toState((await http.get(`/api/client/servers/${uuid}/split`)).data),
        { revalidateOnMount: true, revalidateOnFocus: false, ...(config || {}) }
    );
};

/** Splits a new part off, with this share of the server. */
export const splitServer = async (uuid: string, name: string, share: Share): Promise<SplitState> =>
    toState((await http.post(`/api/client/servers/${uuid}/split`, { name, ...share })).data);

/** Divides the total in another way, every part is in the list. */
export const divideServer = async (uuid: string, parts: Array<Share & { uuid: string }>): Promise<SplitState> =>
    toState((await http.put(`/api/client/servers/${uuid}/split`, { parts })).data);

/** Deletes a part, the first server gets its share back. */
export const removePart = async (uuid: string, part: string): Promise<SplitState> =>
    toState((await http.delete(`/api/client/servers/${uuid}/split/${part}`)).data);
