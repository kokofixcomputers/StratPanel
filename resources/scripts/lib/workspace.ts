/**
 * The logic of the code editor view of the file manager (a file tree on the left, tabs above an editor), apart from React and Monaco so
 * it can be tested: paths, the order of the tree, which tab comes next when one is closed, what a rename or delete does to tabs.
 */

export interface TreeNode {
    path: string;
    name: string;
    isDirectory: boolean;
    size: number;
}

export interface TreeRow {
    node: TreeNode;
    depth: number;
    expanded: boolean;
    loading: boolean;
}

export interface Tab {
    path: string;
    name: string;
}

// ---- paths ------------------------------------------------------------------------------------------------------------------

/** "/a/b" for any way of writing it: one leading slash, none at the end, no doubles, no "." or ".." parts. "/" is the root. */
export const normalizePath = (path: string): string => {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === '..') parts.pop();
        else parts.push(part);
    }

    return '/' + parts.join('/');
};

export const joinPath = (directory: string, name: string): string => normalizePath(`${directory}/${name}`);

export const parentPath = (path: string): string => {
    const normalized = normalizePath(path);
    const at = normalized.lastIndexOf('/');

    return at <= 0 ? '/' : normalized.slice(0, at);
};

export const baseName = (path: string): string => normalizePath(path).split('/').pop() || '/';

/** Whether `path` is `ancestor` or something inside it. */
export const isInside = (path: string, ancestor: string): boolean => {
    const a = normalizePath(ancestor);
    const p = normalizePath(path);

    return a === '/' || p === a || p.startsWith(a + '/');
};

/** A name that can be given to a file or folder, or the reason it can not. */
export const checkName = (name: string, taken: string[] = []): string | null => {
    const trimmed = name.trim();
    if (trimmed === '') return 'Enter a name.';
    if (trimmed === '.' || trimmed === '..') return 'That is not a name.';
    if (/[/\\\0]/.test(trimmed)) return 'A name can not contain slashes.';
    if (taken.includes(trimmed)) return 'Something with that name is there already.';

    return null;
};

// ---- the tree ---------------------------------------------------------------------------------------------------------------

/** Folders first, then files, each in alphabetical order the way people expect (case and numbers: "file2" before "file10"). */
export const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes].sort(
        (a, b) =>
            Number(b.isDirectory) - Number(a.isDirectory) ||
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
            a.name.localeCompare(b.name)
    );

/**
 * The rows the tree shows, top to bottom: the contents of every folder that is open, indented below it.
 *
 * @param children what is known of each folder (path -> contents), a folder that is not in there is still being loaded
 */
export const visibleRows = (
    children: Record<string, TreeNode[] | undefined>,
    expanded: ReadonlySet<string>,
    loading: ReadonlySet<string>,
    root = '/'
): TreeRow[] => {
    const rows: TreeRow[] = [];

    const walk = (directory: string, depth: number) => {
        for (const node of sortNodes(children[directory] ?? [])) {
            const open = node.isDirectory && expanded.has(node.path);
            rows.push({ node, depth, expanded: open, loading: open && loading.has(node.path) });
            if (open) walk(node.path, depth + 1);
        }
    };
    walk(normalizePath(root), 0);

    return rows;
};

/** The folders that are open, without those inside a folder that is not (they are remembered but not shown). */
export const dropPrefix = <T>(map: Record<string, T>, prefix: string): Record<string, T> =>
    Object.fromEntries(Object.entries(map).filter(([path]) => !isInside(path, prefix)));

// ---- tabs -------------------------------------------------------------------------------------------------------------------

/** Opens a file: a new tab at the end, or the tab it already has. */
export const openTab = (tabs: Tab[], path: string): Tab[] => {
    const normalized = normalizePath(path);

    return tabs.some((tab) => tab.path === normalized)
        ? tabs
        : [...tabs, { path: normalized, name: baseName(normalized) }];
};

