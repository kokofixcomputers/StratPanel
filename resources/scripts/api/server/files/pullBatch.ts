import streamLines from '@/api/streamLines';

export interface PullBatchFile {
    url: string;
    directory: string;
    filename: string;
}

export interface PullBatchResult {
    // The files that could not be downloaded (also after the panel tried again), by their place in the list.
    failed: { index: number; error: string }[];
}

/**
 * Has the panel download a list of files to the server in one request, three at a time. The panel answers with one line for each file
 * that is done, so onProgress is called as it goes (1/100, 2/100, ...). Resolves when the list is finished.
 */
export default async (
    uuid: string,
    files: PullBatchFile[],
    onProgress: (done: number, total: number) => void
): Promise<PullBatchResult> => {
    const failed: PullBatchResult['failed'] = [];
    let total = files.length;
    let finished = false;
    let done = 0;

    onProgress(0, total);

    await streamLines(
        `/api/client/servers/${uuid}/files/pull-batch`,
        { files: files.map((f) => ({ url: f.url, directory: f.directory, filename: f.filename })) },
        (line) => {
            if (typeof line.total === 'number') total = line.total;
            if (typeof line.done === 'number' && line.index !== undefined) {
                done = line.done;
                if (line.ok === false) failed.push({ index: line.index, error: String(line.error || 'It failed.') });
                onProgress(done, total);
            }
            if (line.finished) finished = true;
        }
    );

    if (!finished) {
        throw new Error(`The connection was lost after ${done} of ${total} files. Run the install again to continue.`);
    }

    return { failed };
};
