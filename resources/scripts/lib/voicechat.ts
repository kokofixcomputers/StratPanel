/**
 * Simple Voice Chat keeps its own UDP port in voicechat-server.properties. Plugins (Paper and friends) have it in
 * plugins/voicechat, mods (Fabric, Forge...) in config/voicechat.
 */
import loadDirectory from '@/api/server/files/loadDirectory';
import { parseProperties, readOptionalFile, serializeProperties } from '@/lib/minecraft';

export const CONFIG_PATHS = [
    '/plugins/voicechat/voicechat-server.properties',
    '/config/voicechat/voicechat-server.properties',
];

export interface VoiceChat {
    path: string;
    // The current file, empty when it has not been generated yet.
    content: string;
    // The configured port, -1 means it shares the Minecraft port.
    port: number | null;
}

export const readPort = (content: string): number | null => {
    const value = parseProperties(content)
        .find((line) => line.key === 'port')
        ?.value.trim();
    const port = value === undefined ? NaN : parseInt(value, 10);

    return isNaN(port) ? null : port;
};

/**
 * Points voice chat at an allocation: the port it listens on and voice_host, the address players are told to connect to
 * (host and port, which can differ from the one the server listens on).
 */
export const withAllocation = (content: string, port: number, host: string): string => {
    const values = { port: String(port), voice_host: `${host}:${port}` };

    return content.trim()
        ? serializeProperties(content, values)
        : `port=${values.port}\nvoice_host=${values.voice_host}\n`;
};

const hasJar = async (uuid: string, directory: string): Promise<boolean> =>
    (await loadDirectory(uuid, directory).catch(() => [])).some(
        (file) => file.isFile && /voice-?chat/i.test(file.name) && file.name.toLowerCase().endsWith('.jar')
    );

/**
 * Looks for Simple Voice Chat on the server: first by its config file, then by the jar for installs that never
 * generated the config yet.
 */
export const detectVoiceChat = async (uuid: string): Promise<VoiceChat | null> => {
    for (const path of CONFIG_PATHS) {
        const content = await readOptionalFile(uuid, path);
        if (content !== null) return { path, content, port: readPort(content) };
    }

    if (await hasJar(uuid, '/plugins')) return { path: CONFIG_PATHS[0], content: '', port: null };
    if (await hasJar(uuid, '/mods')) return { path: CONFIG_PATHS[1], content: '', port: null };

    return null;
};
