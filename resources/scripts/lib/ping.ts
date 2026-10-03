/**
 * Measures the round trip time from the browser to a URL. Requests are sent in "no-cors" mode so any HTTP response
 * from the node counts, we only care about how long it took. The first request also pays for the TLS handshake, so
 * it is discarded when there are more samples.
 */
export const pingUrl = async (baseUrl: string, attempts = 4, timeout = 4000): Promise<number | null> => {
    const samples: number[] = [];

    for (let i = 0; i < attempts; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const start = performance.now();

        try {
            await fetch(`${baseUrl}/?ping=${Date.now()}${i}`, {
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal,
            });
            samples.push(performance.now() - start);
        } catch (e) {
            // Blocked (mixed content), offline or too slow.
            if (i === 0) {
                clearTimeout(timer);
                return null;
            }
        } finally {
            clearTimeout(timer);
        }
    }

    if (!samples.length) return null;

    const usable = samples.length > 1 ? samples.slice(1) : samples;

    return Math.max(1, Math.round(Math.min(...usable)));
};
