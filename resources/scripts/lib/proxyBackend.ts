/**
 * Setting up a server behind a Velocity proxy: it has to run in offline mode and trust the proxy's forwarding secret. Paper (and its
 * forks) keeps that in config/paper-global.yml, so a server that has no such file is not one that can be set up this way.
 */
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import { serializeProperties } from '@/lib/minecraft';
import { httpErrorToHuman } from '@/api/http';

export const PAPER_GLOBAL = '/config/paper-global.yml';
export const SERVER_PROPERTIES = '/server.properties';

const indentOf = (line: string): number => line.length - line.trimStart().length;
const isContent = (line: string): boolean => line.trim() !== '' && !line.trim().startsWith('#');

/** A secret as it is written in YAML: plain when that is certain to be read as text, otherwise in single quotes. */
export const yamlText = (value: string): string =>
    /^[A-Za-z][A-Za-z0-9]*$/.test(value) && !/^(true|false|yes|no|on|off|null|y|n)$/i.test(value)
        ? value
        : `'${value.replace(/'/g, "''")}'`;

/**
 * Sets proxies.velocity (enabled, online-mode, secret) in the text of paper-global.yml, leaving everything else, comments included, as it
 * is. What is missing is added.
 */
export const setPaperVelocity = (yaml: string, secret: string): string => {
    const newline = yaml.includes('\r\n') ? '\r\n' : '\n';
    const lines = yaml.split(/\r?\n/);
    const wanted: Array<[string, string]> = [
        ['enabled', 'true'],
        ['online-mode', 'true'],
        ['secret', yamlText(secret)],
    ];

    // The end of a block: the first line after `start` that is content and is not indented deeper than the key.
    const blockEnd = (start: number): number => {
        const indent = indentOf(lines[start]);
        let end = start + 1;
        let last = start + 1;
        for (; end < lines.length; end++) {
            if (!isContent(lines[end])) continue;
            if (indentOf(lines[end]) <= indent) break;
            last = end + 1;
        }

        return last;
    };

    const proxies = lines.findIndex((line) => /^proxies:\s*(#.*)?$/.test(line));
    if (proxies === -1) {
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        lines.push('proxies:', '  velocity:', ...wanted.map(([key, value]) => `    ${key}: ${value}`));

        return lines.join(newline) + newline;
    }

    let velocity = -1;
    for (let i = proxies + 1; i < blockEnd(proxies); i++) {
        if (/^\s+velocity:\s*(#.*)?$/.test(lines[i])) {
            velocity = i;
            break;
        }
    }

    if (velocity === -1) {
        const at = blockEnd(proxies);
        lines.splice(at, 0, '  velocity:', ...wanted.map(([key, value]) => `    ${key}: ${value}`));

        return lines.join(newline);
    }

    const keyIndent = indentOf(lines[velocity]) + 2;
    for (const [key, value] of wanted) {
        const end = blockEnd(velocity);
        let found = -1;
        for (let i = velocity + 1; i < end; i++) {
            if (indentOf(lines[i]) === keyIndent && lines[i].trim().startsWith(`${key}:`)) {
                found = i;
                break;
            }
        }
        if (found === -1) {
            lines.splice(end, 0, `${' '.repeat(keyIndent)}${key}: ${value}`);
        } else {
            // A comment at the end of the line is kept.
            const comment = lines[found].match(/\s+#.*$/)?.[0] ?? '';
            lines[found] = `${' '.repeat(keyIndent)}${key}: ${value}${comment}`;
        }
    }

    return lines.join(newline);
};

export type BackendState = 'paper' | 'other' | 'unknown';

/** Whether a server can be set up: it has config/paper-global.yml, which only Paper and its forks make. */
export const detectBackend = async (uuid: string): Promise<BackendState> => {
    try {
        await getFileContents(uuid, PAPER_GLOBAL);

        return 'paper';
    } catch (e: any) {
        // The file is not there (404, or the node says so): another kind of server. Anything else is not known.
        return e?.response?.status === 404 || e?.response?.status === 400 ? 'other' : 'unknown';
    }
};

export interface BackendResult {
    ok: boolean;
    message: string;
}

/** Turns online mode off in server.properties and sets up the forwarding secret in paper-global.yml. The server needs a restart after. */
export const configureBackend = async (uuid: string, secret: string): Promise<BackendResult> => {
    try {
        let paper: string;
        try {
            paper = await getFileContents(uuid, PAPER_GLOBAL);
        } catch (e) {
            return { ok: false, message: 'It has no config/paper-global.yml, so it is not Paper or a fork of it.' };
        }

        let properties = '';
        try {
            properties = await getFileContents(uuid, SERVER_PROPERTIES);
        } catch (e) {
            // A server that has not made its server.properties yet gets one with just this.
        }

        await saveFileContents(uuid, SERVER_PROPERTIES, serializeProperties(properties, { 'online-mode': 'false' }));
        await saveFileContents(uuid, PAPER_GLOBAL, setPaperVelocity(paper, secret));

        return {
            ok: true,
            message: 'Online mode is off and the forwarding secret is set. Restart it for this to apply.',
        };
    } catch (e) {
        return { ok: false, message: httpErrorToHuman(e) };
    }
};
