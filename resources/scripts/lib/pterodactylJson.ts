/**
 * stratosphere.json lives in the root of a server and remembers what the panel installed there: the server software,
 * the mods and plugins it installed (so they can be updated or uninstalled) and the modpack, if any. The file can
 * also be edited by hand, fields this code does not know about are always kept.
 */
import saveFileContents from '@/api/server/files/saveFileContents';
import deleteFiles from '@/api/server/files/deleteFiles';
import { readOptionalFile } from '@/lib/minecraft';

export const MARKER = 'stratosphere.json';
// Earlier versions of the panel wrote the same information to these files. They are read when the new one is not there
// yet and moved to it, see readPterodactylJson.
export const LEGACY_MARKERS = ['pterodactyl.json', '.panel-version.json'];

export interface ManagedProject {
    kind: 'mod' | 'plugin' | 'datapack';
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
    // Installed because another project needs it, the id of that project.
    dependencyOf?: string;
}

export interface ResourcePackInfo {
    projectId: string;
    title: string;
    icon: string | null;
    versionId: string;
    versionNumber: string;
    url: string;
    sha1: string;
    required: boolean;
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
    resourcePack?: ResourcePackInfo;
    [key: string]: unknown;
}

// Servers whose old file is being moved right now, a page reads the file many times and each would start another move.
const moving = new Set<string>();

/** Writes the content to the new file and, once that worked, removes the old one. Failing only means it happens later. */
const migrate = (uuid: string, raw: string, from: string) => {
    if (moving.has(uuid)) return;
    moving.add(uuid);

    saveFileContents(uuid, MARKER, raw)
        .then(() => deleteFiles(uuid, '/', [from], { permanent: true }))
        .catch(() => undefined)
        .then(() => moving.delete(uuid));
};

export const readPterodactylJson = async (uuid: string): Promise<PterodactylJson> => {
    let raw = await readOptionalFile(uuid, `/${MARKER}`);

    if (!raw) {
        for (const legacy of LEGACY_MARKERS) {
            raw = await readOptionalFile(uuid, `/${legacy}`);
            if (raw) {
                // The file of an earlier version, the information moves to its new name the first time it is read.
                migrate(uuid, raw, legacy);
                break;
            }
        }
    }
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
