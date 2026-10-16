import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { CodeIcon, DocumentTextIcon } from '@heroicons/react/outline';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import FlashMessageRender from '@/components/FlashMessageRender';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { Dialog } from '@/components/elements/dialog';
import { Button } from '@/components/elements/button/index';
import { findLanguageByFilename, getLanguages } from '@/components/elements/MonacoEditor';
import FileTooLarge from '@/components/server/files/FileTooLarge';
import StratPanelFileWarning from '@/components/server/files/StratPanelFileWarning';
import ViewSwitch from '@/components/server/files/ViewSwitch';
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import createDirectory from '@/api/server/files/createDirectory';
import renameFiles from '@/api/server/files/renameFiles';
import deleteFiles from '@/api/server/files/deleteFiles';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { isTooLargeError, MAX_EDIT_BYTES } from '@/lib/fileLimits';
import {
    baseName,
    clampSidebar,
    closeTab,
    joinPath,
    loadWorkspace,
    moveTab,
    normalizePath,
    openTab,
    parentPath,
    renamedPath,
    saveWorkspace,
    Tab,
    tabsUnder,
    TreeNode,
    visibleRows,
} from '@/lib/workspace';
import useFileTree from '@/components/server/files/workspace/useFileTree';
import FileTree, { Editing } from '@/components/server/files/workspace/FileTree';
import EditorTabs from '@/components/server/files/workspace/EditorTabs';
import WorkspaceEditor, { Doc } from '@/components/server/files/workspace/WorkspaceEditor';
import ContextMenu, { MenuItem } from '@/components/server/files/workspace/ContextMenu';

type Status = 'loading' | 'ready' | 'error' | 'toolarge' | 'binary';

interface TabMeta {
    status: Status;
    error?: string;
    language: string;
}

const FLASH = 'files:workspace';

/**
 * The file manager as a code editor: the folders of the server as a tree on the left that opens and closes like the explorer of an
 * editor, and the files opened from it as tabs above an editor (Monaco, the editor of VS Code). Changes are kept per tab until saved.
 */
