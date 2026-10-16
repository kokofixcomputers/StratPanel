/**
 * Splits what has arrived of a stream of JSON lines into the complete lines and the rest of a line that is still coming.
 * Lines that are not JSON are skipped.
 */
export const readLines = (buffer: string): { lines: any[]; rest: string } => {
    const parts = buffer.split('\n');
    const rest = parts.pop() ?? '';
    const lines: any[] = [];

    for (const part of parts) {
        if (!part.trim()) continue;
        try {
            lines.push(JSON.parse(part));
        } catch (e) {
            // Not ours (a proxy can add a line), nothing to report.
        }
    }

    return { lines, rest };
};
