/** Uploads a log to https://mclo.gs, which hides IP addresses and returns a shareable link. */
const ENDPOINT = 'https://api.mclo.gs/1/log';
// The API accepts at most 10 MiB, keep the end of the log since that is where the problem usually is.
const MAX_CHARS = 9 * 1024 * 1024;

export interface SharedLog {
    id: string;
    url: string;
    raw: string;
}

export const trimLog = (content: string): string =>
    content.length > MAX_CHARS ? content.slice(content.length - MAX_CHARS) : content;

export const uploadLog = async (content: string): Promise<SharedLog> => {
    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ content: trimLog(content) }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
        throw new Error(body?.error || `mclo.gs responded with an error (${response.status}).`);
    }

    return { id: body.id, url: body.url, raw: body.raw };
};
