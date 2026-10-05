import { useEffect, useRef, useState } from 'react';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import { SocketEvent } from '@/components/server/events';
import { parseBridgeLine } from '@/lib/bridge';
import loadDirectory from '@/api/server/files/loadDirectory';
import getFileContents from '@/api/server/files/getFileContents';
import { Node } from '@/lib/commandComplete';
import { buildCommandTree, COMMANDS_FILE, CommandsDocument, parseCommandsDocument } from '@/lib/commandTree';

export interface LoadedCommands {
    tree: Node;
    count: number;
    generatedAt: string;
    platform?: string;
    // A plugin or mod changed after the list was written, so it may be missing commands.
    stale: boolean;
}

const MAX_CACHED = 1.5 * 1024 * 1024;
const cacheKey = (uuid: string) => `stratpanel:commands:${uuid}`;

interface Cached {
    size: number;
    modified: number;
    doc: CommandsDocument;
}

const readCache = (uuid: string): Cached | null => {
    try {
        return JSON.parse(localStorage.getItem(cacheKey(uuid)) || 'null');
    } catch (e) {
        return null;
    }
};

const writeCache = (uuid: string, cached: Cached) => {
    try {
        if (cached.size <= MAX_CACHED) localStorage.setItem(cacheKey(uuid), JSON.stringify(cached));
    } catch (e) {
        // Storage that is full or blocked only means the file is downloaded again next time.
    }
};

/** The newest change among the jars of plugins and mods, in milliseconds. */
const newestJar = async (uuid: string): Promise<number> => {
    const lists = await Promise.all(['/plugins', '/mods'].map((dir) => loadDirectory(uuid, dir).catch(() => [])));

    return Math.max(
        0,
        ...lists
            .flat()
            .filter((f) => f.isFile && f.name.toLowerCase().endsWith('.jar'))
            .map((f) => f.modifiedAt.getTime())
    );
};

/**
 * The command tree a plugin or mod saved on the server. It is read from the file, so it keeps working while the
 * plugin is not running, and is only downloaded again when the file changed. Null when there is none.
 */
export default (uuid: string): LoadedCommands | null => {
    const [loaded, setLoaded] = useState<LoadedCommands | null>(null);
    // Bumped when the plugin says the list changed, which makes the effect below read the file again.
    const [refresh, setRefresh] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const current = useRef<string | null>(null);
    current.current = loaded?.generatedAt || null;

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (line: string) => {
        const message = parseBridgeLine(line);
        if (message?.event !== 'commands-updated' && message?.event !== 'refreshed') return;

        // The console replays old lines when it connects, and a plugin may announce several changes in a row.
        if (typeof message.generatedAt === 'string' && message.generatedAt === current.current) return;
        timer.current && clearTimeout(timer.current);
        timer.current = setTimeout(() => setRefresh((value) => value + 1), 1500);
    });

    useEffect(() => () => timer.current && clearTimeout(timer.current), []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const file = (await loadDirectory(uuid, '/')).find((f) => f.isFile && f.name === COMMANDS_FILE);
                if (!file) return;

                const modified = file.modifiedAt.getTime();
                let cached = readCache(uuid);
                if (!cached || cached.size !== file.size || cached.modified !== modified) {
                    const doc = parseCommandsDocument(await getFileContents(uuid, `/${COMMANDS_FILE}`));
                    if (!doc) return;

                    cached = { size: file.size, modified, doc };
                    writeCache(uuid, cached);
                }

                const { tree, count } = buildCommandTree(cached.doc);
                const generated = Date.parse(cached.doc.generatedAt) || modified;
                // A minute of slack, plugins that were installed right before the server started are not newer.
                const stale = (await newestJar(uuid)) > generated + 60000;
                if (!cancelled) {
                    setLoaded({
                        tree,
                        count,
                        generatedAt: cached.doc.generatedAt,
                        platform: cached.doc.generator?.platform,
                        stale,
                    });
                }
            } catch (e) {
                // No usable file, tab completion falls back to the built in commands.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [uuid, refresh]);

    return loaded;
};
