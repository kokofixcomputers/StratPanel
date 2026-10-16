import { rawDataToJob, jobProblem, ServerJob } from '@/api/server/jobs';
import {
    anyActive,
    formatBytes,
    jobDetail,
    jobPercent,
    jobResultLine,
    kindLabel,
    percent,
    statusLabel,
} from '@/lib/jobs';

const job = (patch: Record<string, any> = {}): ServerJob =>
    rawDataToJob({
        object: 'server_job',
        attributes: {
            id: 'j1',
            type: 'import',
            title: 'Import /srv',
            status: 'running',
            created_at: '2026-10-16T10:00:00Z',
            ...patch,
        },
    });

describe('lib/jobs', () => {
    it('reads what the node says, with the defaults of a job that has not got far', () => {
        const j = job({
            done: 3,
            files: 10,
            bytes_total: 500,
            scan_path: 'world',
            failures: [{ path: 'a', error: 'b' }],
        });
        expect(j).toMatchObject({
            id: 'j1',
            done: 3,
            files: 10,
            bytesTotal: 500,
            scanPath: 'world',
            skipped: 0,
            error: null,
        });
        expect(j.failures).toEqual([{ path: 'a', error: 'b' }]);
        expect(j.createdAt.toISOString()).toBe('2026-10-16T10:00:00.000Z');
        expect(job().finishedAt).toBeNull();
    });

    it('computes percentages and sizes', () => {
        expect(percent(0, 0)).toBe(0);
        expect(percent(1, 3)).toBe(33);
        expect(percent(5, 3)).toBe(100);
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
        expect(formatBytes(150 * 1024 * 1024 * 1024)).toBe('150 GB');
    });

    it('knows how far a job is', () => {
        expect(jobPercent(job({ status: 'scanning' }))).toBeNull();
        expect(jobPercent(job({ status: 'finished' }))).toBe(100);
        expect(jobPercent(job({ done: 25, files: 100 }))).toBe(25);
        expect(jobPercent(job({ type: 'compress', bytes: 50, bytes_total: 200 }))).toBe(25);
        expect(jobPercent(job({ type: 'compress', bytes: 50 }))).toBeNull();
        // One download of a known size goes by its bytes.
        expect(jobPercent(job({ type: 'pull', files: 1, bytes: 30, bytes_total: 60 }))).toBe(50);
        expect(jobPercent(job({ type: 'pull', files: 3, done: 1 }))).toBe(33);
    });

    it('says what is going on', () => {
        expect(jobDetail(job({ status: 'scanning' }))).toContain('Connected');
        expect(jobDetail(job({ status: 'scanning', scanned: 500, folders: 40 }))).toBe(
            'Looking at the files... 500 found in 40 folders so far'
        );
        expect(
            jobDetail(job({ done: 10, files: 40, bytes: 1536, bytes_total: 5 * 1024 * 1024, skipped: 2, failed: 1 }))
        ).toBe('10 of 40 files · 1.5 KB of 5 MB · 2 kept as they were · 1 failed');
        expect(jobDetail(job({ type: 'compress', bytes: 2048, bytes_total: 4096 }))).toBe('2 KB of 4 KB');
    });

    it('names the kinds and the states', () => {
        expect(kindLabel(job({ type: 'compress' }))).toBe('Archive');
        expect(kindLabel(job({ type: 'something-new' }))).toBe('something-new');
        expect(statusLabel(job({ status: 'interrupted' }))).toBe('Interrupted');
    });

    it('sums up a finished job', () => {
        expect(jobResultLine(job({ status: 'running' }))).toBeNull();
        expect(jobResultLine(job({ type: 'compress', status: 'finished', result: { name: 'archive.tar.gz' } }))).toBe(
            'Made archive.tar.gz'
        );
        expect(jobResultLine(job({ status: 'finished', done: 40, files: 40, failed: 1, skipped: 2 }))).toBe(
            '37 files copied, 2 kept as they were, 1 failed'
        );
        expect(jobResultLine(job({ type: 'pull', status: 'finished', done: 5, files: 5, failed: 1 }))).toBe(
            '4 of 5 downloaded'
        );
    });

    it('explains why a job did not go well', () => {
        expect(jobProblem(job({ status: 'finished' }))).toBeNull();
        expect(jobProblem(job({ status: 'cancelled' }))).toBe('It was cancelled.');
        expect(jobProblem(job({ status: 'failed', error: 'no route to host' }))).toBe('no route to host');
        expect(jobProblem(job({ status: 'failed' }))).toBe('It failed.');
        expect(jobProblem(job({ status: 'finished', failed: 1, failures: [{ path: 'a.jar', error: '404' }] }))).toBe(
            'a.jar: 404'
        );
        expect(
            jobProblem(job({ status: 'finished', failed: 3, failures: [{ path: 'a.jar', error: '404' }] }))
        ).toContain('3 files failed');
    });

    it('tells whether anything is going', () => {
        expect(anyActive(undefined)).toBe(false);
        expect(anyActive([job({ status: 'finished' })])).toBe(false);
        expect(anyActive([job({ status: 'finished' }), job({ status: 'scanning' })])).toBe(true);
    });
});
