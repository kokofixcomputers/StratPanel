import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ServerContext } from '@/state/server';

export type JobStatus = 'scanning' | 'running' | 'finished' | 'failed' | 'cancelled' | 'interrupted';

/** Work that runs on the node (an import, an archive, downloads) and goes on when the page is closed. */
export interface ServerJob {
    id: string;
    type: 'import' | 'compress' | 'decompress' | 'pull' | string;
    title: string;
    status: JobStatus;
    // What it was started with, never a secret.
    params: Record<string, any>;
    // While looking at what there is to do.
    scanned: number;
    folders: number;
    scanPath: string;
    files: number;
    dirs: number;
    done: number;
    skipped: number;
    failed: number;
    bytes: number;
    bytesTotal: number;
    current: string;
    failures: { path: string; error: string }[];
    warnings: string[];
    error: string | null;
    // What it made, such as the name of the archive.
    result: Record<string, any> | null;
    createdAt: Date;
    finishedAt: Date | null;
}

export const rawDataToJob = (data: any): ServerJob => {
    const a = data.attributes ?? data;

    return {
        id: a.id,
        type: a.type,
        title: a.title,
        status: a.status,
        params: a.params ?? {},
        scanned: a.scanned ?? 0,
        folders: a.folders ?? 0,
        scanPath: a.scan_path ?? '',
        files: a.files ?? 0,
        dirs: a.dirs ?? 0,
        done: a.done ?? 0,
        skipped: a.skipped ?? 0,
        failed: a.failed ?? 0,
        bytes: a.bytes ?? 0,
        bytesTotal: a.bytes_total ?? 0,
        current: a.current ?? '',
        failures: a.failures ?? [],
        warnings: a.warnings ?? [],
        error: a.error ?? null,
        result: a.result ?? null,
        createdAt: new Date(a.created_at),
        finishedAt: a.finished_at ? new Date(a.finished_at) : null,
    };
};

export const isActive = (job: Pick<ServerJob, 'status'>): boolean =>
    job.status === 'scanning' || job.status === 'running';

const POLL_SLOW = 15000;

/** The jobs of the server, newest first. The page asks for a faster refresh while one is going. */
export const useJobs = (config?: ConfigInterface<ServerJob[], AxiosError>) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    return useSWR<ServerJob[], AxiosError>(
        [uuid, '/jobs'],
        async () => {
            const { data } = await http.get(`/api/client/servers/${uuid}/jobs`, {
                headers: { 'X-Panel-Background': '1' },
            });

            return (data.data as any[]).map(rawDataToJob);
        },
        {
            revalidateOnMount: true,
            revalidateOnFocus: true,
            refreshInterval: POLL_SLOW,
            ...(config || {}),
        }
    );
};

export const getJob = async (uuid: string, id: string): Promise<ServerJob> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/jobs/${id}`, {
        headers: { 'X-Panel-Background': '1' },
    });

    return rawDataToJob(data);
};

/** Starts a download of a list of files on the node. Resolves with the job. */
export const startPull = async (
    uuid: string,
    files: { url: string; directory: string; filename?: string }[]
): Promise<ServerJob> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/jobs/pull`, { files });

    return rawDataToJob(data);
};

/** Starts copying a folder of another server into this one. */
export const startImportJob = async (uuid: string, payload: Record<string, unknown>): Promise<ServerJob> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/jobs/import`, payload, { timeout: 120000 });

    return rawDataToJob(data);
};

/** Stops a job that is going; a job that is over is removed from the list. */
export const cancelJob = async (uuid: string, id: string): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/jobs/${id}`);
};

/**
 * Follows a job until it is over and resolves with it (finished, failed, cancelled or interrupted: look at the status). onUpdate gets
 * every look. Closing the page stops this, never the job.
 */
export const waitForJob = async (
    uuid: string,
    id: string,
    onUpdate?: (job: ServerJob) => void,
    maxInterval = 1500
): Promise<ServerJob> => {
    // A small download is over within a second: look soon at first, then less often.
    let interval = 300;
    for (;;) {
        const job = await getJob(uuid, id);
        onUpdate?.(job);
        if (!isActive(job)) return job;

        await new Promise((resolve) => setTimeout(resolve, interval));
        interval = Math.min(maxInterval, Math.round(interval * 1.6));
    }
};

/** Why a job did not go well, in a sentence, null when it did. */
export const jobProblem = (job: ServerJob): string | null => {
    if (job.status === 'cancelled') return 'It was cancelled.';
    if (job.status === 'failed' || job.status === 'interrupted') return job.error || 'It failed.';
    if (job.failed > 0) {
        const first = job.failures[0];

        return job.failed === 1 && first
            ? `${first.path}: ${first.error}`
            : `${job.failed} files failed${first ? `, for example ${first.path}: ${first.error}` : ''}.`;
    }

    return null;
};
