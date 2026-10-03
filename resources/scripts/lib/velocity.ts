/**
 * A small, comment-preserving reader / writer for velocity.toml. Velocity's config only uses a handful of TOML
 * features (strings, numbers, booleans, arrays of strings and a few tables) so a full TOML library is not needed.
 */
export type TomlValue = string | number | boolean | string[];

export interface ProxyServer {
    id: string;
    name: string;
    address: string;
    join: boolean;
}

export interface ForcedHost {
    id: string;
    host: string;
    servers: string[];
}

export interface ProxyConfig {
    root: Record<string, TomlValue>;
    advanced: Record<string, TomlValue>;
    query: Record<string, TomlValue>;
    servers: ProxyServer[];
    forcedHosts: ForcedHost[];
}

let counter = 0;
export const uid = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---- tokenizer --------------------------------------------------------------------------------

const readString = (text: string, start: number): [string, number] => {
    let i = start + 1;
    let out = '';
    while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
            const next = text[i + 1];
            out += next === 'n' ? '\n' : next === 't' ? '\t' : next;
            i += 2;
        } else {
            out += text[i++];
        }
    }

    return [out, i + 1];
};

const skipSpace = (text: string, start: number, newlines = false): number => {
    let i = start;
    while (i < text.length) {
        if (text[i] === '#') {
            while (i < text.length && text[i] !== '\n') i++;
        } else if (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || (newlines && text[i] === '\n')) {
            i++;
        } else {
            break;
        }
    }

    return i;
};

const readValue = (text: string, start: number): [TomlValue, number] => {
    if (text[start] === '"') return readString(text, start);

    if (text[start] === '[') {
        const items: string[] = [];
        let i = skipSpace(text, start + 1, true);
        while (i < text.length && text[i] !== ']') {
            if (text[i] === '"') {
                const [value, next] = readString(text, i);
                items.push(value);
                i = next;
            } else {
                i++;
            }
            i = skipSpace(text, i, true);
            if (text[i] === ',') i = skipSpace(text, i + 1, true);
        }

        return [items, i + 1];
    }

    let i = start;
    while (i < text.length && text[i] !== '\n' && text[i] !== '#') i++;
    const raw = text.slice(start, i).trim();
    const value: TomlValue =
        raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;

    return [value, i];
};

const parseBody = (body: string): [string, TomlValue][] => {
    const entries: [string, TomlValue][] = [];
    let i = skipSpace(body, 0, true);
    while (i < body.length) {
        let key = '';
        if (body[i] === '"') {
            [key, i] = readString(body, i);
        } else {
            const start = i;
            while (i < body.length && /[\w.-]/.test(body[i])) i++;
            key = body.slice(start, i);
        }
        if (!key) {
            i = skipSpace(body, i + 1, true);
            continue;
        }

        i = skipSpace(body, i);
        if (body[i] !== '=') {
            i = skipSpace(body, i + 1, true);
            continue;
        }

        const [value, next] = readValue(body, skipSpace(body, i + 1));
        entries.push([key, value]);
        i = skipSpace(body, next, true);
    }

    return entries;
};

// ---- document structure -----------------------------------------------------------------------

interface Section {
    name: string;
    header: string | null;
    lines: string[];
}

const HEADER = /^\s*\[([^[\]]+)\]\s*$/;

const split = (text: string): Section[] => {
    const sections: Section[] = [{ name: '', header: null, lines: [] }];
    text.split(/\r?\n/).forEach((line) => {
        const match = line.match(HEADER);
        if (match) {
            sections.push({ name: match[1].trim(), header: line, lines: [] });
        } else {
            sections[sections.length - 1].lines.push(line);
        }
    });

    return sections;
};

const join = (sections: Section[]): string =>
    sections
        .map((s) => (s.header === null ? s.lines : [s.header, ...s.lines]).join('\n'))
        .join('\n')
        .replace(/\n*$/, '\n');

const toObject = (entries: [string, TomlValue][]) => Object.fromEntries(entries) as Record<string, TomlValue>;

