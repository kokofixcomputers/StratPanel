import http from '@/api/http';
import { FileObject } from '@/api/server/files/loadDirectory';
import { rawDataToFileObject } from '@/api/transformers';

const POLL_INTERVAL = 2000;

/**
 * Compress and decompress run as a queued job on the panel, so the request that starts them returns immediately.
 * This follows the job until it finishes, which means closing the tab never cancels the work itself.
 */
export default async (uuid: string, started: { task: string }): Promise<FileObject | null> => {
    for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        const { data } = await http.get(`/api/client/servers/${uuid}/files/task/${started.task}`, {
            headers: { 'X-Panel-Background': '1' },
        });

        if (data.status === 'failed') throw new Error(data.error || 'The task failed.');
        if (data.status === 'done') return data.file ? rawDataToFileObject(data.file) : null;
    }
};
