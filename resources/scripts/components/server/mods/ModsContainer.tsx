import React, { useCallback, useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import { ArrowCircleUpIcon, CheckIcon, DownloadIcon, PuzzleIcon, SearchIcon, TrashIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { runTask } from '@/lib/tasks';
import { ManagedProject } from '@/lib/pterodactylJson';
import {
    MOD_LOADERS,
    ModrinthProject,
    ModrinthVersion,
    PLUGIN_LOADERS,
    ProjectKind,
    searchModrinth,
} from '@/lib/minecraft';
import detectCurrent from '@/components/server/versions/detectCurrent';
import useManagedMods from '@/components/server/mods/useManagedMods';
import installModpack, { ModpackSpec } from '@/components/server/mods/installModpack';
import { InstallModpackModal, ModpackSearch } from '@/components/server/mods/modpack';
import InstallContentModal from '@/components/server/mods/InstallContentModal';
import WorldsPanel from '@/components/server/mods/WorldsPanel';
import useResourcePack from '@/components/server/mods/useResourcePack';
import Switch from '@/components/elements/Switch';

/** What the page can show: the Modrinth project types, plus worlds which come from a link or an upload. */
type Tab = ProjectKind | 'world';

const TABS: { id: Tab; label: string; unit: string }[] = [
    { id: 'plugin', label: 'Plugins', unit: 'plugins' },
    { id: 'mod', label: 'Mods', unit: 'mods' },
    { id: 'datapack', label: 'Datapacks', unit: 'datapacks' },
    { id: 'resourcepack', label: 'Resource packs', unit: 'resource packs' },
    { id: 'world', label: 'Worlds', unit: 'worlds' },
    { id: 'modpack', label: 'Modpacks', unit: 'modpacks' },
];

const compact = (value: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const Segment = ({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) => (
    <button
        type={'button'}
        onClick={onClick}
        className={classNames('px-5 py-2 text-sm font-medium rounded-lg transition-colors duration-150', {
            'bg-primary-600 text-white shadow': active,
            'text-neutral-300 hover:text-neutral-50': !active,
        })}
    >
        {children}
    </button>
);

const Icon = ({ src, size = 14 }: { src: string | null; size?: number }) => (
    <div
        css={tw`flex items-center justify-center flex-shrink-0 rounded-xl bg-neutral-600 overflow-hidden mr-4`}
        style={{ width: size * 4, height: size * 4 }}
    >
        {src ? (
            <img src={src} alt={''} css={tw`w-full h-full object-cover`} />
        ) : (
            <PuzzleIcon css={tw`w-6 h-6 text-neutral-400`} />
        )}
    </div>
);

/** The resource pack the server hands out: what it is, whether players must accept it, and a way to remove it. */
const ResourcePackCard = ({
    state,
    onFlash,
}: {
    state: ReturnType<typeof useResourcePack>;
    onFlash: (type: 'success' | 'error', message: string) => void;
}) => {
    const { pack, loading } = state;
    const [busy, setBusy] = useState(false);

    const run = async (work: () => Promise<void>, done: string) => {
        setBusy(true);
        try {
            await work();
            onFlash('success', done);
        } catch (e) {
            onFlash('error', (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <Spinner size={'large'} centered />;
    if (!pack) {
        return <EmptyState>No resource pack is set. Pick one from the Browse tab.</EmptyState>;
    }

    return (
        <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5`}>
            <div css={tw`flex flex-wrap items-center`}>
                <Icon src={pack.info?.icon || null} size={12} />
                <div css={tw`flex-1 min-w-0 mr-4`}>
                    <p css={tw`text-sm font-semibold text-neutral-50 truncate`}>
                        {pack.info?.title || 'Custom resource pack'}
                    </p>
                    <p css={tw`text-xs text-neutral-400 truncate`}>
                        {pack.info ? `${pack.info.versionNumber} · ` : ''}
                        <span css={tw`font-mono`}>{pack.url}</span>
                    </p>
                </div>
                <Button.Danger
                    variant={Button.Variants.Secondary}
                    size={Button.Sizes.Small}
                    disabled={busy}
                    onClick={() => run(state.remove, 'The resource pack was removed. Restart the server to apply it.')}
                >
                    <TrashIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                    Remove
                </Button.Danger>
            </div>
            <div css={tw`mt-4 pt-4 border-t border-neutral-500 flex items-center justify-between gap-4`}>
                <div>
                    <p css={tw`text-sm font-medium text-neutral-50`}>Require players to install it</p>
                    <p css={tw`text-xs text-neutral-400`}>
                        Players who decline are disconnected. Restart the server to apply.
                    </p>
                </div>
                <Switch
                    name={'require-resource-pack'}
                    readOnly={busy}
                    defaultChecked={pack.required}
                    onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        run(
                            () => state.setRequired(checked),
                            checked ? 'Players are now required to use it.' : 'Players can decline it now.'
                        );
                    }}
                />
            </div>
            <p css={tw`mt-3 text-xs text-neutral-400`}>
                Saved in server.properties as resource-pack, resource-pack-sha1 and require-resource-pack.
            </p>
        </div>
    );
};

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const detectedVersion = ServerContext.useStoreState(
        (state) =>
            state.server.data!.variables.find(
                (v) =>
                    ['MC_VERSION', 'MINECRAFT_VERSION', 'VERSION'].includes(v.envVariable) &&
                    /^\d+\.\d+/.test(v.serverValue || '')
            )?.serverValue || ''
    );
    const { addFlash, clearFlashes } = useFlash();

    const [kind, setKind] = useState<Tab>('plugin');
    const picked = useRef(false);
    const [view, setView] = useState<'browse' | 'installed'>('browse');
    const [query, setQuery] = useState('');
    const [loader, setLoader] = useState('');
    const [version, setVersion] = useState(detectedVersion);
    const [projects, setProjects] = useState<ModrinthProject[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [removing, setRemoving] = useState<ManagedProject | null>(null);
    const [modpack, setModpack] = useState<ModrinthProject | null>(null);
    const [installing, setInstalling] = useState<ModrinthProject | null>(null);
    const request = useRef(0);

    const managed = useManagedMods(uuid, detectedVersion);
    const resourcePack = useResourcePack(uuid);
    const { mods, updates } = managed;
    const installedOfKind = Object.values(mods).filter((m) => m.kind === kind);
    const updatable = installedOfKind.filter((m) => updates[m.projectId]);

    const fetchPage = useCallback(
        (offset: number) => {
            if (kind === 'world') return Promise.resolve();

            const id = ++request.current;
            setLoading(true);

            return searchModrinth({
                kind,
                query,
                loader: loader || undefined,
                version: version.trim() || undefined,
                offset,
            })
                .then((result) => {
                    if (id !== request.current) return;

                    setProjects((current) => (offset ? current.concat(result.hits) : result.hits));
                    setTotal(result.total_hits);
                })
                .catch((error) => {
                    clearFlashes('mods');
                    addFlash({ key: 'mods', type: 'error', message: error.message });
                })
                .then(() => id === request.current && setLoading(false));
        },
        [kind, query, loader, version]
    );

    useEffect(() => {
        if (kind === 'modpack' || kind === 'world' || view !== 'browse') return;

        const timeout = setTimeout(() => fetchPage(0), 350);

        return () => clearTimeout(timeout);
    }, [fetchPage, view, kind]);

    useEffect(() => setLoader(''), [kind]);

    // Choose Mods or Plugins from the software the server runs; a manual choice always wins.
    useEffect(() => {
        let cancelled = false;
        detectCurrent(uuid, null)
            .then((current) => {
                if (cancelled || picked.current || !current.type) return;
                if (['FABRIC', 'QUILT', 'FORGE', 'NEOFORGE'].includes(current.type)) setKind('mod');
                else if (current.type !== 'VANILLA') setKind('plugin');
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [uuid]);
    useEffect(() => {
        if (kind === 'modpack' || kind === 'world') setView('browse');
    }, [kind]);

    /** Runs one action on a project and shows what happened. */
    const act = async (project: { id: string; title: string }, work: () => Promise<string>) => {
        setBusy(project.id);
        clearFlashes('mods');
        try {
            addFlash({ key: 'mods', type: 'success', message: await work() });
        } catch (error) {
            addFlash({
                key: 'mods',
                type: 'error',
                message: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message,
            });
        } finally {
            setBusy(null);
        }
    };

    /** Called by the modal once a version was chosen and confirmed. */
    const confirmInstall = async (version: ModrinthVersion, options: { required: boolean }) => {
        const project = installing;
        if (!project || kind === 'world' || kind === 'modpack') return;

        await act({ id: project.project_id, title: project.title }, async () => {
            if (kind === 'resourcepack') {
                await resourcePack.apply(project, version, options.required);

                return `${project.title} is now the resource pack of the server${
                    options.required ? ' and players are required to use it' : ''
                }. Restart the server to hand it out.`;
            }

            const record = await managed.install(
                project,
                kind,
                version,
                version.game_versions.includes(detectedVersion) ? detectedVersion : null
            );

            return kind === 'datapack'
                ? `${project.title} ${record.versionNumber} was added to ${record.directory}. Restart the server or run /reload to load it.`
                : `${project.title} ${record.versionNumber} was downloaded to ${record.directory}. Restart the server to load it.`;
        });
        setInstalling(null);
    };

    const update = (record: ManagedProject) =>
        act({ id: record.projectId, title: record.title }, async () => {
            await managed.update(record.projectId);

            return `${record.title} was updated. Restart the server to load the new version.`;
        });

    const uninstall = async () => {
        const record = removing;
        setRemoving(null);
        if (!record) return;

        await act({ id: record.projectId, title: record.title }, async () => {
            await managed.uninstall(record.projectId);

            return `${record.title} was removed. Restart the server for it to unload.`;
        });
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
                    : 'None of the existing files were found on Modrinth.',
            });
        } catch (error) {
            managed.refresh();
            addFlash({
                key: 'mods',
                type: 'error',
                message: 'The files could not be read. ' + ((error as Error).message || ''),
            });
        }
    };

    const startModpack = (spec: ModpackSpec) => {
        setModpack(null);
        addFlash({
            key: 'mods',
            type: 'info',
            message: `Installing ${spec.title} in the background, follow it in the task menu at the bottom right.`,
        });
        runTask('modpack', `Installing ${spec.title}`, (report) =>
            installModpack({ uuid, status, instance, spec, report })
        );
    };

    const loaders = kind === 'plugin' ? PLUGIN_LOADERS : MOD_LOADERS;
    const tab = TABS.find((t) => t.id === kind)!;
    const unit = tab.unit;
    const usesLoader = kind === 'plugin' || kind === 'mod';

    const ProjectButtons = ({
        id,
        record,
        project,
    }: {
        id: string;
        record?: ManagedProject;
        project?: ModrinthProject;
    }) => {
        const pending = busy === id;
        const upgrade = updates[id];
        const inUse = kind === 'resourcepack' && resourcePack.pack?.info?.projectId === id;

        if (record) {
            return (
                <div css={tw`flex items-center gap-2`}>
                    {upgrade && (
                        <Button size={Button.Sizes.Small} disabled={!!busy} onClick={() => update(record)}>
                            <ArrowCircleUpIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                            {pending ? 'Updating...' : `Update to ${upgrade.versionNumber}`}
                        </Button>
                    )}
                    <Button.Danger
                        variant={Button.Variants.Secondary}
                        size={Button.Sizes.Small}
                        disabled={!!busy}
                        onClick={() => setRemoving(record)}
                    >
                        <TrashIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                        Uninstall
                    </Button.Danger>
                </div>
            );
        }

        if (inUse) {
            return (
                <span css={tw`inline-flex items-center text-xs text-green-700`}>
                    <CheckIcon css={tw`w-4 h-4 mr-1`} />
                    In use
                </span>
            );
        }

        return (
            <Button size={Button.Sizes.Small} disabled={!!busy} onClick={() => project && setInstalling(project)}>
                <DownloadIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                {pending ? 'Installing...' : kind === 'resourcepack' ? 'Use pack' : 'Install'}
            </Button>
        );
    };

    return (
        <ServerContentBlock title={'Content'}>
            <PageHeader
                title={'Content'}
                subtitle={
                    kind === 'world'
                        ? `Worlds on ${serverName}`
                        : `Browse Modrinth and install ${unit} on ${serverName}`
                }
            />
            <FlashMessageRender byKey={'mods'} css={tw`mb-4`} />

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                <div css={tw`flex flex-wrap items-center gap-3`}>
                    <div css={tw`inline-flex flex-wrap p-1 bg-neutral-600 rounded-xl`}>
                        {TABS.map((t) => (
                            <Segment
                                key={t.id}
                                active={kind === t.id}
                                onClick={() => {
                                    picked.current = true;
                                    setKind(t.id);
                                }}
                            >
                                {t.label}
                            </Segment>
                        ))}
                    </div>
                    {kind !== 'modpack' && kind !== 'world' && (
                        <>
                            <div css={tw`inline-flex p-1 bg-neutral-600 rounded-xl`}>
                                <Segment active={view === 'browse'} onClick={() => setView('browse')}>
                                    Browse
                                </Segment>
                                <Segment active={view === 'installed'} onClick={() => setView('installed')}>
                                    {kind === 'resourcepack' ? 'In use' : `Installed (${installedOfKind.length})`}
                                    {updatable.length > 0 && (
                                        <span css={tw`ml-2 rounded-full bg-primary-600 text-white px-1.5 text-2xs`}>
                                            {updatable.length}
                                        </span>
                                    )}
                                </Segment>
                            </div>
                            {view === 'browse' && (
                                <>
                                    <div css={tw`relative flex-1 min-w-[12rem]`}>
                                        <SearchIcon
                                            css={tw`absolute left-4 top-0 bottom-0 my-auto w-5 h-5 text-neutral-400`}
                                        />
                                        <Input
                                            type={'text'}
                                            value={query}
                                            placeholder={`Search ${unit}...`}
                                            style={{ paddingLeft: '3rem' }}
                                            onChange={(e) => setQuery(e.currentTarget.value)}
                                        />
                                    </div>
                                    {usesLoader && (
                                        <div css={tw`w-40`}>
                                            <Select value={loader} onChange={(e) => setLoader(e.currentTarget.value)}>
                                                <option value={''}>
                                                    {kind === 'plugin' ? 'Any platform' : 'Any loader'}
                                                </option>
                                                {loaders.map((l) => (
                                                    <option key={l} value={l}>
                                                        {l.charAt(0).toUpperCase() + l.slice(1)}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>
                                    )}
                                    <div css={tw`w-36`}>
                                        <Input
                                            type={'text'}
                                            value={version}
                                            placeholder={'Version (1.21.4)'}
                                            onChange={(e) => setVersion(e.currentTarget.value)}
                                        />
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {kind === 'world' ? (
                <WorldsPanel />
            ) : kind === 'modpack' ? (
                <ModpackSearch actionLabel={'Install'} onPick={setModpack} />
            ) : kind === 'resourcepack' && view === 'installed' ? (
                <ResourcePackCard
                    state={resourcePack}
                    onFlash={(type, message) => addFlash({ key: 'mods', type, message })}
                />
            ) : view === 'installed' ? (
                <>
                    {managed.untracked.length > 0 && (
                        <div
                            css={tw`flex flex-wrap items-center justify-between gap-3 bg-primary-50 border border-primary-200 rounded-xl px-5 py-4 mb-4`}
                        >
                            <p css={tw`text-sm text-primary-900`}>
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
                        <EmptyState>Nothing installed yet. Install {unit} from the Browse tab.</EmptyState>
                    ) : (
                        installedOfKind.map((record) => (
                            <div
                                key={record.projectId}
                                css={tw`flex flex-wrap items-center bg-white border border-neutral-500 rounded-xl shadow-md p-4 mb-3`}
                            >
                                <Icon src={record.icon} size={12} />
                                <div css={tw`flex-1 min-w-0 mr-4`}>
                                    <p css={tw`text-sm font-semibold text-neutral-50 truncate`}>{record.title}</p>
                                    <p css={tw`text-xs text-neutral-400 truncate`}>
                                        {record.versionNumber} &middot; <span css={tw`font-mono`}>{record.file}</span>
                                    </p>
                                </div>
                                {updates[record.projectId] ? (
                                    <span
                                        css={tw`mr-3 rounded-full bg-primary-50 text-primary-700 px-3 py-1 text-xs font-medium`}
                                    >
                                        Update available
                                    </span>
                                ) : (
                                    <span css={tw`mr-3 inline-flex items-center text-xs text-green-700`}>
                                        <CheckIcon css={tw`w-4 h-4 mr-1`} />
                                        Up to date
                                    </span>
                                )}
                                <ProjectButtons id={record.projectId} record={record} />
                            </div>
                        ))
                    )}
                </>
            ) : loading && projects.length === 0 ? (
                <Spinner size={'large'} centered />
            ) : projects.length === 0 ? (
                <EmptyState>No results. Try a different search or remove the version filter.</EmptyState>
            ) : (
                <>
                    <div css={tw`grid gap-4 md:grid-cols-2`}>
                        {projects.map((project) => {
                            const record = mods[project.project_id];

                            return (
                                <div
                                    key={project.project_id}
                                    css={tw`flex items-start bg-white border border-neutral-500 rounded-xl shadow-md p-5`}
                                >
                                    <Icon src={project.icon_url} />
                                    <div css={tw`flex-1 min-w-0`}>
                                        <div css={tw`flex items-baseline`}>
                                            <h3 css={tw`text-base font-semibold text-neutral-50 truncate`}>
                                                {project.title}
                                            </h3>
                                            <span css={tw`ml-2 text-xs text-neutral-400 truncate`}>
                                                by {project.author}
                                            </span>
                                        </div>
                                        <p css={tw`mt-1 text-sm text-neutral-400 line-clamp-2`}>
                                            {project.description}
                                        </p>
                                        <div css={tw`mt-3 flex items-center justify-between gap-2`}>
                                            <span css={tw`text-xs text-neutral-400 inline-flex items-center`}>
                                                {record ? (
                                                    <span
                                                        css={tw`rounded-full bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 font-medium`}
                                                    >
                                                        Installed {record.versionNumber}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <DownloadIcon css={tw`w-4 h-4 mr-1`} />
                                                        {compact(project.downloads)}
                                                    </>
                                                )}
                                            </span>
                                            <ProjectButtons id={project.project_id} record={record} project={project} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {projects.length < total && (
                        <div css={tw`flex justify-center mt-6`}>
                            <Button.Text disabled={loading} onClick={() => fetchPage(projects.length)}>
                                {loading ? 'Loading...' : 'Load more'}
                            </Button.Text>
                        </div>
                    )}
                </>
            )}

            <Dialog.Confirm
                open={!!removing}
                onClose={() => setRemoving(null)}
                title={`Uninstall ${removing?.title}?`}
                confirm={'Uninstall'}
                onConfirmed={uninstall}
            >
                <span css={tw`font-mono`}>{removing?.file}</span> will be deleted from the server. Other mods or plugins
                that need it may stop working.
            </Dialog.Confirm>

            <InstallContentModal
                project={installing}
                kind={kind === 'world' ? 'mod' : kind}
                loader={loader || undefined}
                gameVersion={version.trim() || detectedVersion}
                confirmLabel={kind === 'resourcepack' ? 'Use this pack' : 'Install'}
                allowRequire={kind === 'resourcepack'}
                replaces={kind === 'resourcepack' && !!resourcePack.pack}
                busy={!!busy}
                onClose={() => setInstalling(null)}
                onConfirm={confirmInstall}
            />
            <InstallModpackModal project={modpack} onClose={() => setModpack(null)} onInstall={startModpack} />
        </ServerContentBlock>
    );
};
