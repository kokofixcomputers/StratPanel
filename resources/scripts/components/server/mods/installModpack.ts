import { unzipSync } from 'fflate';
import pullFile from '@/api/server/files/pullFile';
import deleteFiles from '@/api/server/files/deleteFiles';
import createDirectory from '@/api/server/files/createDirectory';
import loadDirectory from '@/api/server/files/loadDirectory';
import renameFiles from '@/api/server/files/renameFiles';
import decompressFiles from '@/api/server/files/decompressFiles';
import { Websocket } from '@/plugins/Websocket';
import { getBuilds, getVersions, SOFTWARE, SoftwareType } from '@/lib/mcjars';
import { updatePterodactylJson } from '@/lib/pterodactylJson';
import installVersion from '@/components/server/versions/installVersion';

export interface ModpackSpec {
    projectId: string;
    title: string;
    icon: string | null;
    versionId: string;
    versionNumber: string;
    mrpackUrl: string;
}

interface MrpackFile {
    path: string;
    env?: { client?: string; server?: string };
    downloads?: string[];
}

interface MrpackIndex {
    name?: string;
    dependencies: Record<string, string>;
    files: MrpackFile[];
}

type Report = (detail: string, progress?: { done: number; total: number }) => void;

// Which entry of the pack's dependencies decides the server software.
const LOADERS: [string, SoftwareType][] = [
    ['fabric-loader', 'FABRIC'],
    ['quilt-loader', 'QUILT'],
    ['neoforge', 'NEOFORGE'],
    ['forge', 'FORGE'],
];

/** Downloads a .mrpack (a zip) and reads its index, the rest of the archive is not unpacked here. */
export const readModpackIndex = async (url: string): Promise<MrpackIndex> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('The modpack could not be downloaded from Modrinth.');

    const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
        filter: (file) => file.name === 'modrinth.index.json',
    });
    const raw = files['modrinth.index.json'];
    if (!raw) throw new Error('This file is not a valid Modrinth modpack.');

    return JSON.parse(new TextDecoder().decode(raw));
};

export const loaderOf = (index: MrpackIndex): { type: SoftwareType; version: string; minecraft: string } => {
    const minecraft = index.dependencies.minecraft;
    const found = LOADERS.find(([key]) => index.dependencies[key]);
    if (!minecraft || !found) throw new Error('This modpack needs a mod loader that is not supported.');

    return { type: found[1], version: index.dependencies[found[0]], minecraft };
};

const runPool = async <T>(items: T[], size: number, work: (item: T) => Promise<void>) => {
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(size, items.length) }, async () => {
            while (next < items.length) await work(items[next++]);
        })
    );
};

const rel = (path: string) => path.replace(/^\/+|\/+$/g, '');

/** Creates every folder of a path one level at a time, folders that exist already are fine. */
const ensureDirectory = async (uuid: string, path: string) => {
    let parent = '/';
    for (const segment of rel(path).split('/').filter(Boolean)) {
        await createDirectory(uuid, parent, segment).catch(() => undefined);
        parent = `${parent === '/' ? '' : parent}/${segment}`;
    }
};

/** Moves everything from one folder into another, merging folders that exist on both sides. */
const mergeInto = async (uuid: string, source: string, destination: string, depth = 0) => {
    // Modpack folders are shallow, the limit only protects against a listing that keeps pointing at itself.
    if (depth > 8) return;

    const entries = await loadDirectory(uuid, source).catch(() => []);
    if (!entries.length) return;

    const existing = new Map((await loadDirectory(uuid, destination).catch(() => [])).map((f) => [f.name, f]));
    for (const entry of entries) {
        const target = existing.get(entry.name);
        const from = `${rel(source)}/${entry.name}`;
        const to = [rel(destination), entry.name].filter(Boolean).join('/');

        if (target && !entry.isFile && !target.isFile) {
            await mergeInto(uuid, `/${from}`, `/${rel(destination)}/${entry.name}`, depth + 1);
            continue;
        }
        if (target) await deleteFiles(uuid, `/${rel(destination)}`, [entry.name]);

        await renameFiles(uuid, '/', [{ from, to }]);
    }
};

