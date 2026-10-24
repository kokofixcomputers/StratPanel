/**
 * Reads the settings out of an export file of a server: either the small .json, or the .tar.gz with all the files, which holds the same
 * document as stratserver.json. The archive is read as a stream and only the one entry is kept, the rest is skipped over.
 */
const NAME = 'stratserver.json';
const BLOCK = 512;
const MAX_DOCUMENT = 5 * 1024 * 1024;

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\0[\s\S]*$/, '');

export const readStratserverFile = async (file: File, onProgress?: (bytes: number) => void): Promise<string> => {
    if (!/\.(tar\.gz|tgz)$/i.test(file.name)) return file.text();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = (file.stream() as any).pipeThrough(new (window as any).DecompressionStream('gzip')).getReader();
    const chunks: Uint8Array[] = [];
    let have = 0;
    let done = false;
    let read = 0;

    // Takes exactly n bytes from the stream (fewer at the end). Without keep they are only counted, so nothing is held in memory.
    const take = async (n: number, keep: boolean): Promise<Uint8Array> => {
        const out = new Uint8Array(keep ? n : 0);
        let got = 0;
        while (got < n) {
            if (have === 0) {
                if (done) break;
                const r = await reader.read();
                if (r.done) {
                    done = true;
                    break;
                }
                chunks.push(r.value);
                have += r.value.length;
                read += r.value.length;
                onProgress?.(read);
            }
            const first = chunks[0];
            const use = Math.min(first.length, n - got);
            if (keep) out.set(first.subarray(0, use), got);
            got += use;
            have -= use;
            if (use === first.length) chunks.shift();
            else chunks[0] = first.subarray(use);
        }

        return keep ? out.subarray(0, got) : new Uint8Array(0);
    };

    try {
        for (;;) {
            const header = await take(BLOCK, true);
            if (header.length < BLOCK || header.every((b) => b === 0)) break;

            const name = text(header.subarray(0, 100));
            const prefix = text(header.subarray(345, 500));
            const size = parseInt(text(header.subarray(124, 136)).trim() || '0', 8);
            const full = (prefix ? `${prefix}/` : '') + name;
            const padded = Math.ceil(size / BLOCK) * BLOCK;

            if (full.replace(/^\.\//, '') === NAME) {
                if (size > MAX_DOCUMENT) throw new Error('The settings in that file are too big.');
                const body = await take(padded, true);

                return new TextDecoder().decode(body.subarray(0, size));
            }
            await take(padded, false);
        }
    } finally {
        reader.cancel().catch(() => undefined);
    }

    throw new Error(`There is no ${NAME} in that archive, it is not an export file.`);
};
