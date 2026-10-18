import { jobProblem, startPull, waitForJob } from '@/api/server/jobs';

/**
 * Downloads a file to the server. The node does it as a job (see docs/jobs.md), so closing the page does not stop it; this resolves when
 * the download is over and throws when it failed.
 */
export default async (uuid: string, url: string, directory: string, filename?: string): Promise<void> => {
    const started = await startPull(uuid, [{ url, directory, filename }]);
    const job = await waitForJob(uuid, started.id);

    const problem = jobProblem(job);
    if (problem) throw new Error(problem);
};
