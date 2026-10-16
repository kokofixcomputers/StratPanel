/**
 * Reads and changes the dimensions of the server's world through the file API. A world of 26.x keeps each dimension in
 * world/dimensions/<namespace>/<name>, with its own data/minecraft/game_rules.dat and world_gen_settings.dat. Older worlds
 * keep the Nether in DIM-1 and the End in DIM1 (or in world_nether and world_the_end on Paper), those are listed so they can
 * be deleted, but they have no files that can be edited here.
 */
import axios from 'axios';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import loadDirectory, { FileObject } from '@/api/server/files/loadDirectory';
import createDirectory from '@/api/server/files/createDirectory';
import decompressFiles from '@/api/server/files/decompressFiles';
import deleteFiles from '@/api/server/files/deleteFiles';
import renameFiles from '@/api/server/files/renameFiles';
import { parseProperties, readOptionalFile } from '@/lib/minecraft';
import { DimensionKind, dimensionInfo, isSafeSegment } from '@/lib/dimensionNames';
import { NbtFile, readNbt, writeNbt } from '@/lib/nbt';

export interface Dimension {
    // "minecraft:the_nether".
    key: string;
    namespace: string;
    // The folder name.
    name: string;
    // Where it is on the server, "/world/dimensions/minecraft/the_nether".
    path: string;
    label: string;
    kind: DimensionKind;
    modified: Date | null;
    // An old world, the game rules and the seed are in other files than the ones this page edits.
    legacy: boolean;
    deletable: boolean;
}

export const GAME_RULES_FILE = 'data/minecraft/game_rules.dat';
export const WORLD_GEN_FILE = 'data/minecraft/world_gen_settings.dat';

const TEMP = '.dimension-upload';

/** The folder of the world, from level-name of server.properties. */
export const readWorldFolder = async (uuid: string): Promise<string> => {
    const properties = parseProperties((await readOptionalFile(uuid, '/server.properties')) || '');
    const name = properties.find((line) => line.key === 'level-name')?.value?.trim() || 'world';

    return isSafeSegment(name) ? name : 'world';
};

const safeList = (uuid: string, directory: string): Promise<FileObject[]> =>
    loadDirectory(uuid, directory).catch(() => [] as FileObject[]);

const folders = (files: FileObject[]) => files.filter((file) => !file.isFile);

export const listDimensions = async (uuid: string, world: string): Promise<Dimension[]> => {
    const inside = await safeList(uuid, `/${world}`);
    const container = folders(inside).find((f) => f.name === 'dimensions');

    if (container) {
        const found: Dimension[] = [];
        for (const space of folders(await safeList(uuid, `/${world}/dimensions`))) {
            if (!isSafeSegment(space.name)) continue;
            for (const dimension of folders(await safeList(uuid, `/${world}/dimensions/${space.name}`))) {
                if (!isSafeSegment(dimension.name)) continue;
                const info = dimensionInfo(space.name, dimension.name);
                found.push({
                    key: `${space.name}:${dimension.name}`,
                    namespace: space.name,
                    name: dimension.name,
                    path: `/${world}/dimensions/${space.name}/${dimension.name}`,
                    label: info.label,
                    kind: info.kind,
                    modified: dimension.modifiedAt,
                    legacy: false,
                    deletable: true,
                });
            }
        }
        const order: DimensionKind[] = ['overworld', 'nether', 'end', 'custom'];

        return found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.key.localeCompare(b.key));
    }

    const root = new Set(folders(await safeList(uuid, '/')).map((f) => f.name));
    const legacy: Dimension[] = [];
    const add = (name: string, kind: DimensionKind, label: string, path: string, deletable: boolean) =>
        legacy.push({
            key: `minecraft:${name}`,
            namespace: 'minecraft',
            name,
            path,
            label,
            kind,
            modified: null,
            legacy: true,
            deletable,
        });

    if (inside.some((f) => f.name === 'level.dat')) add('overworld', 'overworld', 'Overworld', `/${world}`, false);
    if (folders(inside).some((f) => f.name === 'DIM-1'))
        add('the_nether', 'nether', 'The Nether', `/${world}/DIM-1`, true);
    else if (root.has(`${world}_nether`)) add('the_nether', 'nether', 'The Nether', `/${world}_nether`, true);
    if (folders(inside).some((f) => f.name === 'DIM1')) add('the_end', 'end', 'The End', `/${world}/DIM1`, true);
    else if (root.has(`${world}_the_end`)) add('the_end', 'end', 'The End', `/${world}_the_end`, true);

    return legacy;
};

