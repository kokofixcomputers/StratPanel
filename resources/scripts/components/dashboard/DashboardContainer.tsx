import React, { useEffect, useMemo, useState } from 'react';
import { Server } from '@/api/server/getServer';
import getServers, { getAllServers } from '@/api/getServers';
import ServerRow, { RowOrganizer } from '@/components/dashboard/ServerRow';
import Spinner from '@/components/elements/Spinner';
import PageContentBlock from '@/components/elements/PageContentBlock';
import useFlash from '@/plugins/useFlash';
import { useStoreState } from 'easy-peasy';
import Switch from '@/components/elements/Switch';
import tw from 'twin.macro';
import useSWR from 'swr';
import { httpErrorToHuman, PaginatedResult } from '@/api/http';
import Pagination from '@/components/elements/Pagination';
import { Link, useLocation } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/solid';
import Button from '@/components/elements/Button';
import { getSelfService, SelfService } from '@/api/selfService';
import Announcements from '@/components/dashboard/Announcements';
import ExtensionSlot from '@/components/elements/ExtensionSlot';
import DashboardToolbar from '@/components/dashboard/DashboardToolbar';
import FolderSection from '@/components/dashboard/FolderSection';
import FolderNameModal from '@/components/dashboard/FolderNameModal';
import ConfirmationModal from '@/components/elements/ConfirmationModal';
import useServerStats from '@/components/dashboard/useServerStats';
import {
    createFolder,
    DashboardLayout,
    deleteFolder,
    emptyLayout,
    markServer,
    markServerLocally,
    reloadLayout,
    renameFolder,
    reorderFolders,
    ServerMark,
    showLayout,
    useDashboardLayout,
} from '@/api/dashboardLayout';
import {
    filterServers,
    filtersActive,
    groupServers,
    ListFilters,
    noFilters,
    SortKey,
    sortServers,
} from '@/lib/dashboardList';

// A choice that is kept in the browser. Not the shared usePersistedState: that one warns for every plain string.
function useStored<T>(key: string, fallback: T): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);

            return item === null ? fallback : (JSON.parse(item) as T);
        } catch (e) {
            return fallback;
        }
    });

    return [
        value,
        (next: T) => {
            setValue(next);
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
            } catch (e) {
                // Not kept, still works.
            }
        },
    ];
}

