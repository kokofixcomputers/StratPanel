/**
 * WorldEdit keeps its saved schematics in a "schematics" folder inside its own folder. The plugin has that in
 * plugins/WorldEdit (FastAsyncWorldEdit in plugins/FastAsyncWorldEdit), the Fabric, Forge and NeoForge mods in
 * config/worldedit. The tools can drop a schematic there so //schem load finds it straight away.
 */
import axios from 'axios';
import createDirectory from '@/api/server/files/createDirectory';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import loadDirectory, { FileObject } from '@/api/server/files/loadDirectory';

export const MAX_SCHEMATIC_BYTES = 25 * 1024 * 1024;

const isFawe = (name: string) => /fastasyncworldedit|^fawe/i.test(name);
const isWorldEdit = (name: string) => isFawe(name) || /^worldedit/i.test(name);

const list = (uuid: string, directory: string): Promise<FileObject[]> => loadDirectory(uuid, directory).catch(() => []);

/**
 * The schematics folder of the WorldEdit on this server, or null when there is none. A folder or a jar counts, a jar
 * for a server that never ran has no folder yet and it is created on the first save.
 */
export const findSchematicsFolder = async (uuid: string): Promise<string | null> => {
    const plugins = await list(uuid, '/plugins');
    const found = plugins
        .filter((f) => (f.isFile ? f.name.toLowerCase().endsWith('.jar') : true) && isWorldEdit(f.name))
        // FastAsyncWorldEdit replaces WorldEdit, and the folder wins over a jar that only says it is installed.
        .sort((a, b) => Number(isFawe(b.name)) - Number(isFawe(a.name)) || Number(a.isFile) - Number(b.isFile))[0];
    if (found)
        return `/plugins/${
            found.isFile ? (isFawe(found.name) ? 'FastAsyncWorldEdit' : 'WorldEdit') : found.name
        }/schematics`;

    const config = await list(uuid, '/config');
    const folder = config.find((f) => !f.isFile && f.name.toLowerCase() === 'worldedit');
    if (folder) return `/config/${folder.name}/schematics`;

    const mods = await list(uuid, '/mods');
    if (mods.some((f) => f.isFile && f.name.toLowerCase().endsWith('.jar') && /worldedit/i.test(f.name))) {
        return '/config/worldedit/schematics';
    }

    return null;
};

/** A file name WorldEdit can load: no folders, no odd characters, and the .schem extension. */
export const schematicName = (name: string): string => {
    const base = name
        .replace(/\.(schem|schematic)$/i, '')
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^[._]+/, '')
        .slice(0, 80);

    return `${base || 'schematic'}.schem`;
};

/** Writes a schematic into the folder, creating the folder first when WorldEdit has not made it yet. */
export const saveSchematic = async (uuid: string, folder: string, name: string, data: ArrayBuffer): Promise<string> => {
    let parent = '/';
    for (const segment of folder.split('/').filter(Boolean)) {
        await createDirectory(uuid, parent, segment).catch(() => undefined);
        parent = `${parent === '/' ? '' : parent}/${segment}`;
    }

    const fileName = schematicName(name);
    const url = await getFileUploadUrl(uuid);
    await axios.post(
        url,
        { files: new File([data], fileName, { type: 'application/octet-stream' }) },
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { directory: folder } }
    );

    return `${folder}/${fileName}`;
};