export default ({ initialFile }: { initialFile?: string }) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const trash = ServerContext.useStoreState((state) => state.server.data!.trash);
    const socket = ServerContext.useStoreState((state) => state.socket.instance);
    const [canRead, canUpdate, canCreate, canDelete, canRestart] = usePermissions([
        'file.read-content',
        'file.update',
        'file.create',
        'file.delete',
        'control.restart',
    ]);
    const { addError, clearFlashes, addFlash } = useFlash();

    // What was open last time on this server.
    const saved = useMemo(() => loadWorkspace(uuid), [uuid]);
    const tree = useFileTree(uuid, saved.expanded);

    const [tabs, setTabs] = useState<Tab[]>(() => saved.tabs.map((path) => ({ path, name: baseName(path) })));
    const [active, setActive] = useState<string | null>(saved.active ?? saved.tabs[saved.tabs.length - 1] ?? null);
    const [meta, setMeta] = useState<Record<string, TabMeta>>({});
    const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
    const [revision, setRevision] = useState(0);
    const [saving, setSaving] = useState(false);
    const [width, setWidth] = useState(saved.sidebarWidth);
    const [cursor, setCursor] = useState({ line: 1, column: 1 });

    const [selected, setSelected] = useState<string | null>(null);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null);
    const [deleting, setDeleting] = useState<TreeNode | null>(null);
    const [closing, setClosing] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    const docs = useRef(new Map<string, Doc>());
    const container = useRef<HTMLDivElement>(null);
    const languages = useMemo(() => getLanguages(), []);
    // The newest values for callbacks that run after a request or an event.
    const tabsRef = useRef(tabs);
    const activeRef = useRef(active);
    const metaRef = useRef(meta);
    tabsRef.current = tabs;
    activeRef.current = active;
    metaRef.current = meta;

    // ---- documents ------------------------------------------------------------------------------------------------------

    const isDirty = (doc: Doc) => doc.model.getAlternativeVersionId() !== doc.savedVersion;

    const refreshDirty = useCallback((path: string) => {
        const doc = docs.current.get(path);
        if (!doc) return;
        const now = isDirty(doc);

        setDirty((current) => {
            if (current.has(path) === now) return current;
            const next = new Set(current);
            if (now) next.add(path);
            else next.delete(path);

            return next;
        });
    }, []);

    const attach = useCallback(
        (path: string, doc: Doc) => doc.model.onDidChangeContent(() => refreshDirty(path)),
        [refreshDirty]
    );

    const load = useCallback(
        async (path: string) => {
            const language = findLanguageByFilename(path);
            const set = (value: Omit<TabMeta, 'language'>) =>
                setMeta((m) => ({ ...m, [path]: { language, ...value } }));
            const stillOpen = () => tabsRef.current.some((tab) => tab.path === path);

            if (!canRead) {
                return set({ status: 'error', error: 'You do not have permission to read the contents of files.' });
            }
            set({ status: 'loading' });

            try {
                const text = await getFileContents(uuid, path);
                if (!stillOpen()) return;
                if (new Blob([text]).size > MAX_EDIT_BYTES) return set({ status: 'toolarge' });
                if (text.indexOf('\u0000') >= 0) return set({ status: 'binary' });

                const model = monaco.editor.createModel(text, language);
                const doc: Doc = {
                    model,
                    viewState: null,
                    savedVersion: model.getAlternativeVersionId(),
                    listener: { dispose: () => undefined },
                };
                doc.listener = attach(path, doc);
                docs.current.set(path, doc);
                set({ status: 'ready' });
                setRevision((r) => r + 1);
            } catch (error) {
                if (!stillOpen()) return;
                set(
                    isTooLargeError(error)
                        ? { status: 'toolarge' }
                        : { status: 'error', error: httpErrorToHuman(error) }
                );
            }
        },
        [uuid, canRead, attach]
    );

    // A tab is read when it is shown the first time (tabs that were open last time are only read when they are chosen).
    useEffect(() => {
        if (active && !docs.current.has(active) && !metaRef.current[active]) load(active);
    }, [active, load]);

    const openFile = useCallback(
        (path: string) => {
            const normalized = normalizePath(path);
            setTabs((current) => openTab(current, normalized));
            setActive(normalized);
            tree.reveal(normalized);
            setSelected(normalized);
        },
        [tree.reveal]
    );

    // A link that opens a file in the editor view.
    useEffect(() => {
        if (initialFile && initialFile !== '/') openFile(initialFile);
    }, [initialFile]);

    const closeNow = useCallback((path: string) => {
        const doc = docs.current.get(path);
        if (doc) {
            doc.listener.dispose();
            doc.model.dispose();
            docs.current.delete(path);
        }

        const next = closeTab(tabsRef.current, activeRef.current, path);
        setTabs(next.tabs);
        setActive(next.active);
        setMeta((m) => {
            const { [path]: _gone, ...rest } = m;

            return rest;
        });
        setDirty((current) => {
            if (!current.has(path)) return current;
            const rest = new Set(current);
            rest.delete(path);

            return rest;
        });
        setRevision((r) => r + 1);
    }, []);

    const requestClose = (path: string) => {
        const doc = docs.current.get(path);
        if (doc && isDirty(doc)) setClosing(path);
        else closeNow(path);
    };

    // ---- saving ---------------------------------------------------------------------------------------------------------

    const save = useCallback(
        async (path: string | null = activeRef.current): Promise<boolean> => {
            const doc = path ? docs.current.get(path) : undefined;
            if (!path || !doc || !canUpdate) return false;

            setSaving(true);
            clearFlashes(FLASH);
            try {
                const version = doc.model.getAlternativeVersionId();
                await saveFileContents(uuid, path, doc.model.getValue());
                // Typing went on while it was being saved: that part is not saved yet.
                doc.savedVersion = version;
                refreshDirty(path);

                return true;
            } catch (error) {
                addError({ key: FLASH, message: `${baseName(path)} could not be saved: ${httpErrorToHuman(error)}` });

                return false;
            } finally {
                setSaving(false);
            }
        },
        [uuid, canUpdate, refreshDirty]
    );

    const saveAndRestart = async () => {
        if (!(await save())) return;
        socket?.send('set state', 'restart');
        addFlash({ key: FLASH, type: 'success', message: 'File saved. The server is restarting.' });
    };

    // Unsaved changes are not thrown away by closing the page without a word.
    useEffect(() => {
        if (dirty.size === 0) return;
        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);

        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty.size]);

    // The models are the workspace's own, they go when it goes.
    useEffect(
        () => () => {
            docs.current.forEach((doc) => {
                doc.listener.dispose();
                doc.model.dispose();
            });
            docs.current.clear();
        },
        []
    );

    // ---- remembering ----------------------------------------------------------------------------------------------------

    useEffect(() => {
        saveWorkspace(uuid, {
            tabs: tabs.map((tab) => tab.path),
            active,
            expanded: [...tree.expanded],
            sidebarWidth: width,
        });
    }, [uuid, tabs, active, tree.expanded, width]);

    // ---- the tree: making, renaming, deleting ---------------------------------------------------------------------------

    const folderFor = (path: string | null): string => {
        if (!path) return '/';
        const node = Object.values(tree.children)
            .flat()
            .find((n) => n?.path === path);

        return node && !node.isDirectory ? parentPath(path) : path;
    };

    const startNew = (kind: 'new-file' | 'new-folder', parent: string = folderFor(selected)) => {
        tree.expand(parent);
        setEditing({ kind, parent });
    };

    const startRename = (node: TreeNode) =>
        setEditing({ kind: 'rename', parent: parentPath(node.path), path: node.path });

    const retarget = (from: string, to: string) => {
        const map = (path: string) => renamedPath(path, from, to);

        setTabs((current) => current.map((tab) => ({ path: map(tab.path), name: baseName(map(tab.path)) })));
        setActive((current) => (current ? map(current) : current));
        setSelected((current) => (current ? map(current) : current));
        setMeta((m) => Object.fromEntries(Object.entries(m).map(([path, value]) => [map(path), value])));
        setDirty((current) => new Set([...current].map(map)));

        const moved = new Map<string, Doc>();
        docs.current.forEach((doc, path) => {
            const next = map(path);
            if (next !== path) {
                doc.listener.dispose();
                doc.listener = attach(next, doc);
            }
            moved.set(next, doc);
        });
        docs.current.clear();
        moved.forEach((doc, path) => docs.current.set(path, doc));
        setRevision((r) => r + 1);
    };

    const commitEdit = async (name: string) => {
        const current = editing;
        setEditing(null);
        if (!current) return;
        clearFlashes(FLASH);

        try {
            if (current.kind === 'new-file') {
                const path = joinPath(current.parent, name);
                await saveFileContents(uuid, path, '');
                await tree.refresh(current.parent);
                openFile(path);
            } else if (current.kind === 'new-folder') {
                await createDirectory(uuid, current.parent, name);
                await tree.refresh(current.parent);
                tree.expand(joinPath(current.parent, name));
            } else if (current.path) {
                const from = current.path;
                const to = joinPath(current.parent, name);
                await renameFiles(uuid, current.parent, [{ from: baseName(from), to: name }]);
                tree.forget(from);
                retarget(from, to);
                await tree.refresh(current.parent);
            }
        } catch (error) {
            addError({ key: FLASH, message: httpErrorToHuman(error) });
            tree.refresh(current.parent);
        }
    };

    const confirmDelete = async () => {
        const node = deleting;
        if (!node) return;
        clearFlashes(FLASH);

        try {
            await deleteFiles(uuid, parentPath(node.path), [node.name]);
            // What was open from it has nothing to be saved to any more.
            tabsUnder(tabsRef.current, node.path).forEach((tab) => closeNow(tab.path));
            if (node.isDirectory) tree.forget(node.path);
            if (selected && (selected === node.path || selected.startsWith(node.path + '/'))) setSelected(null);
        } catch (error) {
            addError({ key: FLASH, message: httpErrorToHuman(error) });
        } finally {
            setDeleting(null);
            tree.refresh(parentPath(node.path));
        }
    };

    const download = (path: string) => {
        setDownloading(true);
        getFileDownloadUrl(uuid, path)
            .then((url) => {
                window.location.href = url;
            })
            .catch((error) => addError({ key: FLASH, message: httpErrorToHuman(error) }))
            .then(() => setDownloading(false));
    };

    const menuItems = (node: TreeNode | null): MenuItem[] => {
        const parent = node ? (node.isDirectory ? node.path : parentPath(node.path)) : '/';

        return [
            { label: 'Open', hidden: !node || node.isDirectory, onSelect: () => node && openFile(node.path) },
            {
                label: 'New file',
                hidden: !canCreate,
                onSelect: () => startNew('new-file', parent),
                separator: !!node && !node.isDirectory,
            },
            { label: 'New folder', hidden: !canCreate, onSelect: () => startNew('new-folder', parent) },
            {
                label: 'Rename',
                hidden: !node || !canUpdate,
                onSelect: () => node && startRename(node),
                separator: true,
            },
            {
                label: 'Download',
                hidden: !node || node.isDirectory || !canRead,
                onSelect: () => node && download(node.path),
            },
            { label: 'Copy path', hidden: !node, onSelect: () => node && navigator.clipboard?.writeText(node.path) },
            {
                label: 'Refresh',
                hidden: !!node && !node.isDirectory,
                onSelect: () => tree.refresh(parent),
                separator: true,
            },
            {
                label: 'Delete',
                danger: true,
                hidden: !node || !canDelete,
                onSelect: () => node && setDeleting(node),
                separator: true,
            },
        ];
    };

    const onTreeKeyDown = (e: React.KeyboardEvent) => {
        if ((e.target as HTMLElement).tagName === 'INPUT' || !selected) return;
        const node = Object.values(tree.children)
            .flat()
            .find((n) => n?.path === selected);
        if (!node) return;

        if (e.key === 'F2' && canUpdate) {
            e.preventDefault();
            startRename(node);
        }
        if (e.key === 'Delete' && canDelete) {
            e.preventDefault();
            setDeleting(node);
        }
    };

    // ---- layout ---------------------------------------------------------------------------------------------------------

    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        const left = container.current?.getBoundingClientRect().left ?? 0;
        const move = (event: MouseEvent) => setWidth(clampSidebar(event.clientX - left));
        const stop = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', stop);
            document.body.style.userSelect = '';
        };
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', stop);
    };

    const rows = useMemo(
        () => visibleRows(tree.children, tree.expanded, tree.loading),
        [tree.children, tree.expanded, tree.loading]
    );
    const activeMeta = active ? meta[active] : undefined;
    const activeDoc = active ? docs.current.get(active) : undefined;
    const showEditor = !!active && activeMeta?.status === 'ready';
    const failedFolders = Object.entries(tree.failed).filter(([path]) => path !== '/');

    const changeLanguage = (id: string) => {
        if (!active || !activeDoc) return;
        monaco.editor.setModelLanguage(activeDoc.model, id);
        setMeta((m) => ({ ...m, [active]: { ...m[active], language: id } }));
    };

    return (
        <ServerContentBlock title={'File Manager'}>
            <div css={tw`mb-4 flex flex-wrap items-center justify-between gap-3`}>
                <h1 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>File Manager</h1>
                <ViewSwitch />
            </div>
            <FlashMessageRender byKey={FLASH} css={tw`mb-3`} />
            <Dialog.Confirm
                open={!!deleting}
                title={`Delete ${deleting?.isDirectory ? 'folder' : 'file'}`}
                confirm={'Delete'}
                onConfirmed={confirmDelete}
                onClose={() => setDeleting(null)}
            >
                {trash.enabled ? (
                    <>
                        <span className={'font-semibold text-neutral-50'}>{deleting?.name}</span> will be moved to the
                        trash bin and kept for {trash.retentionDays} {trash.retentionDays === 1 ? 'day' : 'days'}.
                    </>
                ) : (
                    <>
                        You will not be able to recover{' '}
                        <span className={'font-semibold text-neutral-50'}>{deleting?.name}</span> once deleted.
                    </>
                )}
                {deleting && tabsUnder(tabs, deleting.path).some((tab) => dirty.has(tab.path)) && (
                    <p className={'mt-2 text-yellow-700'}>Changes you have not saved in its open tabs are lost.</p>
                )}
                {deleting && <StratPanelFileWarning directory={parentPath(deleting.path)} names={[deleting.name]} />}
            </Dialog.Confirm>
            <Dialog.Confirm
                open={!!closing}
                title={'Unsaved changes'}
                confirm={'Close without saving'}
                onConfirmed={() => {
                    if (closing) closeNow(closing);
                    setClosing(null);
                }}
                onClose={() => setClosing(null)}
            >
                <span className={'font-semibold text-neutral-50'}>{closing ? baseName(closing) : ''}</span> has changes
                that are not saved. They are lost when you close it.
            </Dialog.Confirm>
            {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />}

            <div
                ref={container}
                onKeyDown={(e) => {
                    // The browser would offer to save the page.
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault();
                        save();
                    }
                }}
                style={{ height: 'calc(100vh - 14rem)', minHeight: '30rem' }}
                className={'flex overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}
            >
                <aside
                    tabIndex={-1}
                    onKeyDown={onTreeKeyDown}
                    style={{ width }}
                    className={'flex min-h-0 flex-shrink-0 flex-col border-r border-neutral-500 outline-none'}
                >
                    <div className={'min-h-0 flex-1'}>
                        <FileTree
                            rows={rows}
                            rootName={serverName}
                            selected={selected}
                            active={active}
                            editing={editing}
                            namesIn={(directory) => (tree.children[directory] ?? []).map((n) => n.name)}
                            rootLoading={tree.loading.has('/')}
                            rootError={tree.failed['/']}
                            canCreate={canCreate}
                            onToggle={(node) => tree.toggle(node.path)}
                            onSelect={setSelected}
                            onOpen={(node) => openFile(node.path)}
                            onMenu={(e, node) => setMenu({ x: e.clientX, y: e.clientY, node })}
                            onNewFile={() => startNew('new-file')}
                            onNewFolder={() => startNew('new-folder')}
                            onRefresh={() => tree.refreshAll()}
                            onCollapseAll={tree.collapseAll}
                            onCommit={commitEdit}
                            onCancelEdit={() => setEditing(null)}
                            onRetry={() => tree.refresh('/')}
                        />
                    </div>
                    {failedFolders.length > 0 && (
                        <div className={'border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'}>
                            {failedFolders.map(([path, reason]) => (
                                <p key={path} className={'break-words'}>
                                    {path}: {reason}
                                </p>
                            ))}
                        </div>
                    )}
                </aside>
                <div
                    role={'separator'}
                    aria-orientation={'vertical'}
                    onMouseDown={startResize}
                    onDoubleClick={() => setWidth(clampSidebar(260))}
                    title={'Drag to resize'}
                    className={'w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary-400'}
                />
                <section className={'flex min-w-0 flex-1 flex-col'}>
                    <EditorTabs
                        tabs={tabs}
                        active={active}
                        dirty={dirty}
                        onActivate={setActive}
                        onClose={requestClose}
                        onMove={(from, to) => setTabs((current) => moveTab(current, from, to))}
                    >
                        {canUpdate && showEditor && (
                            <>
                                {canRestart && (
                                    <Button
                                        size={Button.Sizes.Small}
                                        variant={Button.Variants.Secondary}
                                        disabled={!socket || saving}
                                        onClick={saveAndRestart}
                                    >
                                        Save &amp; Restart
                                    </Button>
                                )}
                                <Button
                                    size={Button.Sizes.Small}
                                    disabled={saving || !(active && dirty.has(active))}
                                    onClick={() => save()}
                                >
                                    Save
                                </Button>
                            </>
                        )}
                    </EditorTabs>
                    <div className={'relative flex min-h-0 flex-1 flex-col'}>
                        <WorkspaceEditor
                            docs={docs}
                            path={showEditor ? active : null}
                            revision={revision}
                            readOnly={!canUpdate}
                            visible={showEditor}
                            onSave={() => save()}
                            onCursor={(line, column) => setCursor({ line, column })}
                        />
                        {!showEditor && (
                            <div
                                className={
                                    'absolute inset-0 flex items-center justify-center overflow-auto bg-white p-6 text-center'
                                }
                            >
                                {!active ? (
                                    <div className={'max-w-sm text-neutral-300'}>
                                        <CodeIcon className={'mx-auto mb-3 h-12 w-12 text-neutral-400'} />
                                        <p className={'text-lg font-semibold text-neutral-50'}>Open a file</p>
                                        <p className={'mt-1 text-sm'}>
                                            Choose a file in the explorer on the left to open it in a tab. Right click
                                            for more, F2 renames and Delete deletes what is selected.
                                        </p>
                                    </div>
                                ) : activeMeta?.status === 'error' ? (
                                    <div className={'max-w-md'}>
                                        <p className={'break-all font-mono text-xs text-neutral-300'}>{active}</p>
                                        <p className={'mt-2 text-sm text-red-600'}>{activeMeta.error}</p>
                                        <div className={'mt-4 flex justify-center gap-2'}>
                                            <Button
                                                size={Button.Sizes.Small}
                                                onClick={() => {
                                                    setMeta((m) => {
                                                        const { [active]: _x, ...rest } = m;
                                                        return rest;
                                                    });
                                                }}
                                            >
                                                Try again
                                            </Button>
                                            <Button
                                                size={Button.Sizes.Small}
                                                variant={Button.Variants.Secondary}
                                                onClick={() => closeNow(active)}
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                ) : activeMeta?.status === 'toolarge' ? (
                                    <FileTooLarge
                                        name={active}
                                        size={null}
                                        limit={MAX_EDIT_BYTES}
                                        downloading={downloading}
                                        onDownload={() => download(active)}
                                        onBack={() => closeNow(active)}
                                    />
                                ) : activeMeta?.status === 'binary' ? (
                                    <div className={'max-w-md text-neutral-300'}>
                                        <DocumentTextIcon className={'mx-auto mb-3 h-10 w-10 text-neutral-400'} />
                                        <p className={'break-all font-mono text-xs'}>{active}</p>
                                        <p className={'mt-2 text-sm'}>
                                            This is a binary file, it can not be shown as text. You can download it.
                                        </p>
                                        <div className={'mt-4 flex justify-center gap-2'}>
                                            <Button
                                                size={Button.Sizes.Small}
                                                disabled={downloading}
                                                onClick={() => download(active)}
                                            >
                                                Download
                                            </Button>
                                            <Button
                                                size={Button.Sizes.Small}
                                                variant={Button.Variants.Secondary}
                                                onClick={() => closeNow(active)}
                                            >
                                                Close
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <SpinnerOverlay visible size={'large'} />
                                )}
                            </div>
                        )}
                    </div>
                    <div
                        className={
                            'flex items-center justify-between gap-3 border-t border-neutral-500 bg-neutral-600 px-3 py-1 text-xs text-neutral-300'
                        }
                    >
                        <span className={'truncate'} title={active ?? ''}>
                            {active ?? serverName}
                            {!canUpdate && showEditor && ' (read only)'}
                        </span>
                        {showEditor && activeMeta && (
                            <div className={'flex flex-shrink-0 items-center gap-3'}>
                                <span>
                                    {saving ? 'Saving…' : active && dirty.has(active) ? 'Unsaved changes' : 'Saved'}
                                </span>
                                <span>
                                    Ln {cursor.line}, Col {cursor.column}
                                </span>
                                <select
                                    aria-label={'Language'}
                                    value={activeMeta.language}
                                    onChange={(e) => changeLanguage(e.currentTarget.value)}
                                    className={
                                        'rounded border border-neutral-500 bg-white px-1 py-0.5 text-xs text-neutral-200'
                                    }
                                >
                                    {languages.map((language) => (
                                        <option key={language.id} value={language.id}>
                                            {language.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </ServerContentBlock>
    );
};
