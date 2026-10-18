import { jobProblem, startPull, waitForJob } from '@/api/server/jobs';

export interface PullBatchFile {
    url: string;
    directory: string;
    filename: string;
}

export interface PullBatchResult {
    // The files that could not be downloaded (the node tried each of them three times), with the reason.
    failed: { name: string; error: string }[];
}

/**
 * Downloads a list of files to the server as one job on the node: three at a time, a failed file is tried again, and the job goes on if
 * the page is closed (the box in the bottom right corner shows it). onProgress is called as it goes (1/100, 2/100, ...). Resolves when the job is over.
 */
export default async (
    uuid: string,
    files: PullBatchFile[],
    onProgress: (done: number, total: number) => void
): Promise<PullBatchResult> => {
    onProgress(0, files.length);

    const started = await startPull(uuid, files);
    const job = await waitForJob(uuid, started.id, (j) => onProgress(j.done, j.files || files.length));

    if (job.status !== 'finished') {
        // Cancelled, or the node was restarted: nothing else can be said about the files.
        throw new Error(jobProblem(job) || 'The download did not finish.');
    }

    return { failed: job.failures.map((f) => ({ name: f.path, error: f.error })) };
};