/**
 * Closes a tab. When it was the active one the tab that takes its place is the one on its right, or the one on its left when it was the
 * last, or nothing.
 */
export const closeTab = (tabs: Tab[], active: string | null, path: string): { tabs: Tab[]; active: string | null } => {
    const index = tabs.findIndex((tab) => tab.path === path);
    if (index < 0) return { tabs, active };

    const remaining = tabs.filter((tab) => tab.path !== path);
    if (active !== path) return { tabs: remaining, active };

    return { tabs: remaining, active: remaining[index]?.path ?? remaining[index - 1]?.path ?? null };
};

/** Moves a tab to where another tab is (dragging a tab). */
export const moveTab = (tabs: Tab[], from: string, to: string): Tab[] => {
    const fromIndex = tabs.findIndex((tab) => tab.path === from);
    const toIndex = tabs.findIndex((tab) => tab.path === to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return tabs;

    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    return next;
};

/** The path of something after a file or folder was renamed: what was inside the folder moves with it. */
export const renamedPath = (path: string, from: string, to: string): string => {
    const p = normalizePath(path);
    const f = normalizePath(from);
    if (p === f) return normalizePath(to);

    return p.startsWith(f + '/') ? normalizePath(to) + p.slice(f.length) : p;
};

/** The tabs that are the deleted file, or inside the deleted folder. */
export const tabsUnder = (tabs: Tab[], path: string): Tab[] => tabs.filter((tab) => isInside(tab.path, path));

// ---- remembering what was open ----------------------------------------------------------------------------------------------

export interface SavedWorkspace {
    tabs: string[];
    active: string | null;
    expanded: string[];
    sidebarWidth: number;
}

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 520;
export const SIDEBAR_DEFAULT = 260;

export const clampSidebar = (width: number): number =>
    Number.isFinite(width) ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width))) : SIDEBAR_DEFAULT;

const key = (server: string) => `panel:workspace:${server}`;

/** What was open last time on this server, whatever is stored is checked: it may be from an older version or damaged. */
export const loadWorkspace = (server: string, storage: Pick<Storage, 'getItem'> = localStorage): SavedWorkspace => {
    const empty: SavedWorkspace = { tabs: [], active: null, expanded: [], sidebarWidth: SIDEBAR_DEFAULT };

    try {
        const data = JSON.parse(storage.getItem(key(server)) || 'null');
        if (!data || typeof data !== 'object') return empty;

        const strings = (value: unknown): string[] =>
            Array.isArray(value)
                ? value.filter((v): v is string => typeof v === 'string' && v.startsWith('/')).slice(0, 50)
                : [];
        const tabs = strings(data.tabs).map(normalizePath);

        return {
            tabs,
            active:
                typeof data.active === 'string' && tabs.includes(normalizePath(data.active))
                    ? normalizePath(data.active)
                    : null,
            expanded: strings(data.expanded).map(normalizePath),
            sidebarWidth: clampSidebar(Number(data.sidebarWidth)),
        };
    } catch {
        return empty;
    }
};

export const saveWorkspace = (
    server: string,
    state: SavedWorkspace,
    storage: Pick<Storage, 'setItem'> = localStorage
): void => {
    try {
        storage.setItem(key(server), JSON.stringify(state));
    } catch {
        // Not being able to remember it is no reason to break anything.
    }
};

// ---- which view of the file manager ----------------------------------------------------------------------------------------

export type FilesView = 'list' | 'editor';

const VIEW_KEY = 'panel:files:view';

export const getFilesView = (storage: Pick<Storage, 'getItem'> = localStorage): FilesView => {
    try {
        return storage.getItem(VIEW_KEY) === 'editor' ? 'editor' : 'list';
    } catch {
        return 'list';
    }
};

export const setFilesView = (view: FilesView, storage: Pick<Storage, 'setItem'> = localStorage): void => {
    try {
        storage.setItem(VIEW_KEY, view);
    } catch {
        // See saveWorkspace.
    }
};
