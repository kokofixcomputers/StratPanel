/**
 * MOTD helpers. In server.properties the message of the day is stored with Java properties escapes and Minecraft's
 * section sign colour codes (for example `§aGreen §lBold\nSecond line`). In the builder the codes are written
 * with `&` instead, which is much easier to type, and hex colours as `&#RRGGBB`.
 */
export const COLORS: Record<string, { name: string; hex: string }> = {
    '0': { name: 'Black', hex: '#000000' },
    '1': { name: 'Dark Blue', hex: '#0000AA' },
    '2': { name: 'Dark Green', hex: '#00AA00' },
    '3': { name: 'Dark Aqua', hex: '#00AAAA' },
    '4': { name: 'Dark Red', hex: '#AA0000' },
    '5': { name: 'Dark Purple', hex: '#AA00AA' },
    '6': { name: 'Gold', hex: '#FFAA00' },
    '7': { name: 'Gray', hex: '#AAAAAA' },
    '8': { name: 'Dark Gray', hex: '#555555' },
    '9': { name: 'Blue', hex: '#5555FF' },
    a: { name: 'Green', hex: '#55FF55' },
    b: { name: 'Aqua', hex: '#55FFFF' },
    c: { name: 'Red', hex: '#FF5555' },
    d: { name: 'Light Purple', hex: '#FF55FF' },
    e: { name: 'Yellow', hex: '#FFFF55' },
    f: { name: 'White', hex: '#FFFFFF' },
};

/** Turns the raw value of the motd property into the text shown in the builder. */
export const decodeMotd = (raw: string): string =>
    raw
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\')
        // §x§R§R§G§G§B§B is how hex colours are stored
        .replace(/§x(?:§[0-9a-fA-F]){6}/gi, (match) => `&#${match.replace(/§/g, '').slice(1)}`)
        .replace(/§/g, '&');

/** Turns the builder text back into a value that is safe to put in server.properties. */
export const encodeMotd = (text: string): string => {
    const converted = text
        .split('\n')
        .slice(0, 2)
        .join('\n')
        .replace(
            /&#([0-9a-fA-F]{6})/g,
            (_, hex: string) =>
                `§x${hex
                    .split('')
                    .map((c) => `§${c}`)
                    .join('')}`
        )
        .replace(/&([0-9a-fk-orA-FK-OR])/g, '§$1');

    return converted
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
};

export interface MotdSegment {
    text: string;
    color: string | null;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    obfuscated: boolean;
}

/** Splits builder text into styled pieces, one list per line, for the preview. */
export const parseMotd = (text: string): MotdSegment[][] =>
    text
        .split('\n')
        .slice(0, 2)
        .map((line) => {
            const segments: MotdSegment[] = [];
            let style = {
                color: null as string | null,
                bold: false,
                italic: false,
                underline: false,
                strike: false,
                obfuscated: false,
            };
            let buffer = '';
            const flush = () => {
                if (buffer) segments.push({ text: buffer, ...style });
                buffer = '';
            };

            for (let i = 0; i < line.length; i++) {
                if (line[i] === '&') {
                    const hex = line.slice(i + 1, i + 8).match(/^#([0-9a-fA-F]{6})$/);
                    const code = (line[i + 1] || '').toLowerCase();

                    if (hex) {
                        flush();
                        style = {
                            color: `#${hex[1]}`,
                            bold: false,
                            italic: false,
                            underline: false,
                            strike: false,
                            obfuscated: false,
                        };
                        i += 7;
                        continue;
                    }

                    if (COLORS[code]) {
                        flush();
                        // A colour code resets all formatting, like in the game.
                        style = {
                            color: COLORS[code].hex,
                            bold: false,
                            italic: false,
                            underline: false,
                            strike: false,
                            obfuscated: false,
                        };
                        i++;
                        continue;
                    }

                    if ('lonmkr'.includes(code) && code) {
                        flush();
                        if (code === 'r')
                            style = {
                                color: null,
                                bold: false,
                                italic: false,
                                underline: false,
                                strike: false,
                                obfuscated: false,
                            };
                        if (code === 'l') style = { ...style, bold: true };
                        if (code === 'o') style = { ...style, italic: true };
                        if (code === 'n') style = { ...style, underline: true };
                        if (code === 'm') style = { ...style, strike: true };
                        if (code === 'k') style = { ...style, obfuscated: true };
                        i++;
                        continue;
                    }
                }

                buffer += line[i];
            }
            flush();

            return segments;
        });

// ---------------------------------------------------------------------------------------------------------------------
// The rich editor works on formatted lines: the text plus the formatting of every single character.
// ---------------------------------------------------------------------------------------------------------------------

export interface CharFormat {
    /** #rrggbb, undefined for the default colour. */
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;
}

export interface MotdLine {
    text: string;
    // One entry per UTF-16 unit of text, so it lines up with the selection of the input.
    fmts: CharFormat[];
}

export const FLAGS = ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const;
export const MAX_LINES = 2;

const FLAG_CODES: Record<string, typeof FLAGS[number]> = {
    l: 'bold',
    o: 'italic',
    n: 'underlined',
    m: 'strikethrough',
    k: 'obfuscated',
};

const colorByHex: Record<string, string> = {};
Object.keys(COLORS).forEach((code) => (colorByHex[COLORS[code].hex.toLowerCase()] = code));

/** Java properties escapes (\n, \\, \uXXXX) back to the real characters, in one pass so `\\n` stays a backslash and an n. */
export const unescapeMotd = (raw: string): string =>
    raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, sequence: string) =>
        sequence[0] === 'u' && sequence.length === 5
            ? String.fromCharCode(parseInt(sequence.slice(1), 16))
            : sequence === 'n'
            ? '\n'
            : sequence === 't'
            ? '\t'
            : sequence
    );