export default () => {
    const { search } = useLocation();
    const defaultPage = Number(new URLSearchParams(search).get('page') || '1');

    const [page, setPage] = useState(!isNaN(defaultPage) && defaultPage > 0 ? defaultPage : 1);
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();
    const uuid = useStoreState((state) => state.user.data!.uuid);
    const rootAdmin = useStoreState((state) => state.user.data!.canAccessAllServers);
    const [showOnlyAdmin, setShowOnlyAdmin] = useStored(`${uuid}:show_all_servers`, false);
    const othersMode = !!showOnlyAdmin && rootAdmin;

    const [filters, setFilters] = useState<ListFilters>(noFilters);
    const [sort, setSort] = useStored<SortKey>(`${uuid}:dashboard_sort`, 'name');
    const [collapsed, setCollapsed] = useStored<number[]>(`${uuid}:dashboard_collapsed`, []);
    const [debounced, setDebounced] = useState('');

    // The servers of the person are all loaded, so search and folders work on all of them. The ones of other users (for an admin
    // there can be thousands) are paged and searched by the panel.
    const own = useSWR<Server[]>(othersMode ? null : ['/api/client/servers', 'all'], getAllServers);
    const others = useSWR<PaginatedResult<Server>>(
        othersMode ? ['/api/client/servers', 'admin', page, debounced] : null,
        () => getServers({ page, type: 'admin', query: debounced || undefined })
    );
    const error = othersMode ? others.error : own.error;
    const servers: Server[] | undefined = othersMode ? others.data?.items : own.data;

    const { data: layoutData } = useDashboardLayout();
    const layout: DashboardLayout = layoutData ?? emptyLayout;
    const marks = useMemo(() => {
        const map: Record<string, ServerMark> = {};
        layout.servers.forEach((m) => (map[m.uuid] = m));

        return map;
    }, [layout]);

    const { stats, refresh } = useServerStats(servers ?? []);

    useEffect(() => {
        setPage(1);
    }, [showOnlyAdmin, debounced]);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(othersMode ? filters.query.trim() : ''), 300);

        return () => clearTimeout(timer);
    }, [filters.query, othersMode]);

    useEffect(() => {
        if (!others.data) return;
        if (others.data.pagination.currentPage > 1 && !others.data.items.length) setPage(1);
    }, [others.data?.pagination.currentPage]);

    useEffect(() => {
        // Don't use react-router to handle changing this part of the URL, otherwise it
        // triggers a needless re-render. We just want to track this in the URL incase the
        // user refreshes the page.
        window.history.replaceState(null, document.title, `/${othersMode && page > 1 ? `?page=${page}` : ''}`);
    }, [page, othersMode]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'dashboard', error });
        if (!error) clearFlashes('dashboard');
    }, [error]);

    const [selfService, setSelfService] = useState<SelfService | null>(null);
    useEffect(() => {
        getSelfService()
            .then(setSelfService)
            .catch(() => setSelfService(null));
    }, []);

    // What is shown: filtered and sorted. For the other users' servers the panel has done the search already.
    const shown = useMemo(
        () =>
            sortServers(
                filterServers(servers ?? [], othersMode ? { ...filters, query: '' } : filters, stats, marks),
                sort,
                stats,
                marks
            ),
        [servers, filters, sort, stats, marks, othersMode]
    );
    const nodes = useMemo(() => Array.from(new Set((servers ?? []).map((s) => s.node))).sort(), [servers]);
    const hasShared = (servers ?? []).some((s) => !s.isOwner);
    const filtering = filtersActive(filters);

    // Folders and stars.
    const fail = (e: unknown) => {
        addFlash({ key: 'dashboard', type: 'error', title: 'Error', message: httpErrorToHuman(e) });
        reloadLayout();
    };
    const mark = (serverUuid: string, change: { folder?: number | null; starred?: boolean }) => {
        showLayout(markServerLocally(layout, serverUuid, change));
        markServer(serverUuid, change).catch(fail);
    };
    const [naming, setNaming] = useState<null | { rename?: number; moveServer?: string }>(null);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);

    const toggleFolder = (id: number) =>
        setCollapsed(collapsed.includes(id) ? collapsed.filter((c) => c !== id) : [...collapsed, id]);
    const shiftFolder = (id: number, by: number) => {
        const order = layout.folders.map((f) => f.id);
        const at = order.indexOf(id);
        const to = at + by;
        if (at < 0 || to < 0 || to >= order.length) return;
        order.splice(to, 0, order.splice(at, 1)[0]);
        showLayout({ ...layout, folders: order.map((i) => layout.folders.find((f) => f.id === i)!) });
        reorderFolders(order).catch(fail);
    };

    const organizerFor = (server: Server): RowOrganizer => ({
        starred: !!marks[server.uuid]?.starred,
        onToggleStar: () => mark(server.uuid, { starred: !marks[server.uuid]?.starred }),
        folders: layout.folders,
        folder: marks[server.uuid]?.folder ?? null,
        onMove: (folder) => mark(server.uuid, { folder }),
        onNewFolder: () => setNaming({ moveServer: server.uuid }),
    });

    const row = (server: Server, organize: boolean) => {
        const element = (
            <ServerRow
                server={server}
                stats={stats[server.uuid]}
                onRefresh={() => refresh(server.uuid)}
                organizer={organize ? organizerFor(server) : undefined}
            />
        );

        return organize ? (
            <div
                key={server.uuid}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-stratosphere-server', server.uuid);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(server.uuid);
                }}
                onDragEnd={() => setDragging(null)}
                style={{ opacity: dragging === server.uuid ? 0.5 : 1 }}
            >
                {element}
            </div>
        ) : (
            <div key={server.uuid}>{element}</div>
        );
    };

    const groups = useMemo(
        () => (othersMode ? [] : groupServers(shown, layout, filtering)),
        [shown, layout, filtering, othersMode]
    );

    const total = othersMode ? others.data?.pagination.total : own.data?.length;
    const empty = (
        <div css={tw`bg-white border border-dashed border-neutral-400 rounded-xl py-14 px-6 text-center`}>
            {servers && servers.length > 0 ? (
                <>
                    <p css={tw`text-neutral-100 font-medium`}>No server matches.</p>
                    <button
                        type={'button'}
                        css={tw`mt-2 text-sm text-primary-600 hover:underline`}
                        onClick={() => setFilters(noFilters)}
                    >
                        Clear the search and filters
                    </button>
                </>
            ) : (
                <>
                    <p css={tw`text-neutral-100 font-medium`}>
                        {othersMode ? 'There are no other servers to display.' : 'No servers yet'}
                    </p>
                    {!othersMode && (
                        <p css={tw`text-sm text-neutral-400 mt-1`}>
                            {selfService?.canCreate
                                ? 'Create your first Minecraft server in under a minute.'
                                : 'There are no servers associated with your account.'}
                        </p>
                    )}
                </>
            )}
        </div>
    );

    return (
        <PageContentBlock title={'Dashboard'} showFlashKey={'dashboard'}>
            <Announcements css={tw`mb-6`} />
            <ExtensionSlot name={'dashboard.top'} />
            <div css={tw`flex flex-wrap items-end justify-between gap-4 mb-6`}>
                <div>
                    <h1 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>Your servers</h1>
                    <p css={tw`mt-1 text-neutral-400`}>
                        {servers && total !== undefined
                            ? `${filtering && !othersMode ? `${shown.length} of ${total}` : total} server${
                                  total === 1 ? '' : 's'
                              } ${othersMode ? 'owned by other users' : 'on your account'}`
                            : 'Loading your servers...'}
                    </p>
                </div>
                <div css={tw`flex items-center gap-4`}>
                    {rootAdmin && (
                        <label css={tw`flex items-center text-sm text-neutral-300 cursor-pointer select-none`}>
                            <span css={tw`mr-3`}>{showOnlyAdmin ? "Others' servers" : 'My servers'}</span>
                            <Switch
                                name={'show_all_servers'}
                                defaultChecked={!!showOnlyAdmin}
                                onChange={() => setShowOnlyAdmin(!showOnlyAdmin)}
                            />
                        </label>
                    )}
                    {selfService?.enabled && (
                        <Link to={'/create'} css={tw`no-underline`}>
                            <Button disabled={!selfService.canCreate} type={'button'}>
                                <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                                Create new
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
            {servers && (servers.length > 0 || filtering) && (
                <DashboardToolbar
                    filters={filters}
                    onChange={setFilters}
                    sort={sort}
                    onSort={setSort}
                    nodes={nodes}
                    hasShared={hasShared}
                    canOrganize={!othersMode}
                    onNewFolder={() => setNaming({})}
                />
            )}
            {!servers ? (
                <Spinner centered size={'large'} />
            ) : othersMode ? (
                <Pagination data={{ items: shown, pagination: others.data!.pagination }} onPageSelect={setPage}>
                    {({ items }) =>
                        items.length > 0 ? (
                            <div css={tw`space-y-3`}>{items.map((server) => row(server, false))}</div>
                        ) : (
                            empty
                        )
                    }
                </Pagination>
            ) : shown.length === 0 && (filtering || servers.length === 0) && layout.folders.length === 0 ? (
                empty
            ) : (
                <>
                    {shown.length === 0 && filtering && empty}
                    {(shown.length > 0 || !filtering) &&
                        groups.map((group) => {
                            const id = group.folder?.id ?? null;
                            const at = layout.folders.findIndex((f) => f.id === id);
                            // Without folders the list looks like it always did; with them the loose servers get a header.
                            if (id === null && group.servers.length === 0 && (layout.folders.length > 0 || filtering))
                                return null;

                            return (
                                <FolderSection
                                    key={id ?? 'none'}
                                    folder={group.folder}
                                    count={group.servers.length}
                                    collapsed={id !== null && collapsed.includes(id)}
                                    showHeader={id !== null || layout.folders.length > 0}
                                    emptyHint={
                                        id !== null && !filtering
                                            ? 'Nothing here yet. Drag a server onto the folder or use the folder button of a server.'
                                            : undefined
                                    }
                                    onToggle={() => id !== null && toggleFolder(id)}
                                    onDropServer={(dropped) => {
                                        setDragging(null);
                                        if ((marks[dropped]?.folder ?? null) !== id) mark(dropped, { folder: id });
                                    }}
                                    onRename={id !== null ? () => setNaming({ rename: id }) : undefined}
                                    onDelete={id !== null ? () => setDeleting(id) : undefined}
                                    onMoveUp={at > 0 && !filtering ? () => shiftFolder(id!, -1) : undefined}
                                    onMoveDown={
                                        id !== null && at < layout.folders.length - 1 && !filtering
                                            ? () => shiftFolder(id, 1)
                                            : undefined
                                    }
                                >
                                    {group.servers.map((server) => row(server, true))}
                                </FolderSection>
                            );
                        })}
                </>
            )}

            <FolderNameModal
                visible={naming !== null}
                title={naming?.rename !== undefined ? 'Rename the folder' : 'New folder'}
                action={naming?.rename !== undefined ? 'Rename' : 'Create'}
                initial={
                    naming?.rename !== undefined ? layout.folders.find((f) => f.id === naming.rename)?.name ?? '' : ''
                }
                onDismissed={() => setNaming(null)}
                onSubmit={async (name) => {
                    if (naming?.rename !== undefined) return renameFolder(naming.rename, name);
                    const before = new Set(layout.folders.map((f) => f.id));
                    const created = await createFolder(name);
                    const folder = created.folders.find((f) => !before.has(f.id));
                    // A folder made from the menu of a server takes that server in.
                    if (naming?.moveServer && folder) {
                        showLayout(markServerLocally(created, naming.moveServer, { folder: folder.id }));
                        markServer(naming.moveServer, { folder: folder.id }).catch(fail);
                    }

                    return created;
                }}
            />
            <ConfirmationModal
                visible={deleting !== null}
                title={'Delete this folder?'}
                buttonText={'Delete folder'}
                onConfirmed={() => {
                    if (deleting !== null) deleteFolder(deleting).catch(fail);
                    setDeleting(null);
                }}
                onModalDismissed={() => setDeleting(null)}
            >
                The servers in it are not deleted, they just are not in a folder any more.
            </ConfirmationModal>
        </PageContentBlock>
    );
};
