import { readLines } from '@/lib/ndjson';

const cookie = (name: string): string | null => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));

    return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Posts JSON and reads the answer as a stream of JSON lines, calling onLine for each one as soon as it has arrived (axios can not do
 * that in a browser). Resolves when the answer has ended. A refusal of the panel (an answer that is not 200) becomes an Error with the
 * panel's own words, and aborting the signal stops the request, which stops the work on the node.
 */
export default async (url: string, body: unknown, onLine: (line: any) => void, signal?: AbortSignal): Promise<void> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = cookie('XSRF-TOKEN');
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;

    const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        if (response.status === 429) {
            const wait = parseInt(response.headers.get('retry-after') || '', 10);

            throw new Error(
                `This server started too many downloads in a short time.${
                    wait > 0
                        ? ` Try again in ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
                        : ' Try again in a minute or two.'
                }`
            );
        }

        let detail = `The panel answered ${response.status}.`;
        try {
            const json = await response.json();
            detail = json?.errors?.[0]?.detail || detail;
        } catch (e) {
            // Not JSON, the status says enough.
        }

        throw new Error(detail);
    }

    if (response.body && 'getReader' in response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
            const { value, done } = await reader.read();
            if (value) buffer += decoder.decode(value, { stream: !done });
            const { lines, rest } = readLines(buffer);
            buffer = rest;
            lines.forEach(onLine);
            if (done) break;
        }
        readLines(buffer + '\n').lines.forEach(onLine);
    } else {
        // A browser that can not read a stream piece by piece: everything comes at the end.
        readLines((await response.text()) + '\n').lines.forEach(onLine);
    }
};
