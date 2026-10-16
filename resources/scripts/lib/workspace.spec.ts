import {
    baseName,
    checkName,
    clampSidebar,
    closeTab,
    dropPrefix,
    getFilesView,
    isInside,
    joinPath,
    loadWorkspace,
    moveTab,
    normalizePath,
    openTab,
    parentPath,
    renamedPath,
    saveWorkspace,
    setFilesView,
    sortNodes,
    tabsUnder,
    TreeNode,
    visibleRows,
} from '@/lib/workspace';

const file = (path: string, size = 1): TreeNode => ({ path, name: baseName(path), isDirectory: false, size });
const dir = (path: string): TreeNode => ({ path, name: baseName(path), isDirectory: true, size: 0 });

class MemoryStorage {
    data: Record<string, string> = {};
    getItem = (k: string) => this.data[k] ?? null;
    setItem = (k: string, v: string) => {
        this.data[k] = v;
    };
}

describe('lib/workspace paths', () => {
    it('normalizes', () => {
        expect(normalizePath('')).toBe('/');
        expect(normalizePath('/')).toBe('/');
        expect(normalizePath('a//b/')).toBe('/a/b');
        expect(normalizePath('/a/./b/../c')).toBe('/a/c');
        expect(normalizePath('/../..')).toBe('/');
    });

    it('joins, finds parents and names', () => {
        expect(joinPath('/', 'a.txt')).toBe('/a.txt');
        expect(joinPath('/world/', 'level.dat')).toBe('/world/level.dat');
        expect(parentPath('/world/level.dat')).toBe('/world');
        expect(parentPath('/a.txt')).toBe('/');
        expect(parentPath('/')).toBe('/');
        expect(baseName('/world/level.dat')).toBe('level.dat');
    });

    it('knows what is inside what, and not by prefix of the name', () => {
        expect(isInside('/a/b', '/a')).toBe(true);
        expect(isInside('/a', '/a')).toBe(true);
        expect(isInside('/ab', '/a')).toBe(false);
        expect(isInside('/anything', '/')).toBe(true);
    });

    it('checks names', () => {
        expect(checkName('ok.txt')).toBeNull();
        expect(checkName('  ')).toBeTruthy();
        expect(checkName('..')).toBeTruthy();
        expect(checkName('a/b')).toBeTruthy();
        expect(checkName('a\\b')).toBeTruthy();
        expect(checkName('taken', ['taken'])).toBeTruthy();
        expect(checkName('free', ['taken'])).toBeNull();
    });
});

describe('lib/workspace tree', () => {
    it('sorts folders first and numbers the way people read them', () => {
        const names = sortNodes([file('/file10'), dir('/zeta'), file('/file2'), dir('/Alpha'), file('/File1')]).map(
            (n) => n.name
        );
        expect(names).toEqual(['Alpha', 'zeta', 'File1', 'file2', 'file10']);
    });

    it('shows the contents of open folders only, indented', () => {
        const children = {
            '/': [dir('/world'), file('/eula.txt'), dir('/mods')],
            '/world': [file('/world/level.dat'), dir('/world/region')],
            '/world/region': [file('/world/region/r.0.0.mca')],
            '/mods': [file('/mods/a.jar')],
        };

        const closed = visibleRows(children, new Set(), new Set());
        expect(closed.map((r) => [r.node.name, r.depth])).toEqual([
            ['mods', 0],
            ['world', 0],
            ['eula.txt', 0],
        ]);

        const rows = visibleRows(children, new Set(['/world', '/world/region']), new Set());
        expect(rows.map((r) => [r.node.name, r.depth, r.expanded])).toEqual([
            ['mods', 0, false],
            ['world', 0, true],
            ['region', 1, true],
            ['r.0.0.mca', 2, false],
            ['level.dat', 1, false],
            ['eula.txt', 0, false],
        ]);
    });

    it('does not show what is inside a folder whose parent is closed, even when it is remembered as open', () => {
        const children = { '/': [dir('/a')], '/a': [dir('/a/b')], '/a/b': [file('/a/b/c.txt')] };
        const rows = visibleRows(children, new Set(['/a/b']), new Set());
        expect(rows.map((r) => r.node.name)).toEqual(['a']);
    });

    it('shows a folder that is still loading as loading, and one that is not found yet as empty', () => {
        const rows = visibleRows({ '/': [dir('/a')] }, new Set(['/a']), new Set(['/a']));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ expanded: true, loading: true });
    });

    it('forgets what is under a folder', () => {
        expect(Object.keys(dropPrefix({ '/': 1, '/a': 2, '/a/b': 3, '/ab': 4 }, '/a'))).toEqual(['/', '/ab']);
    });
});

