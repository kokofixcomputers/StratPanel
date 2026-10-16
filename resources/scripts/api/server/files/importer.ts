import http from '@/api/http';

export interface ImportTestResult {
    // The SSH host key of the remote server (SFTP), empty for FTP.
    fingerprint: string;
    entries: { name: string; dir: boolean; size: number }[];
    total: number;
}

/** Connects to the remote server from the node and lists the top of the folder. Nothing is copied. */
export const testImport = async (uuid: string, payload: Record<string, unknown>): Promise<ImportTestResult> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/files/import/test`, payload, { timeout: 120000 });

    return data;
};
