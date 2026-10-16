import { useEffect, useState } from 'react';
import { FileObject } from '@/api/server/files/loadDirectory';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { getProjects, lookupHashes, sha1Hex } from '@/lib/minecraft';
import { readPterodactylJson } from '@/lib/pterodactylJson';
import { fingerprint, isCurseForgeEnabled, lookupFingerprints } from '@/lib/curseforge';

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
 * Finds the icon of the jars in a mods or plugins folder, from Modrinth or from CurseForge. Projects installed through
 * the panel are known from pterodactyl.json, anything else is recognised by its hash (or its CurseForge fingerprint) and
 * remembered in the browser.
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
            const prints: Record<number, FileObject> = {};
            const askCurseForge = await isCurseForgeEnabled();
            const queue = [...unknown];
            await Promise.all(
                [0, 1].map(async () => {
                    while (queue.length && !cancelled) {
                        const jar = queue.shift()!;
                        try {
                            const url = await getFileDownloadUrl(uuid, `${path}/${jar.name}`);
                            const data = await (await fetch(url)).arrayBuffer();
                            hashes[await sha1Hex(data)] = jar;
                            if (askCurseForge) prints[fingerprint(data)] = jar;
                        } catch (e) {
                            // Unreadable files are tried again next time.
                        }
                    }
                })
            );
            if (cancelled || !Object.keys(hashes).length) return;

            // Each site is asked on its own, one being unreachable must not lose what the other knows. A file that was not
            // found is only remembered as unknown when both sites could be asked.
            let complete = true;
            try {
                const matches = await lookupHashes(Object.keys(hashes));
                const projects = await getProjects(
                    Array.from(new Set(Object.values(matches).map((m) => m.project_id)))
                );
                const info = new Map(projects.map((p) => [p.id, p]));

                Object.entries(hashes).forEach(([hash, jar]) => {
                    const project = matches[hash] && info.get(matches[hash].project_id);
                    if (project?.icon_url) found[jar.name] = { url: project.icon_url, title: project.title };
                });
            } catch (e) {
                complete = false;
            }

            const missing = Object.values(prints).filter((jar) => !found[jar.name]);
            if (askCurseForge && missing.length) {
                try {
                    const matches = await lookupFingerprints(
                        Object.entries(prints)
                            .filter(([, jar]) => !found[jar.name])
                            .map(([print]) => Number(print))
                    );
                    Object.entries(prints).forEach(([print, jar]) => {
                        const project = matches[Number(print)]?.project;
                        if (!found[jar.name] && project?.icon_url) {
                            found[jar.name] = { url: project.icon_url, title: project.title };
                        }
                    });
                } catch (e) {
                    complete = false;
                }
            }

            if (complete) {
                Object.values(hashes).forEach((jar) => {
                    cache[cacheKey(path, jar)] = found[jar.name] || null;
                });
                writeCache(uuid, cache);
            } else {
                // Only what was found is remembered, the rest is tried again next time.
                Object.values(hashes).forEach((jar) => {
                    if (found[jar.name]) cache[cacheKey(path, jar)] = found[jar.name];
                });
                writeCache(uuid, cache);
            }
            publish();
        })();

        return () => {
            cancelled = true;
        };
    }, [uuid, path, signature]);

    return icons;
};