describe('lib/workspace tabs', () => {
    const tabs = (...paths: string[]) => paths.map((path) => ({ path, name: baseName(path) }));

    it('opens a file once', () => {
        const one = openTab([], '/a.txt');
        expect(one).toEqual(tabs('/a.txt'));
        expect(openTab(one, '/a.txt')).toBe(one);
        expect(openTab(one, '/b.txt').map((t) => t.path)).toEqual(['/a.txt', '/b.txt']);
    });

    it('activates the tab on the right when the active one is closed, else the left, else nothing', () => {
        const three = tabs('/a', '/b', '/c');
        expect(closeTab(three, '/b', '/b')).toEqual({ tabs: tabs('/a', '/c'), active: '/c' });
        expect(closeTab(three, '/c', '/c')).toEqual({ tabs: tabs('/a', '/b'), active: '/b' });
        expect(closeTab(tabs('/a'), '/a', '/a')).toEqual({ tabs: [], active: null });
    });

    it('keeps the active tab when another is closed, and ignores tabs that are not open', () => {
        const three = tabs('/a', '/b', '/c');
        expect(closeTab(three, '/c', '/a')).toEqual({ tabs: tabs('/b', '/c'), active: '/c' });
        expect(closeTab(three, '/c', '/nothing')).toEqual({ tabs: three, active: '/c' });
    });

    it('moves a tab', () => {
        const three = tabs('/a', '/b', '/c');
        expect(moveTab(three, '/a', '/c').map((t) => t.path)).toEqual(['/b', '/c', '/a']);
        expect(moveTab(three, '/c', '/a').map((t) => t.path)).toEqual(['/c', '/a', '/b']);
        expect(moveTab(three, '/a', '/a')).toBe(three);
        expect(moveTab(three, '/a', '/missing')).toBe(three);
    });

    it('follows a rename, for a file and for what is inside a folder, and not for look-alikes', () => {
        expect(renamedPath('/a.txt', '/a.txt', '/b.txt')).toBe('/b.txt');
        expect(renamedPath('/dir/x.txt', '/dir', '/new')).toBe('/new/x.txt');
        expect(renamedPath('/dir2/x.txt', '/dir', '/new')).toBe('/dir2/x.txt');
        expect(renamedPath('/other', '/dir', '/new')).toBe('/other');
    });

    it('finds the tabs a delete takes away', () => {
        const some = tabs('/world/level.dat', '/world/region/r.mca', '/worldx', '/eula.txt');
        expect(tabsUnder(some, '/world').map((t) => t.path)).toEqual(['/world/level.dat', '/world/region/r.mca']);
        expect(tabsUnder(some, '/eula.txt').map((t) => t.path)).toEqual(['/eula.txt']);
    });
});

describe('lib/workspace memory', () => {
    it('remembers what was open and gets it back', () => {
        const storage = new MemoryStorage();
        saveWorkspace(
            'srv',
            { tabs: ['/a.txt', '/b/c.txt'], active: '/b/c.txt', expanded: ['/b'], sidebarWidth: 300 },
            storage
        );

        expect(loadWorkspace('srv', storage)).toEqual({
            tabs: ['/a.txt', '/b/c.txt'],
            active: '/b/c.txt',
            expanded: ['/b'],
            sidebarWidth: 300,
        });
        expect(loadWorkspace('other', storage).tabs).toEqual([]);
    });

    it('survives nonsense in the storage', () => {
        const storage = new MemoryStorage();
        for (const junk of [
            'not json',
            'null',
            '42',
            '{"tabs":"x"}',
            '{"tabs":[1,"/ok"],"active":"/missing","expanded":null,"sidebarWidth":"wide"}',
        ]) {
            storage.data['panel:workspace:srv'] = junk;
            const loaded = loadWorkspace('srv', storage);
            expect(Array.isArray(loaded.tabs)).toBe(true);
            expect(loaded.sidebarWidth).toBeGreaterThanOrEqual(180);
        }
        expect(loadWorkspace('srv', storage)).toEqual({ tabs: ['/ok'], active: null, expanded: [], sidebarWidth: 260 });
    });

    it('does not break when the storage does', () => {
        const broken = {
            getItem: () => {
                throw new Error('no');
            },
            setItem: () => {
                throw new Error('no');
            },
        };
        expect(() => saveWorkspace('srv', loadWorkspace('srv', broken), broken)).not.toThrow();
        expect(getFilesView(broken)).toBe('list');
        expect(() => setFilesView('editor', broken)).not.toThrow();
    });

    it('keeps the sidebar a usable width', () => {
        expect(clampSidebar(10)).toBe(180);
        expect(clampSidebar(9999)).toBe(520);
        expect(clampSidebar(333.4)).toBe(333);
        expect(clampSidebar(NaN)).toBe(260);
    });

    it('remembers the view and defaults to the list', () => {
        const storage = new MemoryStorage();
        expect(getFilesView(storage)).toBe('list');
        setFilesView('editor', storage);
        expect(getFilesView(storage)).toBe('editor');
        setFilesView('list', storage);
        expect(getFilesView(storage)).toBe('list');
    });
});
