import http from '@/api/http';

export interface UpdateResult {
    name: string;
    status: string;
    detail?: string;
}

export interface UpdateStatus {
    action?: string;
    step?: string | null;
    running?: boolean;
    finished_at?: string | null;
    results?: UpdateResult[];
}

export interface Backup {
    name: string;
    size: number;
    created: number;
}

export interface UpdatesInfo {
    installed: boolean;
    status: UpdateStatus | null;
    pending: boolean;
    backups: Backup[] | null;
    wings_latest: string | null;
    node_count: number;
    tar_url: string;
    tar_nightly_url: string;
}

export interface UpdatesPoll {
    pending: boolean;
    status: UpdateStatus | null;
    backups: Backup[] | null;
}

export interface UiUpdate {
    tag: string;
    name: string;
    channel: string;
    published: string;
    command: string;
}

export const getUpdates = async (): Promise<UpdatesInfo> => (await http.get('/api/client/admin/updates')).data;

export const getUpdateStatus = async (): Promise<UpdatesPoll> =>
    (await http.get('/api/client/admin/updates/status')).data;

export const runUpdate = async (body: { action: string; channel?: string; backup?: string }): Promise<void> => {
    await http.post('/api/client/admin/updates', body);
};

export const getUiUpdate = async (): Promise<UiUpdate | null> =>
    (await http.get('/api/client/admin/ui-update')).data.update;
