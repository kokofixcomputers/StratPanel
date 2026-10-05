import { useCallback, useEffect, useRef, useState } from 'react';
import pullFile from '@/api/server/files/pullFile';
import deleteFiles from '@/api/server/files/deleteFiles';
import createDirectory from '@/api/server/files/createDirectory';
import loadDirectory from '@/api/server/files/loadDirectory';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { ManagedProject, readPterodactylJson, updatePterodactylJson } from '@/lib/pterodactylJson';
import {
    findDownload,
    getProjects,
    getProjectVersions,
    lookupHashes,
    ModrinthProject,
    ProjectKind,
    sha1Hex,
} from '@/lib/minecraft';

export interface UpdateInfo {
    versionId: string;
    versionNumber: string;
}

export interface UntrackedFile {
    directory: string;
    file: string;
    size: number;
}

const DIRECTORIES = { mod: '/mods', plugin: '/plugins' } as const;
const MAX_HASH_SIZE = 150 * 1024 * 1024;

const runPool = async <T>(items: T[], size: number, work: (item: T, index: number) => Promise<void>) => {
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(size, items.length) }, async () => {
            while (next < items.length) {
                const index = next++;
                await work(items[index], index);
            }
        })
    );
};

/**
 * Keeps track of the mods and plugins that are installed on a server. What the panel installed is stored in
 * pterodactyl.json, files that were put there some other way can be recognised by their hash.
 */
