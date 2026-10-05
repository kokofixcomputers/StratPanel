import { useEffect, useState } from 'react';
import { FileObject } from '@/api/server/files/loadDirectory';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { getProjects, lookupHashes, sha1Hex } from '@/lib/minecraft';
import { readPterodactylJson } from '@/lib/pterodactylJson';

export interface JarIcon {
    url: string;
    title: string;
}

// Automatic recognition downloads the jar, so big ones are left alone.
const MAX_SIZE = 40 * 1024 * 1024;
const WATCHED = /^\/(mods|plugins)(\/|$)/;

const storageKey = (uuid: string) => `stratpanel:jar-icons:${uuid}`;

type Cache = Record<string, JarIcon | null>;

const readCache = (uuid: string): Cache => {
    try {
        return JSON.parse(localStorage.getItem(storageKey(uuid)) || '{}');
    } catch (e) {
        return {};
    }
};

const writeCache = (uuid: string, cache: Cache) => {
    try {
        localStorage.setItem(storageKey(uuid), JSON.stringify(cache));
    } catch (e) {
        // Storage can be full or blocked, the icons are only a nicety.
    }
};

const cacheKey = (directory: string, file: FileObject) =>
    `${directory}/${file.name}|${file.size}|${file.modifiedAt.getTime()}`;

/**
 * Finds the Modrinth icon of the jars in a mods or plugins folder. Projects installed through the panel are known
 * from pterodactyl.json, anything else is recognised by its hash and remembered in the browser.
 */
export default (uuid: string, directory: string, files: FileObject[] | undefined): Record<string, JarIcon> => {
    const [icons, setIcons] = useState<Record<string, JarIcon>>({});
    const path = directory.replace(/\/+$/, '') || '/';
    const signature = (files || []).map((f) => `${f.name}:${f.size}`).join(',');

    useEffect(() => {
        setIcons({});
        if (!files || !WATCHED.test(path)) return;

        const jars = files.filter((f) => f.isFile && f.name.toLowerCase().endsWith('.jar'));
        if (!jars.length) return;

        let cancelled = false;
        const found: Record<string, JarIcon> = {};
        const publish = () => !cancelled && setIcons({ ...found });

        (async () => {
            const cache = readCache(uuid);
            const tracked = await readPterodactylJson(uuid).catch(() => null);
            const records = Object.values(tracked?.mods || {});

            const unknown: FileObject[] = [];
            jars.forEach((jar) => {
                const record = records.find((r) => r.directory === path && r.file === jar.name && r.icon);
                const cached = cache[cacheKey(path, jar)];
                if (record) found[jar.name] = { url: record.icon!, title: record.title };
                else if (cached) found[jar.name] = cached;
                else if (cached === undefined && jar.size <= MAX_SIZE) unknown.push(jar);
            });
            publish();

            // Recognise the rest two at a time so a big folder does not flood the node.
            const hashes: Record<string, FileObject> = {};
            const queue = [...unknown];
            await Promise.all(
                [0, 1].map(async () => {
                    while (queue.length && !cancelled) {
                        const jar = queue.shift()!;
                        try {
                            const url = await getFileDownloadUrl(uuid, `${path}/${jar.name}`);
                            hashes[await sha1Hex(await (await fetch(url)).arrayBuffer())] = jar;
                        } catch (e) {
                            // Unreadable files are tried again next time.
                        }
                    }
                })
            );
            if (cancelled || !Object.keys(hashes).length) return;

            try {
                const matches = await lookupHashes(Object.keys(hashes));
                const projects = await getProjects(
                    Array.from(new Set(Object.values(matches).map((m) => m.project_id)))
                );
                const info = new Map(projects.map((p) => [p.id, p]));

                Object.entries(hashes).forEach(([hash, jar]) => {
                    const project = matches[hash] && info.get(matches[hash].project_id);
                    const icon = project?.icon_url ? { url: project.icon_url, title: project.title } : null;
                    cache[cacheKey(path, jar)] = icon;
                    if (icon) found[jar.name] = icon;
                });
                writeCache(uuid, cache);
                publish();
            } catch (e) {
                // Modrinth being unreachable just means no icons this time.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [uuid, path, signature]);

    return icons;
};
