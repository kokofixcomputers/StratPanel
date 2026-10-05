import loadDirectory from '@/api/server/files/loadDirectory';
import { readOptionalFile } from '@/lib/minecraft';
import { SoftwareType } from '@/lib/mcjars';
import { MARKER, readPterodactylJson, updatePterodactylJson } from '@/lib/pterodactylJson';

export { MARKER };

export interface CurrentVersion {
    type: SoftwareType | 'VANILLA' | null;
    version: string | null;
    build: string | null;
    java?: number | null;
    source: 'panel' | 'detected';
    installedAt?: string;
}

/** The contents of pterodactyl.json, which the Versions tab writes into the server's root directory. */
interface Marker {
    software: SoftwareType;
    name: string;
    minecraftVersion: string;
    build: string;
    java: number;
    installedAt: string;
    installedBy: string;
}

/** Remembers what the Versions tab last installed, which is the only fully reliable source of truth. */
export const writeMarker = (uuid: string, marker: Omit<Marker, 'installedAt' | 'installedBy'>) =>
    updatePterodactylJson(uuid, (current) => ({
        ...current,
        ...marker,
        // Installing software replaces whatever modpack was there, the modpack installer writes its own entry after this.
        modpack: undefined,
        installedAt: new Date().toISOString(),
        installedBy: 'pterodactyl-panel',
    }));

const readMarker = async (uuid: string): Promise<CurrentVersion | null> => {
    try {
        // Be lenient so the file can also be written by hand or by other tooling.
        const data = await readPterodactylJson(uuid);
        if (!Object.keys(data).length) return null;
        const type = String(data.software || data.type || '').toUpperCase();
        const version = String(data.minecraftVersion || data.version || data.mc_version || '') || null;
        if (!type && !version) return null;

        return {
            type: (type || null) as CurrentVersion['type'],
            version,
            build: data.build ? String(data.build) : null,
            java: data.java ? Number(data.java) : null,
            source: 'panel',
            installedAt: data.installedAt as string | undefined,
        };
    } catch (e) {
        return null;
    }
};

const listNames = (uuid: string, directory: string): Promise<string[]> =>
    loadDirectory(uuid, directory)
        .then((files) => files.map((file) => file.name))
        .catch(() => []);

/**
 * Works out which software the server is running. Falls back to looking for the files that each platform leaves
 * behind when the server was set up by something other than this page.
 */
const detectCurrent = async (uuid: string, variableVersion: string | null): Promise<CurrentVersion> => {
    const marker = await readMarker(uuid);
    if (marker) return marker;

    const root = await listNames(uuid, '/');
    const has = (...names: string[]) => names.some((name) => root.includes(name));

    let type: CurrentVersion['type'] = null;
    let version = variableVersion;

    if (has('velocity.toml')) {
        type = 'VELOCITY';
    } else if (has('purpur.yml')) {
        type = 'PURPUR';
    } else if (
        has('paper.yml') ||
        has('version_history.json') ||
        (has('config') && (await listNames(uuid, '/config')).includes('paper-global.yml'))
    ) {
        type = 'PAPER';
        const history = await readOptionalFile(uuid, '/version_history.json');
        const match = history?.match(/MC: ([\w.-]+)/);
        if (match) version = match[1];
    } else if (has('spigot.yml')) {
        type = 'SPIGOT';
    } else if (has('.fabric')) {
        type = 'FABRIC';
    } else if (has('.quilt')) {
        type = 'QUILT';
    } else if (has('libraries')) {
        const libraries = await listNames(uuid, '/libraries/net');
        type = libraries.includes('neoforged')
            ? 'NEOFORGE'
            : libraries.includes('minecraftforge')
            ? 'FORGE'
            : has('server.jar')
            ? 'VANILLA'
            : null;
    } else if (has('server.jar') || has('eula.txt')) {
        type = 'VANILLA';
    }

    return { type, version, build: null, source: 'detected' };
};

/** Velocity is a proxy, so the Properties tab is replaced by the proxy configurator for it. */
export const isProxyServer = async (uuid: string): Promise<boolean> => {
    const current = await detectCurrent(uuid, null);

    return current.type === 'VELOCITY';
};

export default detectCurrent;
