/**
 * The message of the day of a Velocity proxy is MiniMessage (`<green>Welcome <bold>back`), the builder of the Properties page works on
 * the value of server.properties (section signs, see lib/motd.ts). These go from one to the other for the colours and formats both have.
 * Tags that only MiniMessage has (gradients, click events...) can not be shown in the builder, `exact` says whether anything was lost.
 */
import { decodeMotd, encodeMotd } from '@/lib/motd';

const NAMED: Record<string, string> = {
    black: '0',
    dark_blue: '1',
    dark_green: '2',
    dark_aqua: '3',
    dark_red: '4',
    dark_purple: '5',
    gold: '6',
    gray: '7',
    grey: '7',
    dark_gray: '8',
    dark_grey: '8',
    blue: '9',
    green: 'a',
    aqua: 'b',
    red: 'c',
    light_purple: 'd',
    yellow: 'e',
    white: 'f',
};
const NAME_OF: Record<string, string> = {
    '0': 'black',
    '1': 'dark_blue',
    '2': 'dark_green',
    '3': 'dark_aqua',
    '4': 'dark_red',
    '5': 'dark_purple',
    '6': 'gold',
    '7': 'gray',
    '8': 'dark_gray',
    '9': 'blue',
    a: 'green',
    b: 'aqua',
    c: 'red',
    d: 'light_purple',
    e: 'yellow',
    f: 'white',
};
const FLAG_OF_TAG: Record<string, string> = {
    bold: 'l',
    b: 'l',
    italic: 'o',
    i: 'o',
    em: 'o',
    underlined: 'n',
    u: 'n',
    strikethrough: 'm',
    st: 'm',
    obfuscated: 'k',
    obf: 'k',
};
const TAG_OF_FLAG: Record<string, string> = {
    l: 'bold',
    o: 'italic',
    n: 'underlined',
    m: 'strikethrough',
    k: 'obfuscated',
};

/** The `&` codes of the builder text for a colour, a name (`red`) or a hex colour (`#ff0000`). Null when it is neither. */
const colorCode = (name: string): string | null => {
    const lower = name.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(lower)) return `&${lower}`;
    if (NAMED[lower]) return `&${NAMED[lower]}`;

    return null;
};

/** MiniMessage to the value of a server.properties motd, which the builder takes. */
export const miniToBuilder = (mini: string): { value: string; exact: boolean } => {
    let out = '';
    let exact = true;
    let color = '';
    const flags: string[] = [];

    // After something that ends a style: back to plain, then what still holds.
    const restyle = () => {
        out += '&r' + color + flags.map((f) => `&${f}`).join('');
    };

    for (let i = 0; i < mini.length; i++) {
        const char = mini[i];

        // Legacy codes are fine in Velocity's motd too, they are the same codes.
        if ((char === '&' || char === '§') && /^[0-9a-fk-orA-FK-OR]$/.test(mini[i + 1] || '')) {
            out += `&${mini[i + 1].toLowerCase()}`;
            i++;
            continue;
        }
        if (char === '&' && /^#[0-9a-fA-F]{6}/.test(mini.slice(i + 1, i + 8))) {
            out += `&${mini.slice(i + 1, i + 8).toLowerCase()}`;
            i += 7;
            continue;
        }
        if (char === '\\' && mini[i + 1] === '<') {
            out += '<';
            i++;
            continue;
        }
        if (char !== '<') {
            out += char;
            continue;
        }

        const end = mini.indexOf('>', i);
        if (end === -1) {
            out += char;
            continue;
        }
        const tag = mini.slice(i + 1, end);
        i = end;
        const closing = tag.startsWith('/');
        const name = (closing ? tag.slice(1) : tag).toLowerCase();

        if (name === 'reset') {
            out += '&r';
            color = '';
            flags.length = 0;
        } else if (name === 'newline' || name === 'br') {
            out += '\n';
        } else if (FLAG_OF_TAG[name]) {
            const flag = FLAG_OF_TAG[name];
            if (closing) {
                flags.splice(0, flags.length, ...flags.filter((f) => f !== flag));
                restyle();
            } else if (!flags.includes(flag)) {
                flags.push(flag);
                out += `&${flag}`;
            }
        } else if (colorCode(name.replace(/^color:/, '')) !== null) {
            if (closing) {
                color = '';
                restyle();
            } else {
                color = colorCode(name.replace(/^color:/, ''))!;
                // A colour in the legacy codes ends the formats, MiniMessage keeps them.
                out += color + flags.map((f) => `&${f}`).join('');
            }
        } else {
            // A gradient, a click event, a font: nothing the builder has.
            exact = false;
        }
    }

    return { value: encodeMotd(out), exact };
};

/** The value of a server.properties motd (what the builder makes) to MiniMessage. */
export const builderToMini = (value: string): string => {
    const text = decodeMotd(value);
    let out = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '&') {
            const hex = text.slice(i + 1, i + 8);
            if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                out += `<${hex.toLowerCase()}>`;
                i += 7;
                continue;
            }
            const code = (text[i + 1] || '').toLowerCase();
            if (NAME_OF[code]) {
                out += `<${NAME_OF[code]}>`;
                i++;
                continue;
            }
            if (TAG_OF_FLAG[code]) {
                out += `<${TAG_OF_FLAG[code]}>`;
                i++;
                continue;
            }
            if (code === 'r') {
                out += '<reset>';
                i++;
                continue;
            }
        }
        // A < in the text is not the start of a tag.
        out += char === '<' ? '\\<' : char;
    }

    return out;
};