/** Real characters into a value that is safe in server.properties. */
export const escapeMotd = (text: string): string =>
    text
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

/** One line of text with section sign codes into characters with their formatting. */
export const parseLegacyLine = (source: string): MotdLine => {
    let text = '';
    const fmts: CharFormat[] = [];
    let style: CharFormat = {};

    for (let i = 0; i < source.length; i++) {
        if (source[i] !== '§' || i + 1 >= source.length) {
            text += source[i];
            fmts.push({ ...style });
            continue;
        }

        const code = source[i + 1].toLowerCase();
        const hex = code === 'x' ? /^§x(?:§([0-9a-f])){6}/i.exec(source.slice(i, i + 14)) : null;

        if (hex) {
            // A colour code resets the formatting, like in the game.
            style = {
                color: `#${source
                    .slice(i, i + 14)
                    .replace(/§x|§/gi, '')
                    .toLowerCase()}`,
            };
            i += 13;
        } else if (COLORS[code]) {
            style = { color: COLORS[code].hex.toLowerCase() };
            i++;
        } else if (FLAG_CODES[code]) {
            style = { ...style, [FLAG_CODES[code]]: true };
            i++;
        } else if (code === 'r') {
            style = {};
            i++;
        } else {
            // A code the game does not know is dropped along with its section sign.
            i++;
        }
    }

    return { text, fmts };
};

/** The raw value of the motd property into the formatted lines of the editor. */
export const parseMotdLines = (raw: string): MotdLine[] => {
    const lines = unescapeMotd(raw).split('\n').slice(0, MAX_LINES).map(parseLegacyLine);

    while (lines.length < MAX_LINES) lines.push({ text: '', fmts: [] });

    return lines;
};

const sameFormat = (a: CharFormat, b: CharFormat) =>
    a.color === b.color && FLAGS.every((flag) => !!a[flag] === !!b[flag]);

const isPlain = (format: CharFormat) => !format.color && FLAGS.every((flag) => !format[flag]);

const colorCode = (hex: string): string => {
    const known = colorByHex[hex.toLowerCase()];

    return known ? `§${known}` : `§x${hex.replace('#', '').toLowerCase().replace(/./g, '§$&')}`;
};

/**
 * The formatted lines into the value of the motd property. The colour comes before the formats because a colour code
 * clears them again, and a style change starts with a reset so nothing of the previous one leaks into the next.
 */
export const encodeMotdLines = (lines: MotdLine[]): string => {
    // Trailing empty lines are dropped, the server shows one line then.
    const used = lines.slice(0, MAX_LINES);
    while (used.length > 1 && !used[used.length - 1].text) used.pop();

    const encoded = used.map((line) => {
        let out = '';
        let previous: CharFormat = {};

        for (let i = 0; i < line.text.length; i++) {
            const format = line.fmts[i] || {};

            if (!sameFormat(format, previous)) {
                if (!isPlain(previous)) out += '§r';
                if (format.color) out += colorCode(format.color);
                Object.keys(FLAG_CODES).forEach((code) => {
                    if (format[FLAG_CODES[code]]) out += `§${code}`;
                });
                previous = format;
            }

            out += line.text[i];
        }

        return out;
    });

    return escapeMotd(encoded.join('\n'));
};
