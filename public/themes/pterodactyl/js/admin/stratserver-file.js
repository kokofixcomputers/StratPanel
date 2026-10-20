// Reads the settings out of an export file of a server: either the small .json, or the .tar.gz with all the files, which holds the same
// document as stratserver.json. The archive is read as a stream and only the one entry is kept, the rest is skipped over.
// readStratserverFile(file, onProgress) resolves with the text of the document.
(function (global) {
    var NAME = 'stratserver.json';
    var BLOCK = 512;

    function text(bytes) {
        return new TextDecoder().decode(bytes).replace(/\0[\s\S]*$/, '');
    }

    function readStratserverFile(file, onProgress) {
        if (!/\.(tar\.gz|tgz)$/i.test(file.name)) return file.text();

        var reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        var chunks = [];
        var have = 0;
        var done = false;
        var read = 0;

        // Takes exactly n bytes from the stream (fewer at the end). With keep off they are only counted, so nothing is held in memory.
        async function take(n, keep) {
            var out = keep ? new Uint8Array(n) : null;
            var got = 0;
            while (got < n) {
                if (have === 0) {
                    if (done) break;
                    var r = await reader.read();
                    if (r.done) {
                        done = true;
                        break;
                    }
                    chunks.push(r.value);
                    have += r.value.length;
                    read += r.value.length;
                    if (onProgress) onProgress(read);
                }
                var first = chunks[0];
                var use = Math.min(first.length, n - got);
                if (keep) out.set(first.subarray(0, use), got);
                got += use;
                have -= use;
                if (use === first.length) chunks.shift();
                else chunks[0] = first.subarray(use);
            }
            return keep ? out.subarray(0, got) : got;
        }

        return (async function () {
            try {
                while (true) {
                    var header = await take(BLOCK, true);
                    if (
                        header.length < BLOCK ||
                        header.every(function (b) {
                            return b === 0;
                        })
                    )
                        break;

                    var name = text(header.subarray(0, 100));
                    var prefix = text(header.subarray(345, 500));
                    var size = parseInt(text(header.subarray(124, 136)).trim() || '0', 8);
                    var full = (prefix ? prefix + '/' : '') + name;
                    var padded = Math.ceil(size / BLOCK) * BLOCK;

                    if (full.replace(/^\.\//, '') === NAME) {
                        if (size > 5 * 1024 * 1024) throw new Error('The settings in that file are too big.');
                        var body = await take(padded, true);

                        return new TextDecoder().decode(body.subarray(0, size));
                    }
                    await take(padded, false);
                }
            } finally {
                reader.cancel().catch(function () {});
            }

            throw new Error('There is no ' + NAME + ' in that archive, it is not an export file.');
        })();
    }

    global.readStratserverFile = readStratserverFile;
})(typeof window !== 'undefined' ? window : globalThis);