/**
 * Installs a Modrinth modpack on a server: the matching Fabric / Quilt / Forge / NeoForge server, the configs and
 * files that come with the pack and every mod that is meant for servers.
 */
export default async (ctx: {
    uuid: string;
    status: string | null;
    instance: Websocket | null;
    spec: ModpackSpec;
    report: Report;
}): Promise<void> => {
    const { uuid, spec, report } = ctx;

    report('Reading the modpack...');
    const index = await readModpackIndex(spec.mrpackUrl);
    const loader = loaderOf(index);
    const software = SOFTWARE.find((s) => s.type === loader.type)!;

    // 1. the server software the pack needs
    const version = (await getVersions(loader.type)).find((v) => v.id === loader.minecraft);
    if (!version) throw new Error(`${software.name} is not available for Minecraft ${loader.minecraft}.`);

    const builds = await getBuilds(loader.type, loader.minecraft);
    const build =
        builds.find((b) => b.projectVersionId === loader.version || b.name === loader.version) ||
        builds.find((b) => !b.experimental) ||
        builds[0];
    if (!build) throw new Error(`No ${software.name} build was found for Minecraft ${loader.minecraft}.`);

    await installVersion({
        uuid,
        status: ctx.status,
        instance: ctx.instance,
        software,
        version,
        build,
        onProgress: (steps) => {
            const current =
                steps.find((step) => step.state === 'running') || steps.find((step) => step.state === 'pending');
            report(`${software.name} ${loader.minecraft}: ${current?.label || 'done'}`);
        },
    });

    // 2. configs and other files that are part of the pack
    report('Downloading the modpack files...');
    await ensureDirectory(uuid, '.modpack');
    await pullFile(uuid, spec.mrpackUrl, '/.modpack', 'pack.mrpack');
    report('Unpacking configs...');
    await decompressFiles(uuid, '/.modpack', 'pack.mrpack');
    for (const folder of ['overrides', 'server-overrides']) {
        await mergeInto(uuid, `/.modpack/${folder}`, '/');
    }
    await deleteFiles(uuid, '/', ['.modpack']).catch(() => undefined);

    // 3. every mod that is meant to run on a server
    const files = index.files.filter((file) => file.env?.server !== 'unsupported' && file.downloads?.length);
    const directories = Array.from(
        new Set(files.map((file) => file.path.split('/').slice(0, -1).join('/')).filter(Boolean))
    );
    for (const directory of directories) await ensureDirectory(uuid, directory);

    const failed: string[] = [];
    let done = 0;
    report(`Downloading mods 0/${files.length}`, { done: 0, total: files.length });

    await runPool(files, 4, async (file) => {
        const parts = file.path.split('/');
        const name = parts[parts.length - 1];
        const directory = `/${parts.slice(0, -1).join('/')}`;

        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
            try {
                await pullFile(uuid, file.downloads![0], directory, name);
                ok = true;
            } catch (e) {
                // Try again, the CDN or the node can fail now and then.
            }
        }
        if (!ok) failed.push(name);

        report(`Downloading mods ${++done}/${files.length}`, { done, total: files.length });
    });

    if (failed.length) {
        throw new Error(
            `${failed.length} files could not be downloaded: ${failed.slice(0, 3).join(', ')}${
                failed.length > 3 ? '...' : ''
            }`
        );
    }

    // 4. remember what was installed
    await updatePterodactylJson(uuid, (current) => ({
        ...current,
        modpack: {
            projectId: spec.projectId,
            title: spec.title,
            icon: spec.icon,
            versionId: spec.versionId,
            versionNumber: spec.versionNumber,
            installedAt: new Date().toISOString(),
        },
    }));
};
