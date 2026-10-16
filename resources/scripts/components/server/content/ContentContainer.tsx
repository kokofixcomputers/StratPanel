import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import classNames from 'classnames';
import { AdjustmentsIcon, ArrowCircleUpIcon, CheckIcon, TrashIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { SearchHit, SortIndex } from '@/lib/modrinth';
import { browsesKind, hasKind, loadTags, searchContent, sortsFor, sourceLabel } from '@/lib/contentSource';
import { isCurseForgeId } from '@/lib/curseforge';
import SourceSwitch from '@/components/server/content/SourceSwitch';
import useCurseForgeEnabled from '@/components/server/content/useCurseForgeEnabled';
import detectCurrent from '@/components/server/versions/detectCurrent';
import WorldsPanel from '@/components/server/mods/WorldsPanel';
import ContentFilters, { activeFilters } from '@/components/server/content/ContentFilters';
import Pagination from '@/components/server/content/Pagination';
import ProjectCard from '@/components/server/content/ProjectCard';
import ProjectIcon from '@/components/server/content/ProjectIcon';
import ResourcePackCard from '@/components/server/content/ResourcePackCard';
import useContentActions from '@/components/server/content/useContentActions';
import useContentQuery, { ContentKind, KINDS } from '@/components/server/content/useContentQuery';
import { ProjectKind } from '@/lib/minecraft';

const PAGE_SIZE = 20;

const MOD_LOADERS = ['FABRIC', 'QUILT', 'FORGE', 'NEOFORGE'];
// The platforms of proxies are what their plugins are filed under on Modrinth.
const PROXY_LOADERS: Record<string, string> = {
    VELOCITY: 'velocity',
    BUNGEECORD: 'bungeecord',
    WATERFALL: 'waterfall',
};

const Pill = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button
        type={'button'}
        aria-pressed={active}
        onClick={onClick}
        className={classNames('rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150', {
            'bg-primary-600 text-white shadow': active,
            'text-neutral-300 hover:text-neutral-50': !active,
        })}
    >
        {children}
    </button>
);