export const parseVelocity = (text: string): ProxyConfig => {
    const sections = split(text);
    const body = (name: string) => parseBody((sections.find((s) => s.name === name)?.lines || []).join('\n'));

    const serverEntries = body('servers');
    const tryOrder = (serverEntries.find(([key]) => key === 'try')?.[1] as string[] | undefined) || [];
    const servers: ProxyServer[] = serverEntries
        .filter(([key, value]) => key !== 'try' && typeof value === 'string')
        .map(([name, address]) => ({ id: uid(), name, address: address as string, join: tryOrder.includes(name) }));

    // Servers that are used for joining come first, in the order they are tried.
    servers.sort((a, b) => {
        const ia = a.join ? tryOrder.indexOf(a.name) : Infinity;
        const ib = b.join ? tryOrder.indexOf(b.name) : Infinity;

        return ia === ib ? 0 : ia - ib;
    });

    return {
        root: toObject(parseBody(sections[0].lines.join('\n'))),
        advanced: toObject(body('advanced')),
        query: toObject(body('query')),
        servers,
        forcedHosts: body('forced-hosts').map(([host, value]) => ({
            id: uid(),
            host,
            servers: Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
        })),
    };
};

// ---- writer -----------------------------------------------------------------------------------

export const tomlString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const bareKey = (key: string) => (/^[\w-]+$/.test(key) ? key : tomlString(key));

export const formatValue = (value: TomlValue): string =>
    Array.isArray(value)
        ? `[${value.map(tomlString).join(', ')}]`
        : typeof value === 'string'
        ? tomlString(value)
        : String(value);

const setScalars = (section: Section, values: Record<string, TomlValue>) => {
    Object.keys(values).forEach((key) => {
        const line = `${bareKey(key)} = ${formatValue(values[key])}`;
        const pattern = new RegExp(`^\\s*"?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\\s*=`);
        const index = section.lines.findIndex((l) => pattern.test(l));

        if (index >= 0) {
            section.lines[index] = line;
        } else {
            // Insert before trailing blank lines so the section keeps its spacing.
            let end = section.lines.length;
            while (end > 0 && section.lines[end - 1].trim() === '') end--;
            section.lines.splice(end, 0, line);
        }
    });
};

const leadingComments = (lines: string[]): string[] => {
    const out: string[] = [];
    for (const line of lines) {
        if (line.trim() === '' || line.trim().startsWith('#')) out.push(line);
        else break;
    }

    return out;
};

const getSection = (sections: Section[], name: string): Section => {
    let section = sections.find((s) => s.name === name);
    if (!section) {
        section = { name, header: `[${name}]`, lines: [''] };
        sections.push(section);
    }

    return section;
};

/** Writes the model back into the original document, keeping comments and unknown settings intact. */
export const serializeVelocity = (original: string, config: ProxyConfig): string => {
    const sections = split(original);

    setScalars(sections[0], config.root);
    if (Object.keys(config.advanced).length) setScalars(getSection(sections, 'advanced'), config.advanced);
    if (Object.keys(config.query).length) setScalars(getSection(sections, 'query'), config.query);

    const servers = getSection(sections, 'servers');
    const tryList = config.servers.filter((s) => s.join && s.name).map((s) => s.name);
    servers.lines = [
        ...leadingComments(servers.lines).filter((l) => l.trim() !== ''),
        ...config.servers.filter((s) => s.name).map((s) => `${bareKey(s.name)} = ${tomlString(s.address)}`),
        '',
        '# In what order we should try servers when a player logs in or is kicked from a server.',
        'try = [',
        ...tryList.map((name, index) => `    ${tomlString(name)}${index < tryList.length - 1 ? ',' : ''}`),
        ']',
        '',
    ];

    const forced = getSection(sections, 'forced-hosts');
    forced.lines = [
        ...leadingComments(forced.lines).filter((l) => l.trim() !== ''),
        ...config.forcedHosts
            .filter((f) => f.host && f.servers.length)
            .map((f) => `${tomlString(f.host)} = [${f.servers.map(tomlString).join(', ')}]`),
        '',
    ];

    return join(sections);
};

// ---- constants used by the UI -------------------------------------------------------------------

export const FORWARDING_MODES = [
    { value: 'NONE', label: 'None', hint: 'No forwarding. Backend servers see the proxy as the player.' },
    { value: 'LEGACY', label: 'Legacy (BungeeCord)', hint: 'BungeeCord style forwarding, works with old versions.' },
    {
        value: 'BUNGEEGUARD',
        label: 'BungeeGuard',
        hint: 'Legacy forwarding with a secret token. Needs the BungeeGuard plugin.',
    },
    {
        value: 'MODERN',
        label: 'Modern (recommended)',
        hint: 'Secure forwarding for Minecraft 1.13+, uses the forwarding secret.',
    },
];

export const randomSecret = (length = 12): string => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};
