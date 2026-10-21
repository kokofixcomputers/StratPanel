/**
 * Geyser lets Bedrock players join a Java server. Its config.yml has a `bedrock:` section with the port it listens on, a second port for
 * NetherNet (`webrtc-port`) and the way Bedrock players can connect (`transport`). This reads those and points them at allocations of the
 * server, line by line so the comments of the file stay where they are. The plugin keeps the file in its own folder, mods in config/.
 */
import loadDirectory from '@/api/server/files/loadDirectory';
import { readOptionalFile } from '@/lib/minecraft';

export type Transport = 'raknet' | 'nethernet' | 'both';

export const TRANSPORTS: { id: Transport; name: string; ports: 1 | 2; description: string }[] = [
    {
        id: 'raknet',
        name: 'RakNet',
        ports: 1,
        description:
            'The old way Bedrock connects, over one UDP port. Bedrock Edition will stop supporting it in a future version.',
    },
    {
        id: 'nethernet',
        name: 'NetherNet',
        ports: 1,
        description: 'The new way Bedrock Edition connects. One port, used over TCP and UDP.',
    },
    {
        id: 'both',
        name: 'NetherNet and RakNet',
        ports: 2,
        description:
            'Both ways. Needs two ports: one for RakNet (and the signaling of NetherNet), one for NetherNet itself.',
    },
];

export const CONFIG_PATHS = [
    '/plugins/Geyser-Spigot/config.yml',
    '/plugins/Geyser-Velocity/config.yml',
    '/plugins/Geyser-BungeeCord/config.yml',
    '/config/Geyser-Fabric/config.yml',
    '/config/Geyser-NeoForge/config.yml',
    '/config/Geyser-Forge/config.yml',
];

export interface Bedrock {
    transport: Transport | null;
    port: number | null;
    webrtcPort: number | null;
    // Newer versions of Geyser have a transport and a NetherNet port, older ones only listen on one UDP port.
    hasTransport: boolean;
    hasWebrtcPort: boolean;
}

export interface Geyser {
    path: string;
    content: string;
    bedrock: Bedrock;
}

/** The lines of the top level section `bedrock:`: where it starts and ends (the end is the first line after it that is not indented). */
const section = (lines: string[]): [number, number] | null => {
    const start = lines.findIndex((line) => /^bedrock:\s*(#.*)?$/.test(line));
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i]) && !lines[i].startsWith('#')) {
            end = i;
            break;
        }
    }

    return [start, end];
};

const keyLine = (key: string) => new RegExp(`^(\\s+${key}:\\s*)([^\\s#]*)(.*)$`);

const find = (lines: string[], [start, end]: [number, number], key: string): number => {
    for (let i = start + 1; i < end; i++) if (keyLine(key).test(lines[i])) return i;

    return -1;
};

export const readBedrock = (content: string): Bedrock => {
    const lines = content.split(/\r?\n/);
    const range = section(lines);
    const empty: Bedrock = { transport: null, port: null, webrtcPort: null, hasTransport: false, hasWebrtcPort: false };
    if (!range) return empty;

    const value = (key: string) => {
        const at = find(lines, range, key);

        return at === -1 ? null : lines[at].match(keyLine(key))![2].replace(/^["']|["']$/g, '');
    };
    const number = (key: string) => {
        const raw = value(key);
        const parsed = raw === null ? NaN : parseInt(raw, 10);

        return isNaN(parsed) ? null : parsed;
    };
    const transport = value('transport');

    return {
        transport: transport === 'raknet' || transport === 'nethernet' || transport === 'both' ? transport : null,
        port: number('port'),
        webrtcPort: number('webrtc-port'),
        hasTransport: find(lines, range, 'transport') !== -1,
        hasWebrtcPort: find(lines, range, 'webrtc-port') !== -1,
    };
};

/**
 * Sets how Bedrock players connect and the ports for it: `port` is the allocation (RakNet and the signaling of NetherNet listen on it),
 * `webrtc-port` is the second allocation of NetherNet and RakNet together. With NetherNet alone it is 0, the one port is used for both.
 * Throws when the file is not one this can change.
 */
export const applyBedrock = (
    content: string,
    transport: Transport,
    port: number,
    webrtcPort: number | null
): string => {
    const lines = content.split(/\r?\n/);
    const range = section(lines);
    if (!range) throw new Error('There is no bedrock section in the config of Geyser.');

    const set = (key: string, value: string, required: boolean) => {
        const at = find(lines, range, key);
        if (at === -1) {
            if (required) throw new Error(`The config of Geyser has no "${key}" line.`);

            return;
        }
        lines[at] = lines[at].replace(keyLine(key), (_all, before, _old, after) => `${before}${value}${after}`);
    };

    // An older Geyser has no NetherNet: it can only be RakNet on its one port.
    if (transport !== 'raknet' && find(lines, range, 'transport') === -1) {
        throw new Error('This version of Geyser has no NetherNet yet, update Geyser or choose RakNet.');
    }

    set('port', String(port), true);
    set('transport', transport, false);
    if (transport === 'both') {
        if (webrtcPort === null) throw new Error('NetherNet and RakNet together need a second port.');
        set('webrtc-port', String(webrtcPort), true);
    } else if (transport === 'nethernet') {
        set('webrtc-port', '0', false);
    }

    return lines.join('\n');
};

const isGeyserJar = (name: string) => /^geyser.*\.jar$/i.test(name);

/**
 * Looks for Geyser on the server: by its config, or by the jar when the server has not been started since it was put there (the config is
 * written the first time it runs).
 */
export const detectGeyser = async (uuid: string): Promise<Geyser | { path: string; waiting: true } | null> => {
    for (const path of CONFIG_PATHS) {
        const content = await readOptionalFile(uuid, path);
        if (content !== null && section(content.split(/\r?\n/)))
            return { path, content, bedrock: readBedrock(content) };
    }

    const has = async (directory: string) =>
        (await loadDirectory(uuid, directory).catch(() => [])).some((file) => file.isFile && isGeyserJar(file.name));
    if (await has('/plugins')) return { path: CONFIG_PATHS[0], waiting: true };
    if (await has('/mods')) return { path: CONFIG_PATHS[3], waiting: true };

    return null;
};
