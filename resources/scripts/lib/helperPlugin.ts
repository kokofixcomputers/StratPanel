/**
 * The Stratosphere helper is shipped with the panel (public/helper) and put into the plugins folder of servers that run Paper
 * or Spigot, or into the mods folder of servers that run Fabric or NeoForge. It is uploaded from the browser, which works
 * whatever the network between the node and the panel looks like.
 */
import axios from 'axios';
import createDirectory from '@/api/server/files/createDirectory';
import deleteFiles from '@/api/server/files/deleteFiles';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import loadDirectory from '@/api/server/files/loadDirectory';

export interface HelperBuild {
    // The name of the jar in public/helper, and the one it gets on the server.
    file: string;
    // Where the server loads it from.
    folder: string;
    // The entry of public/helper/version.json that holds its version, null for the plugin (the top level version).
    key: 'fabric' | 'neoforge' | null;
}

// Purpur is a Paper fork and loads the same plugin. Fabric and NeoForge each have a mod that works on 1.20 (NeoForge 1.20.2) to 1.21.11
// and on 26.1 and newer with the one jar.
const PLUGIN: HelperBuild = { file: 'Stratosphere.jar', folder: '/plugins', key: null };
const BUILDS: Record<string, HelperBuild> = {
    PAPER: PLUGIN,
    SPIGOT: PLUGIN,
    PURPUR: PLUGIN,
    FABRIC: { file: 'Stratosphere-fabric.jar', folder: '/mods', key: 'fabric' },
    NEOFORGE: { file: 'Stratosphere-neoforge.jar', folder: '/mods', key: 'neoforge' },
};

export const HELPER_FILE = PLUGIN.file;
export const HELPER_SOFTWARE = Object.keys(BUILDS);

// Arclight runs mods of the loader that was chosen with it, so the helper is the mod of that loader. There is none for Forge.
const BY_LOADER: Record<string, HelperBuild | null> = { fabric: BUILDS.FABRIC, neoforge: BUILDS.NEOFORGE, forge: null };

/**
 * The helper that fits a kind of server software (PAPER, fabric, ...), null when there is none. Software with several mod loaders
 * (Arclight) needs the loader as well.
 */
export const helperBuild = (software: string | null | undefined, loader?: string | null): HelperBuild | null => {
    const key = (software || '').toUpperCase();
    if (key === 'ARCLIGHT') return (loader && BY_LOADER[loader.toLowerCase()]) || null;

    return (key && BUILDS[key]) || null;
};

export const wantsHelper = (software: string | null | undefined, loader?: string | null): boolean =>
    !!helperBuild(software, loader);

/** Puts the bundled helper into /plugins or /mods, replacing an older copy of itself. */
export const installHelperPlugin = async (uuid: string, software = 'PAPER', loader?: string | null): Promise<void> => {
    const build = helperBuild(software, loader);
    if (!build) throw new Error('There is no helper for this kind of server.');

    const response = await fetch(`/helper/${build.file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('The helper is not part of this panel.');
    const jar = new File([await response.blob()], build.file, { type: 'application/java-archive' });

    await createDirectory(uuid, '/', build.folder.slice(1)).catch(() => undefined);

    // Older builds may have another file name, two copies of the helper would fight over the same command.
    const existing = await loadDirectory(uuid, build.folder).catch(() => []);
    const stale = existing.filter(
        (f) => f.isFile && /^(stratosphere|stratpanel).*\.jar$/i.test(f.name) && f.name !== build.file
    );
    if (stale.length)
        await deleteFiles(
            uuid,
            build.folder,
            stale.map((f) => f.name),
            { permanent: true }
        ).catch(() => undefined);

    const url = await getFileUploadUrl(uuid);
    await axios.post(
        url,
        { files: jar },
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { directory: build.folder } }
    );
};

/** The version of the helper that ships with this panel for a kind of software, null when the panel has none. */
export const bundledHelperVersion = async (software = 'PAPER', loader?: string | null): Promise<string | null> => {
    const build = helperBuild(software, loader);
    if (!build) return null;

    try {
        const response = await fetch('/helper/version.json', { cache: 'no-cache' });
        if (!response.ok) return null;

        const info = await response.json();
        const version = build.key ? info.mods?.[build.key]?.version : info.version;

        return typeof version === 'string' && version ? version : null;
    } catch (e) {
        return null;
    }
};
