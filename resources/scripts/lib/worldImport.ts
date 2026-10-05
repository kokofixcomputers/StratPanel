/** Installing a world from a link: download the archive, unpack it, find the world inside and give it a folder. */
import loadDirectory from '@/api/server/files/loadDirectory';
import pullFile from '@/api/server/files/pullFile';
import createDirectory from '@/api/server/files/createDirectory';
import decompressFiles from '@/api/server/files/decompressFiles';
import deleteFiles from '@/api/server/files/deleteFiles';
import renameFiles from '@/api/server/files/renameFiles';
import saveFileContents from '@/api/server/files/saveFileContents';
import { readOptionalFile, serializeProperties } from '@/lib/minecraft';

const TEMP = '.world-import';
const ARCHIVE = /\.(zip|tar\.gz|tgz)$/i;

export const WORLDS_CHANGED = 'pterodactyl:worlds-changed';

/** The file name at the end of a link, which tells what kind of archive it is. */
export const fileNameOf = (link: string): string => {
    try {
        const path = new URL(link).pathname;

        return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
    } catch (e) {
        return '';
    }
};

/** A folder name that is safe on any system, made from the name of the archive. */
export const folderNameFor = (fileName: string): string =>
    fileName
        .replace(ARCHIVE, '')
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);

export const isValidFolderName = (name: string): boolean => /^[A-Za-z0-9_-]{1,48}$/.test(name);

/** Looks for level.dat in a folder or in the single folder inside it, and returns the path of the world. */
export const findWorldRoot = async (uuid: string, directory: string): Promise<string> => {
    const top = await loadDirectory(uuid, directory);
    if (top.some((f) => f.name === 'level.dat')) return directory;

    const nested = (
        await Promise.all(
            top
                .filter((f) => !f.isFile)
                .map(async (f) =>
                    (await loadDirectory(uuid, `${directory}/${f.name}`)).some((i) => i.name === 'level.dat')
                        ? f.name
                        : null
                )
        )
    ).filter((n): n is string => !!n);
    if (nested.length !== 1)
        throw new Error('Could not find a single world (a folder with level.dat) in that archive.');

    return `${directory}/${nested[0]}`;
};

export const installWorldFromLink = async (opts: {
    uuid: string;
    link: string;
    name: string;
    makeActive: boolean;
    report: (detail: string) => void;
}): Promise<void> => {
    const { uuid, link, name, makeActive, report } = opts;
    const fileName = fileNameOf(link);
    if (!/^https?:\/\//i.test(link) || !ARCHIVE.test(fileName)) {
        throw new Error('The link has to point straight at a .zip or .tar.gz file.');
    }
    if (!isValidFolderName(name)) throw new Error('The world name can only use letters, numbers, - and _.');

    const root = new Set((await loadDirectory(uuid, '/')).map((f) => f.name));
    if (root.has(name)) throw new Error(`There already is a folder called ${name}, pick another name.`);

    await deleteFiles(uuid, '/', [TEMP]).catch(() => undefined);
    await createDirectory(uuid, '/', TEMP);

    try {
        report('Downloading...');
        await pullFile(uuid, link, `/${TEMP}`, fileName);

        report('Extracting...');
        await decompressFiles(uuid, `/${TEMP}`, fileName, true);
        await deleteFiles(uuid, `/${TEMP}`, [fileName]);

        const source = (await findWorldRoot(uuid, `/${TEMP}`)).slice(1);
        report('Adding the world...');
        await renameFiles(uuid, '/', [{ from: source, to: name }]);

        if (makeActive) {
            const properties = (await readOptionalFile(uuid, '/server.properties')) || '';
            await saveFileContents(uuid, '/server.properties', serializeProperties(properties, { 'level-name': name }));
        }
    } finally {
        await deleteFiles(uuid, '/', [TEMP]).catch(() => undefined);
    }

    window.dispatchEvent(new CustomEvent(WORLDS_CHANGED));
};
