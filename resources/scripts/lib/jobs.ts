import { isActive, ServerJob } from '@/api/server/jobs';

/** 0 to 100. */
export const percent = (done: number, total: number): number =>
    total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;

export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = -1;
    do {
        value /= 1024;
        i++;
    } while (value >= 1024 && i < units.length - 1);

    return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[i]}`;
};

const KINDS: Record<string, string> = {
    import: 'Import',
    compress: 'Archive',
    decompress: 'Extract',
    pull: 'Download',
};

export const kindLabel = (job: Pick<ServerJob, 'type'>): string => KINDS[job.type] ?? job.type;

export const statusLabel = (job: Pick<ServerJob, 'status'>): string =>
    ({
        scanning: 'Preparing',
        running: 'Running',
        finished: 'Finished',
        failed: 'Failed',
        cancelled: 'Cancelled',
        interrupted: 'Interrupted',
    }[job.status]);

/**
 * How far a job is, 0 to 100, or null when that is not known (a scan that is still counting, a download of a size nobody told).
 * Files when there are several, bytes when it is one big file or an archive.
 */
export const jobPercent = (job: ServerJob): number | null => {
    if (job.status === 'finished') return 100;
    if (job.status === 'scanning') return null;
    if (job.type === 'compress' || job.type === 'decompress') {
        return job.bytesTotal > 0 ? percent(job.bytes, job.bytesTotal) : null;
    }
    if (job.files > 1) return percent(job.done, job.files);
    if (job.bytesTotal > 0) return percent(job.bytes, job.bytesTotal);
    if (job.files === 1) return percent(job.done, 1);

    return null;
};

/** A line of numbers for under the bar. */
export const jobDetail = (job: ServerJob): string => {
    if (job.status === 'scanning') {
        return job.scanned > 0
            ? `Looking at the files... ${job.scanned} found in ${job.folders} folders so far`
            : job.type === 'import'
            ? 'Connected. Looking at the files...'
            : 'Getting ready...';
    }
    const parts: string[] = [];
    if (job.files > 1 || job.type === 'import') parts.push(`${job.done} of ${job.files} files`);
    if (job.bytes > 0) {
        parts.push(
            job.bytesTotal > 0 ? `${formatBytes(job.bytes)} of ${formatBytes(job.bytesTotal)}` : formatBytes(job.bytes)
        );
    }
    if (job.skipped > 0) parts.push(`${job.skipped} kept as they were`);
    if (job.failed > 0) parts.push(`${job.failed} failed`);

    return parts.join(' · ');
};

/** What a finished job made, for a short line, null when it made nothing. */
export const jobResultLine = (job: ServerJob): string | null => {
    if (job.status !== 'finished') return null;
    if (job.type === 'compress' && job.result?.name) return `Made ${job.result.name}`;
    if (job.type === 'import') {
        const copied = job.done - job.failed - job.skipped;

        return `${copied} files copied${job.skipped ? `, ${job.skipped} kept as they were` : ''}${
            job.failed ? `, ${job.failed} failed` : ''
        }`;
    }
    if (job.type === 'pull') return `${job.done - job.failed} of ${job.files} downloaded`;

    return null;
};

export const anyActive = (jobs: ServerJob[] | undefined): boolean => !!jobs && jobs.some(isActive);
