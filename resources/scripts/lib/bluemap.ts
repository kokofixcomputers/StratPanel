/**
 * BlueMap serves its web map from its own port, set in webserver.conf (HOCON, the default is 8100). Plugins (Paper and
 * friends) have it in plugins/BlueMap, mods (Fabric, Forge...) in config/bluemap.
 */
import loadDirectory from '@/api/server/files/loadDirectory';
import { readOptionalFile } from '@/lib/minecraft';

export const CONFIG_PATHS = ['/plugins/BlueMap/webserver.conf', '/config/bluemap/webserver.conf'];

export interface BlueMap {
    path: string;
    // The current file. Empty until BlueMap has run once and written its default config.
    content: string;
    port: number | null;
    enabled: boolean;
}

// "port: 8100", "port = 8100" and "port=8100 # comment" are all HOCON, only a line that starts with the key counts.
const PORT_LINE = /^(\s*port\s*[:=]\s*)([^\s#/]+)(.*)$/m;

export const readPort = (content: string): number | null => {
    const port = parseInt(PORT_LINE.exec(content)?.[2] ?? '', 10);

    return isNaN(port) ? null : port;
};

/** False only when the web server is switched off, so a config without the key counts as enabled like BlueMap does. */
export const readEnabled = (content: string): boolean => !/^\s*enabled\s*[:=]\s*false\b/m.test(content);

/** Points the web server at a port and keeps the rest of the file, including the formatting of the port line. */
export const withPort = (content: string, port: number): string => {
    if (PORT_LINE.test(content)) return content.replace(PORT_LINE, `$1${port}$3`);

    return `${content.replace(/\s*$/, '')}${content.trim() ? '\n' : ''}port: ${port}\n`;
};

/** Looks for BlueMap by its config file. Without one it has not run yet and there is nothing to change. */
export const detectBlueMap = async (uuid: string): Promise<BlueMap | { path: string; waiting: true } | null> => {
    for (const path of CONFIG_PATHS) {
        const content = await readOptionalFile(uuid, path);
        if (content !== null) return { path, content, port: readPort(content), enabled: readEnabled(content) };
    }

    for (const directory of ['/plugins', '/mods']) {
        const files = await loadDirectory(uuid, directory).catch(() => []);
        if (files.some((file) => file.isFile && /^bluemap/i.test(file.name) && file.name.endsWith('.jar'))) {
            return { path: CONFIG_PATHS[directory === '/plugins' ? 0 : 1], waiting: true };
        }
    }

    return null;
};
