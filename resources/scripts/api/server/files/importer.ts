import http from '@/api/http';
import streamLines from '@/api/streamLines';

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

/** Copies the folder into the server. onLine gets every line the node sends; resolves when it is over, aborting the signal cancels it. */
export const runImport = (
    uuid: string,
    payload: Record<string, unknown>,
    onLine: (line: any) => void,
    signal?: AbortSignal
): Promise<void> => streamLines(`/api/client/servers/${uuid}/files/import`, payload, onLine, signal);
