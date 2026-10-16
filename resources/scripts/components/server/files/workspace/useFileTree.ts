import { useCallback, useEffect, useRef, useState } from 'react';
import loadDirectory from '@/api/server/files/loadDirectory';
import { httpErrorToHuman } from '@/api/http';
import { dropPrefix, isInside, joinPath, normalizePath, TreeNode } from '@/lib/workspace';

interface TreeState {
    children: Record<string, TreeNode[] | undefined>;
    expanded: Set<string>;
    loading: Set<string>;
    // Folders that could not be read, with the reason.
    failed: Record<string, string>;
}

const toNodes = (directory: string, files: Awaited<ReturnType<typeof loadDirectory>>): TreeNode[] =>
    files.map((file) => ({
        path: joinPath(directory, file.name),
        name: file.name,
        isDirectory: !file.isFile,
        size: file.size,
    }));

/**
 * What the file tree knows: the contents of the folders that were opened (read when they are opened, and again when asked), and which
 * folders are open. Folders are read one by one, a folder that is not open is never read.
 */
export default (uuid: string, initiallyExpanded: string[] = []) => {
    const [state, setState] = useState<TreeState>(() => ({
        children: {},
        expanded: new Set(initiallyExpanded.map(normalizePath)),
        loading: new Set(),
        failed: {},
    }));
    // The latest state for functions that run later (after a request), they must not see the state of the render they were made in.
    const latest = useRef(state);
    latest.current = state;
    const alive = useRef(true);

    useEffect(
        () => () => {
            alive.current = false;
        },
        []
    );

    const update = useCallback((change: (current: TreeState) => TreeState) => {
        if (!alive.current) return;
        const next = change(latest.current);
        latest.current = next;
        setState(next);
    }, []);

    const load = useCallback(
        async (path: string): Promise<void> => {
            const directory = normalizePath(path);
            update((s) => ({ ...s, loading: new Set(s.loading).add(directory) }));

            try {
                const nodes = toNodes(directory, await loadDirectory(uuid, directory));
                update((s) => {
                    const { [directory]: _gone, ...failed } = s.failed;
                    const loading = new Set(s.loading);
                    loading.delete(directory);

                    return { ...s, children: { ...s.children, [directory]: nodes }, loading, failed };
                });
            } catch (error) {
                update((s) => {
                    const loading = new Set(s.loading);
                    loading.delete(directory);

                    return { ...s, loading, failed: { ...s.failed, [directory]: httpErrorToHuman(error) } };
                });
            }
        },
        [uuid, update]
    );

    // The root, and every folder that was open last time.
    useEffect(() => {
        const open = [...latest.current.expanded].filter((path) => !latest.current.children[path]);
        load('/');
        // A folder that is gone by now just does not open, it says so.
        open.forEach((path) => load(path));
    }, [uuid]);

    const toggle = useCallback(
        (path: string) => {
            const directory = normalizePath(path);
            const open = latest.current.expanded.has(directory);

            update((s) => {
                const expanded = new Set(s.expanded);
                if (open) expanded.delete(directory);
                else expanded.add(directory);

                return { ...s, expanded };
            });
            if (!open && !latest.current.children[directory]) load(directory);
        },
        [load, update]
    );

    /** Opens a folder, and the folders above it. */
    const reveal = useCallback(
        (path: string) => {
            const parts = normalizePath(path).split('/').filter(Boolean);
            const folders = parts.slice(0, -1).map((_, i) => '/' + parts.slice(0, i + 1).join('/'));

            update((s) => ({ ...s, expanded: new Set([...s.expanded, ...folders]) }));
            folders.filter((folder) => !latest.current.children[folder]).forEach((folder) => load(folder));
        },
        [load, update]
    );

    const expand = useCallback(
        (path: string) => {
            const directory = normalizePath(path);
            update((s) => ({ ...s, expanded: new Set(s.expanded).add(directory) }));
            if (!latest.current.children[directory]) load(directory);
        },
        [load, update]
    );

    /** Reads a folder again (after something was made, renamed or deleted in it). */
    const refresh = useCallback((path: string) => load(path), [load]);

    const refreshAll = useCallback(async () => {
        await Promise.all(['/', ...latest.current.expanded].map((path) => load(path)));
    }, [load]);

    const collapseAll = useCallback(() => update((s) => ({ ...s, expanded: new Set() })), [update]);

    /** Forgets a folder and what is inside it (it was renamed or deleted). */
    const forget = useCallback(
        (path: string) =>
            update((s) => ({
                ...s,
                children: dropPrefix(s.children, path),
                failed: dropPrefix(s.failed, path),
                expanded: new Set([...s.expanded].filter((open) => !isInside(open, path))),
            })),
        [update]
    );

    return { ...state, toggle, expand, reveal, refresh, refreshAll, collapseAll, forget, load };
};
