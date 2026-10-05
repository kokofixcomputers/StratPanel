/**
 * pterodactyl.json lives in the root of a server and remembers what the panel installed there: the server software,
 * the mods and plugins it installed (so they can be updated or uninstalled) and the modpack, if any. The file can
 * also be edited by hand, fields this code does not know about are always kept.
 */
import saveFileContents from '@/api/server/files/saveFileContents';
import { readOptionalFile } from '@/lib/minecraft';

export const MARKER = 'pterodactyl.json';
// Earlier versions of the panel wrote the same information to this hidden file.
export const LEGACY_MARKER = '.panel-version.json';

export interface ManagedProject {
    kind: 'mod' | 'plugin';
    projectId: string;
    slug: string;
    title: string;
    icon: string | null;
    versionId: string;
    versionNumber: string;
    file: string;
    directory: string;
    loaders: string[];
    gameVersion: string | null;
    installedAt: string;
}

export interface ModpackInfo {
    projectId: string;
    title: string;
    icon: string | null;
    versionId: string;
    versionNumber: string;
    installedAt: string;
}

export interface PterodactylJson {
    software?: string;
    name?: string;
    minecraftVersion?: string;
    build?: string;
    java?: number;
    installedAt?: string;
    installedBy?: string;
    mods?: Record<string, ManagedProject>;
    modpack?: ModpackInfo;
    [key: string]: unknown;
}

export const readPterodactylJson = async (uuid: string): Promise<PterodactylJson> => {
    const raw = (await readOptionalFile(uuid, `/${MARKER}`)) || (await readOptionalFile(uuid, `/${LEGACY_MARKER}`));
    if (!raw) return {};

    try {
        const data = JSON.parse(raw);

        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
        return {};
    }
};

/** Reads the file, lets the callback change it and writes it back, keeping everything the callback leaves alone. */
export const updatePterodactylJson = async (
    uuid: string,
    change: (current: PterodactylJson) => PterodactylJson
): Promise<PterodactylJson> => {
    const next = change(await readPterodactylJson(uuid));
    await saveFileContents(uuid, MARKER, JSON.stringify(next, null, 4));
    window.dispatchEvent(new CustomEvent('pterodactyl:software-changed'));

    return next;
};