/** Browse Modrinth or CurseForge in the panel and manage what is installed: results with numbered pages, the filters are in the sidebar. */
export default () => {
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const { addFlash, clearFlashes } = useFlash();

    const curseForge = useCurseForgeEnabled();
    const actions = useContentActions();
    const { managed, resourcePack, busy, detectedVersion } = actions;
    const { query, update, search } = useContentQuery(detectedVersion);
    const { kind, source } = query;
    // Worlds on Modrinth are put in from a link, on CurseForge they are browsed like the rest.
    const worldsPanel = kind === 'world' && !browsesKind(source, kind);

    const [results, setResults] = useState<{ kind: ContentKind; hits: SearchHit[]; total: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [icons, setIcons] = useState<Record<string, string>>({});
    const [labels, setLabels] = useState<Record<string, string>>({});
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Start on what the server runs: mods and their loader for Fabric and the like, the proxy's platform for plugins of a
    // proxy. Only when the address says nothing about it yet, whatever was picked stays.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).has('t')) return;

        let cancelled = false;
        detectCurrent(uuid, null)
            .then((current) => {
                if (cancelled || !current.type) return;
                const params = new URLSearchParams(window.location.search);
                if (params.has('t') || params.has('l')) return;

                if (MOD_LOADERS.includes(current.type)) update({ kind: 'mod', loader: current.type.toLowerCase() });
                else if (PROXY_LOADERS[current.type]) update({ loader: PROXY_LOADERS[current.type] });
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [uuid]);

    useEffect(() => {
        setIcons({});
        setLabels({});
        loadTags(source)
            .then(({ categories }) => {
                // The same name can be a different category for another kind of project (CurseForge has "adventure" for
                // mods and for worlds), so only the ones of what is shown count.
                const own = categories.filter((tag) => tag.project_type === kind);
                setIcons(Object.fromEntries(own.map((tag) => [tag.name, tag.icon])));
                setLabels(Object.fromEntries(own.filter((tag) => tag.label).map((tag) => [tag.name, tag.label!])));
            })
            .catch(() => undefined);
    }, [source, kind]);

    // The results follow the filters. A search that is overtaken by a newer one is cancelled.
    const key = JSON.stringify([
        source,
        kind,
        query.query,
        query.categories,
        query.loader,
        query.version,
        query.serverSide,
        query.sort,
        query.page,
    ]);
    useEffect(() => {
        if (worldsPanel || query.view !== 'browse') return;

        const controller = new AbortController();
        setLoading(true);
        setError('');
        searchContent(
            source,
            {
                kind: kind as ProjectKind,
                query: query.query,
                categories: query.categories,
                loader: query.loader || undefined,
                version: query.version || undefined,
                serverSide: query.serverSide,
                sort: query.sort,
                page: query.page,
                pageSize: PAGE_SIZE,
            },
            controller.signal
        )
            .then((result) => {
                setResults({ kind, hits: result.hits, total: result.total });
                setLoading(false);
            })
            .catch((e) => {
                if (e.name === 'AbortError') return;
                setError(e.message);
                setLoading(false);
            });

        return () => controller.abort();
    }, [key, query.view]);

    const tab = KINDS.find((k) => k.id === kind)!;
    const installedOfKind = Object.values(managed.mods).filter((m) => m.kind === kind);
    const updatable = installedOfKind.filter((m) => managed.updates[m.projectId]);
    const hasInstalledView = kind !== 'modpack' && !worldsPanel && !(kind === 'world' && source === 'curseforge');
    const view = hasInstalledView ? query.view : 'browse';
    const current = results && results.kind === kind ? results : null;
    const pages = current ? Math.ceil(current.total / PAGE_SIZE) : 0;
    const filterCount = activeFilters(query, detectedVersion);

    const detail = (slug: string) => ({
        pathname: `/server/${id}/mods/project/${slug}`,
        search,
        state: { fromList: true },
    });

    const changePage = (page: number) => {
        update({ page }, 'push');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const detect = async () => {
        clearFlashes('mods');
        try {
            const found = await managed.detectExisting();
            addFlash({
                key: 'mods',
                type: found ? 'success' : 'info',
                message: found
                    ? `Recognised ${found} existing file${
                          found === 1 ? '' : 's'
                      }, they can now be updated or uninstalled here.`
                    : `None of the existing files were found on ${curseForge ? 'Modrinth or CurseForge' : 'Modrinth'}.`,
            });
        } catch (e) {
            managed.refresh();
            addFlash({
                key: 'mods',
                type: 'error',
                message: 'The files could not be read. ' + ((e as Error).message || ''),
            });
        }
    };

    return (
        <ServerContentBlock title={'Content'}>
            <PageHeader
                title={'Content'}
                subtitle={
                    worldsPanel
                        ? `Worlds on ${serverName}`
                        : `Browse ${sourceLabel(source)} and install ${tab.unit} on ${serverName}`
                }
            />
            <FlashMessageRender byKey={'mods'} className={'mb-4'} />

            <div
                className={classNames(
                    'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white p-3 shadow-md',
                    // Without the pills and the toggle there is nothing in it on wide screens.
                    { 'lg:hidden': !hasInstalledView }
                )}
            >
                {/* The sidebar has them on wide screens, narrow ones have no sidebar. */}
                <SourceSwitch className={'lg:hidden'} />
                <div className={'inline-flex flex-wrap rounded-xl bg-neutral-600 p-1 lg:hidden'}>
                    {KINDS.filter((k) => hasKind(source, k.id)).map((k) => (
                        <Pill
                            key={k.id}
                            active={kind === k.id}
                            onClick={() => update({ kind: k.id, view: 'browse' }, 'push')}
                        >
                            {k.label}
                        </Pill>
                    ))}
                </div>
                {hasInstalledView && (
                    <div className={'inline-flex rounded-xl bg-neutral-600 p-1'}>
                        <Pill active={view === 'browse'} onClick={() => update({ view: 'browse' }, 'push')}>
                            Browse
                        </Pill>
                        <Pill active={view === 'installed'} onClick={() => update({ view: 'installed' }, 'push')}>
                            {kind === 'resourcepack' ? 'In use' : `Installed (${installedOfKind.length})`}
                            {updatable.length > 0 && (
                                <span className={'ml-2 rounded-full bg-primary-600 px-1.5 text-2xs text-white'}>
                                    {updatable.length}
                                </span>
                            )}
                        </Pill>
                    </div>
                )}
                {!worldsPanel && view === 'browse' && (
                    <button
                        type={'button'}
                        onClick={() => setFiltersOpen((open) => !open)}
                        aria-expanded={filtersOpen}
                        className={
                            'inline-flex items-center rounded-lg border border-neutral-500 px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600 lg:hidden'
                        }
                    >
                        <AdjustmentsIcon className={'mr-2 h-5 w-5'} />
                        Search and filters
                        {filterCount > 0 && (
                            <span className={'ml-2 rounded-full bg-primary-600 px-1.5 text-2xs text-white'}>
                                {filterCount}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {filtersOpen && !worldsPanel && view === 'browse' && (
                <div className={'mb-4 rounded-xl border border-neutral-500 bg-white p-3 shadow-md lg:hidden'}>
                    <ContentFilters />
                </div>
            )}

            {worldsPanel ? (
                <WorldsPanel />
            ) : kind === 'resourcepack' && view === 'installed' ? (
                <ResourcePackCard
                    state={resourcePack}
                    onFlash={(type, message) => addFlash({ key: 'mods', type, message })}
                />
            ) : view === 'installed' ? (
                <>
                    {managed.untracked.length > 0 && (
                        <div
                            className={
                                'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-5 py-4'
                            }
                        >
                            <p className={'text-sm text-primary-900'}>
                                {managed.scan
                                    ? `Checking files ${managed.scan.done}/${managed.scan.total}...`
                                    : `${managed.untracked.length} file${
                                          managed.untracked.length === 1 ? '' : 's'
                                      } in mods/plugins ${
                                          managed.untracked.length === 1 ? 'was' : 'were'
                                      } not installed from here. Detect them to manage them too.`}
                            </p>
                            <Button.Text disabled={!!managed.scan} onClick={detect}>
                                {managed.scan ? 'Checking...' : 'Detect existing'}
                            </Button.Text>
                        </div>
                    )}
                    {managed.loading ? (
                        <Spinner size={'large'} centered />
                    ) : installedOfKind.length === 0 ? (
                        <EmptyState>Nothing installed yet. Install {tab.unit} from Browse.</EmptyState>
                    ) : (
                        <div className={'space-y-3'}>
                            {installedOfKind.map((record) => {
                                const upgrade = managed.updates[record.projectId];
                                const pending = busy === record.projectId;

                                return (
                                    <div
                                        key={record.projectId}
                                        className={
                                            'flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white p-4 shadow-md'
                                        }
                                    >
                                        <Link
                                            to={{
                                                pathname: `/server/${id}/mods/project/${record.slug}`,
                                                search: `?t=${record.kind}${
                                                    isCurseForgeId(record.projectId) ? '&s=curseforge' : ''
                                                }`,
                                            }}
                                            className={'flex min-w-0 flex-1 basis-64 items-center gap-4 no-underline'}
                                        >
                                            <ProjectIcon src={record.icon} size={48} />
                                            <div className={'min-w-0'}>
                                                <p className={'truncate text-sm font-semibold text-neutral-50'}>
                                                    {record.title}
                                                </p>
                                                <p className={'truncate text-xs text-neutral-400'}>
                                                    {record.versionNumber} &middot;{' '}
                                                    <span className={'font-mono'}>{record.file}</span>
                                                    {record.dependencyOf && ' · installed as a dependency'}
                                                </p>
                                            </div>
                                        </Link>
                                        {upgrade ? (
                                            <span
                                                className={
                                                    'rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700'
                                                }
                                            >
                                                Update available
                                            </span>
                                        ) : (
                                            <span className={'inline-flex items-center text-xs text-green-700'}>
                                                <CheckIcon className={'mr-1 h-4 w-4'} />
                                                Up to date
                                            </span>
                                        )}
                                        <div className={'flex items-center gap-2'}>
                                            {upgrade && (
                                                <Button
                                                    size={Button.Sizes.Small}
                                                    disabled={!!busy}
                                                    onClick={() => actions.update(record)}
                                                >
                                                    <ArrowCircleUpIcon className={'mr-1.5 -ml-1 h-4 w-4'} />
                                                    {pending ? 'Updating...' : `Update to ${upgrade.versionNumber}`}
                                                </Button>
                                            )}
                                            <Button.Danger
                                                variant={Button.Variants.Secondary}
                                                size={Button.Sizes.Small}
                                                disabled={!!busy}
                                                onClick={() => actions.askUninstall(record)}
                                            >
                                                <TrashIcon className={'mr-1.5 -ml-1 h-4 w-4'} />
                                                Uninstall
                                            </Button.Danger>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : error ? (
                <p className={'text-sm text-red-600'}>{error}</p>
            ) : !current ? (
                <Spinner size={'large'} centered />
            ) : (
                <>
                    <div className={'mb-3 flex flex-wrap items-center justify-between gap-3'}>
                        <p className={'text-sm text-neutral-300'} aria-live={'polite'}>
                            {current.total === 0
                                ? 'No results'
                                : `${(query.page - 1) * PAGE_SIZE + 1}-${Math.min(
                                      query.page * PAGE_SIZE,
                                      current.total
                                  )} of ${current.total.toLocaleString()} ${tab.unit}`}
                        </p>
                        <div className={'flex items-center gap-2'}>
                            <label htmlFor={'content-sort'} className={'text-sm text-neutral-300'}>
                                Sort by
                            </label>
                            <div className={'w-44'}>
                                <Select
                                    id={'content-sort'}
                                    value={query.sort}
                                    onChange={(e) => update({ sort: e.currentTarget.value as SortIndex })}
                                >
                                    {sortsFor(source).map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.label}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </div>
                    {current.hits.length === 0 ? (
                        <EmptyState>
                            Nothing matches. Try other words, remove a tag, or choose another Minecraft version.
                        </EmptyState>
                    ) : (
                        <div
                            className={classNames('space-y-3 transition-opacity duration-150', {
                                'opacity-50': loading,
                            })}
                        >
                            {current.hits.map((hit) => (
                                <ProjectCard
                                    key={hit.project_id}
                                    hit={hit}
                                    to={detail(hit.slug)}
                                    icons={icons}
                                    labels={labels}
                                    record={managed.mods[hit.project_id]}
                                    inUse={
                                        kind === 'resourcepack' && resourcePack.pack?.info?.projectId === hit.project_id
                                    }
                                    update={managed.updates[hit.project_id]?.versionNumber}
                                    busy={!!busy}
                                    actionLabel={
                                        kind === 'resourcepack'
                                            ? 'Use pack'
                                            : kind === 'world'
                                            ? 'Install world'
                                            : 'Install'
                                    }
                                    onInstall={() =>
                                        kind === 'world'
                                            ? actions.installWorld(hit)
                                            : actions.install(hit, current.kind as ProjectKind)
                                    }
                                />
                            ))}
                        </div>
                    )}
                    <div className={'mt-6'}>
                        <Pagination page={query.page} pages={pages} onChange={changePage} />
                    </div>
                </>
            )}

            {actions.dialogs}
        </ServerContentBlock>
    );
};
