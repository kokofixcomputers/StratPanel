/**
 * Helpers that decide how console output is coloured and which lines belong together. A "chunk" is a warning or
 * error together with the lines that continue it, for example:
 *
 *   [19:36:38] [main/WARN]: Warnings were found!
 *    - Mod 'x' recommends any version of y, which is missing!
 *       - You should install any version of y.
 */
export type Level = 'warn' | 'error';

export interface ChunkState {
    level: Level;
    // Java prints its own "WARNING: ..." lines without a timestamp, consecutive ones are one chunk.
    java: boolean;
}

// eslint-disable-next-line no-control-regex
export const stripAnsi = (value: string): string => value.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

const TIMESTAMP = /^\[\d{1,2}:\d{2}:\d{2}/;

export const classify = (plain: string): { level: Level | null; java: boolean } => {
    if (TIMESTAMP.test(plain)) {
        const end = plain.indexOf(']:');
        const header = end > 0 ? plain.slice(0, end + 1) : plain.slice(0, 48);

        if (/\b(ERROR|FATAL|SEVERE)\b/.test(header)) return { level: 'error', java: false };
        if (/\b(WARN|WARNING)\b/.test(header)) return { level: 'warn', java: false };

        return { level: null, java: false };
    }

    if (/^WARNING:/.test(plain)) return { level: 'warn', java: true };
    if (/^(SEVERE|FATAL|ERROR):/.test(plain)) return { level: 'error', java: true };
    if (/^Exception in thread /.test(plain)) return { level: 'error', java: false };

    return { level: null, java: false };
};

export const isContinuation = (plain: string): boolean =>
    /^[ \t]/.test(plain) || /^Caused by:/.test(plain) || /^\.\.\. \d+ more/.test(plain);

/**
 * Given the chunk that is currently open and the next line, works out whether the line starts a new chunk, belongs
 * to the open one, or is regular output that closes it.
 */
export const nextChunk = (
    current: ChunkState | null,
    plain: string
): { state: ChunkState | null; start: boolean; belongs: boolean } => {
    const { level, java } = classify(plain);

    if (level) {
        if (current && current.java && java && current.level === level) {
            return { state: current, start: false, belongs: true };
        }

        return { state: { level, java }, start: true, belongs: true };
    }

    if (current && isContinuation(plain)) {
        return { state: current, start: false, belongs: true };
    }

    return { state: null, start: false, belongs: false };
};

const COLORS: Record<Level, string> = { warn: '\u001b[33m', error: '\u001b[31m' };

/** Colours a whole line, re-applying the colour after any reset sequences the line contains itself. */
export const colorize = (text: string, level: Level): string => {
    const code = COLORS[level];

    // eslint-disable-next-line no-control-regex
    return code + text.replace(/\u001b\[0?m/g, (reset) => reset + code) + '\u001b[0m';
};