// ---- files -----------------------------------------------------------------------------------------------------------

/** Downloads a file as bytes, null when it does not exist. */
export const downloadBytes = async (uuid: string, path: string): Promise<Uint8Array | null> => {
    try {
        const response = await fetch(await getFileDownloadUrl(uuid, path));
        if (!response.ok) return null;

        return new Uint8Array(await response.arrayBuffer());
    } catch (e) {
        return null;
    }
};

/** Writes bytes to a file of a folder that exists, replacing the file when it is there. */
export const uploadBytes = async (uuid: string, directory: string, name: string, bytes: Uint8Array): Promise<void> => {
    const url = await getFileUploadUrl(uuid);
    await axios.post(
        url,
        { files: new File([bytes], name, { type: 'application/octet-stream' }) },
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { directory } }
    );
};

/** An NBT file of a dimension, null when the dimension has no such file, and an error when it is not an NBT file. */
export const readDimensionFile = async (uuid: string, dimension: Dimension, file: string): Promise<NbtFile | null> => {
    const bytes = await downloadBytes(uuid, `${dimension.path}/${file}`);

    return bytes ? readNbt(bytes) : null;
};

export const writeDimensionFile = async (
    uuid: string,
    dimension: Dimension,
    file: string,
    nbt: NbtFile
): Promise<void> => {
    const at = file.lastIndexOf('/');

    await uploadBytes(uuid, `${dimension.path}/${file.slice(0, at)}`, file.slice(at + 1), writeNbt(nbt));
};

// ---- delete and replace ----------------------------------------------------------------------------------------------

export const deleteDimension = async (uuid: string, dimension: Dimension): Promise<void> => {
    if (!dimension.deletable) throw new Error('This dimension is the world itself and can not be deleted here.');
    const at = dimension.path.lastIndexOf('/');

    await deleteFiles(uuid, dimension.path.slice(0, at) || '/', [dimension.path.slice(at + 1)]);
};

const MARKERS = ['region', 'data', 'entities', 'poi', 'DIM-1', 'DIM1'];

/** The folder of an extracted archive that holds the dimension: the folder itself, or the one folder inside it. */
const findContent = async (uuid: string, directory: string): Promise<string> => {
    const top = await loadDirectory(uuid, directory);
    if (top.some((f) => !f.isFile && MARKERS.includes(f.name))) return directory;

    const inner = folders(top);
    if (inner.length === 1) return findContent(uuid, `${directory}/${inner[0].name}`);

    throw new Error('Could not find a dimension (a folder with region or data in it) in that archive.');
};

/**
 * Puts the contents of an archive in place of a dimension: it is uploaded and extracted next to the world first, and only
 * when that worked is the old dimension deleted, so a bad archive costs nothing.
 */
export const replaceDimension = async (
    uuid: string,
    dimension: Dimension,
    file: File,
    report: (detail: string, progress?: { done: number; total: number }) => void
): Promise<void> => {
    if (!dimension.deletable) throw new Error('This dimension is the world itself and can not be replaced here.');

    await deleteFiles(uuid, '/', [TEMP], { permanent: true }).catch(() => undefined);
    await createDirectory(uuid, '/', TEMP);
    try {
        const url = await getFileUploadUrl(uuid);
        await axios.post(
            url,
            { files: file },
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                params: { directory: `/${TEMP}` },
                onUploadProgress: (e) => report('Uploading...', { done: e.loaded, total: e.total || file.size }),
            }
        );

        report('Extracting...');
        await decompressFiles(uuid, `/${TEMP}`, file.name, true);
        await deleteFiles(uuid, `/${TEMP}`, [file.name], { permanent: true });

        const content = await findContent(uuid, `/${TEMP}`);

        report(`Replacing ${dimension.label}...`);
        const at = dimension.path.lastIndexOf('/');
        await deleteFiles(uuid, dimension.path.slice(0, at) || '/', [dimension.path.slice(at + 1)]).catch(
            () => undefined
        );
        await renameFiles(uuid, '/', [{ from: content.replace(/^\//, ''), to: dimension.path.replace(/^\//, '') }]);
    } finally {
        await deleteFiles(uuid, '/', [TEMP], { permanent: true }).catch(() => undefined);
    }
};