export default (uuid: string, minecraftVersion: string) => {
    const [mods, setMods] = useState<Record<string, ManagedProject>>({});
    const [updates, setUpdates] = useState<Record<string, UpdateInfo>>({});
    const [untracked, setUntracked] = useState<UntrackedFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
    const version = useRef(minecraftVersion);
    version.current = minecraftVersion;

    const checkUpdates = useCallback(async (records: Record<string, ManagedProject>) => {
        const found: Record<string, UpdateInfo> = {};

        await runPool(Object.values(records), 4, async (record) => {
            try {
                const gameVersion = version.current || record.gameVersion;
                const versions = await getProjectVersions(record.projectId, {
                    loaders: record.loaders.length ? record.loaders : undefined,
                    gameVersions: gameVersion ? [gameVersion] : undefined,
                });
                const latest = versions.find((v) => v.files.length > 0);
                if (latest && latest.id !== record.versionId) {
                    found[record.projectId] = { versionId: latest.id, versionNumber: latest.version_number };
                }
            } catch (e) {
                // A failed lookup just means no update is shown for this project.
            }
        });

        setUpdates(found);
    }, []);

    const refresh = useCallback(async () => {
        const json = await readPterodactylJson(uuid);
        const records = json.mods || {};

        const lists = await Promise.all(
            Object.values(DIRECTORIES).map((directory) => loadDirectory(uuid, directory).catch(() => []))
        );
        const present = new Map<string, Map<string, number>>(
            Object.values(DIRECTORIES).map((directory, i) => [
                directory as string,
                new Map(lists[i].filter((f) => f.isFile).map((f) => [f.name, f.size])),
            ])
        );

        const valid: Record<string, ManagedProject> = {};
        Object.values(records).forEach((record) => {
            if (present.get(record.directory)?.has(record.file)) valid[record.projectId] = record;
        });

        // Forget records of files that were deleted by hand.
        if (Object.keys(valid).length !== Object.keys(records).length) {
            await updatePterodactylJson(uuid, (current) => ({ ...current, mods: valid })).catch(() => undefined);
        }

        const known = new Set(Object.values(valid).map((r) => `${r.directory}/${r.file}`));
        const loose: UntrackedFile[] = [];
        present.forEach((files, directory) =>
            files.forEach((size, file) => {
                if (file.toLowerCase().endsWith('.jar') && !known.has(`${directory}/${file}`)) {
                    loose.push({ directory, file, size });
                }
            })
        );

        setMods(valid);
        setUntracked(loose);
        setLoading(false);
        checkUpdates(valid);
    }, [uuid, checkUpdates]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const save = (record: ManagedProject) =>
        updatePterodactylJson(uuid, (current) => ({
            ...current,
            mods: { ...(current.mods || {}), [record.projectId]: record },
        }));

    const install = async (
        project: ModrinthProject,
        kind: Exclude<ProjectKind, 'modpack'>,
        filters: { loader?: string; version?: string }
    ) => {
        const directory = DIRECTORIES[kind];
        const { file, versionNumber, versionId, loaders } = await findDownload({
            projectId: project.project_id,
            kind,
            loader: filters.loader,
            version: filters.version,
        });

        // The folder will not exist on a fresh server, creating it when it does is harmless.
        await createDirectory(uuid, '/', directory.slice(1)).catch(() => undefined);
        await pullFile(uuid, file.url, directory, file.filename);

        const record: ManagedProject = {
            kind,
            projectId: project.project_id,
            slug: project.slug,
            title: project.title,
            icon: project.icon_url,
            versionId,
            versionNumber,
            file: file.filename,
            directory,
            loaders,
            gameVersion: filters.version || null,
            installedAt: new Date().toISOString(),
        };
        await save(record);
        setMods((current) => ({ ...current, [record.projectId]: record }));
        setUntracked((current) => current.filter((f) => !(f.directory === directory && f.file === file.filename)));

        return record;
    };

    const uninstall = async (projectId: string) => {
        const record = mods[projectId];
        if (!record) return;

        await deleteFiles(uuid, record.directory, [record.file]);
        await updatePterodactylJson(uuid, (current) => {
            const next = { ...(current.mods || {}) };
            delete next[projectId];

            return { ...current, mods: next };
        });
        setMods((current) => {
            const next = { ...current };
            delete next[projectId];

            return next;
        });
        setUpdates((current) => {
            const next = { ...current };
            delete next[projectId];

            return next;
        });
    };

    const update = async (projectId: string) => {
        const record = mods[projectId];
        if (!record) return;

        const gameVersion = version.current || record.gameVersion;
        const versions = await getProjectVersions(projectId, {
            loaders: record.loaders.length ? record.loaders : undefined,
            gameVersions: gameVersion ? [gameVersion] : undefined,
        });
        const latest = versions.find((v) => v.files.length > 0);
        if (!latest) throw new Error('No compatible update was found.');

        const file = latest.files.find((f) => f.primary) || latest.files[0];
        await pullFile(uuid, file.url, record.directory, file.filename);
        if (file.filename !== record.file) {
            await deleteFiles(uuid, record.directory, [record.file]).catch(() => undefined);
        }

        const next: ManagedProject = {
            ...record,
            versionId: latest.id,
            versionNumber: latest.version_number,
            file: file.filename,
            loaders: latest.loaders,
            installedAt: new Date().toISOString(),
        };
        await save(next);
        setMods((current) => ({ ...current, [projectId]: next }));
        setUpdates((current) => {
            const rest = { ...current };
            delete rest[projectId];

            return rest;
        });
    };

    /** Downloads the jars that are not tracked yet, hashes them and asks Modrinth which projects they belong to. */
    const detectExisting = async (): Promise<number> => {
        const candidates = untracked.filter((f) => f.size <= MAX_HASH_SIZE);
        const hashes: Record<string, UntrackedFile> = {};
        setScan({ done: 0, total: candidates.length });

        let done = 0;
        await runPool(candidates, 3, async (item) => {
            try {
                const url = await getFileDownloadUrl(uuid, `${item.directory}/${item.file}`);
                const data = await (await fetch(url)).arrayBuffer();
                hashes[await sha1Hex(data)] = item;
            } catch (e) {
                // Files that cannot be read are skipped.
            }
            setScan({ done: ++done, total: candidates.length });
        });

        const matches = await lookupHashes(Object.keys(hashes));
        const projects = await getProjects(Array.from(new Set(Object.values(matches).map((v) => v.project_id))));
        const info = new Map(projects.map((p) => [p.id, p]));

        const added: ManagedProject[] = [];
        Object.keys(matches).forEach((hash) => {
            const match = matches[hash];
            const item = hashes[hash];
            const project = info.get(match.project_id);
            if (!item || !project) return;

            added.push({
                kind: item.directory === DIRECTORIES.plugin ? 'plugin' : 'mod',
                projectId: project.id,
                slug: project.slug,
                title: project.title,
                icon: project.icon_url,
                versionId: match.id,
                versionNumber: match.version_number,
                file: item.file,
                directory: item.directory,
                loaders: match.loaders,
                gameVersion: match.game_versions[0] || null,
                installedAt: new Date().toISOString(),
            });
        });

        if (added.length) {
            await updatePterodactylJson(uuid, (current) => ({
                ...current,
                mods: { ...(current.mods || {}), ...Object.fromEntries(added.map((r) => [r.projectId, r])) },
            }));
        }
        setScan(null);
        await refresh();

        return added.length;
    };

    return { mods, updates, untracked, loading, scan, refresh, install, uninstall, update, detectExisting };
};
