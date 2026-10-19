import useSWR, { mutate } from 'swr';
import http from '@/api/http';

export interface DashboardFolder {
    id: number;
    name: string;
}

/** What the person did with a server on the dashboard. Servers without a folder and a star are not listed. */
export interface ServerMark {
    uuid: string;
    folder: number | null;
    starred: boolean;
}

export interface DashboardLayout {
    folders: DashboardFolder[];
    servers: ServerMark[];
}

const KEY = '/api/client/dashboard';

export const emptyLayout: DashboardLayout = { folders: [], servers: [] };

const toLayout = (data: any): DashboardLayout => ({
    folders: (data.attributes?.folders ?? []).map((f: any) => ({ id: f.id, name: f.name })),
    servers: (data.attributes?.servers ?? []).map((s: any) => ({
        uuid: s.uuid,
        folder: s.folder ?? null,
        starred: !!s.starred,
    })),
});

/** The folders and stars of the person, kept on the panel so they follow them to another browser. */
export const useDashboardLayout = () =>
    useSWR<DashboardLayout>(KEY, async () => toLayout((await http.get(KEY)).data), {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });

// Every call answers with the whole layout, which goes straight into the cache.
const save = async (request: Promise<{ data: any }>): Promise<DashboardLayout> => {
    const layout = toLayout((await request).data);
    await mutate(KEY, layout, false);

    return layout;
};

export const createFolder = (name: string) => save(http.post(`${KEY}/folders`, { name }));
export const renameFolder = (id: number, name: string) => save(http.patch(`${KEY}/folders/${id}`, { name }));
export const deleteFolder = (id: number) => save(http.delete(`${KEY}/folders/${id}`));
export const reorderFolders = (order: number[]) => save(http.post(`${KEY}/folders/order`, { order }));

/** Puts a server in a folder (null: out of any folder) and/or stars it. Only what is given is changed. */
export const markServer = (uuid: string, change: { folder?: number | null; starred?: boolean }) =>
    save(http.put(`${KEY}/servers/${uuid}`, change));

/** The same change on screen at once, before the panel has answered. */
export const markServerLocally = (
    layout: DashboardLayout,
    uuid: string,
    change: { folder?: number | null; starred?: boolean }
) => {
    const rest = layout.servers.filter((s) => s.uuid !== uuid);
    const was = layout.servers.find((s) => s.uuid === uuid) ?? { uuid, folder: null, starred: false };
    const next = { ...was, ...change };

    return { ...layout, servers: next.folder !== null || next.starred ? [...rest, next] : rest };
};

/** Shows a layout at once, without asking the panel; the panel's answer replaces it when it comes. */
export const showLayout = (layout: DashboardLayout) => mutate(KEY, layout, false);

/** Asks the panel for the layout again, after a change that did not go through. */
export const reloadLayout = () => mutate(KEY);
