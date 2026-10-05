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
import { MOD_LOADERS, ModrinthProject, PLUGIN_LOADERS, ProjectKind, searchModrinth } from '@/lib/minecraft';
import detectCurrent from '@/components/server/versions/detectCurrent';
import useManagedMods from '@/components/server/mods/useManagedMods';
import installModpack, { ModpackSpec } from '@/components/server/mods/installModpack';
import { InstallModpackModal, ModpackSearch } from '@/components/server/mods/modpack';

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

    const [kind, setKind] = useState<ProjectKind>('plugin');
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
    const request = useRef(0);

    const managed = useManagedMods(uuid, detectedVersion);
    const { mods, updates } = managed;
    const installedOfKind = Object.values(mods).filter((m) => m.kind === kind);
    const updatable = installedOfKind.filter((m) => updates[m.projectId]);

    const fetchPage = useCallback(
        (offset: number) => {
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
        if (kind === 'modpack' || view !== 'browse') return;

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
        if (kind === 'modpack') setView('browse');
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

    const install = (project: ModrinthProject) =>
        act({ id: project.project_id, title: project.title }, async () => {
            const record = await managed.install(project, kind as 'mod' | 'plugin', {
                loader: loader || undefined,
                version: version.trim() || undefined,
            });

            return `${project.title} ${record.versionNumber} was downloaded to ${record.directory}. Restart the server to load it.`;
        });

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
    const unit = kind === 'plugin' ? 'plugins' : 'mods';

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

        return (
            <Button size={Button.Sizes.Small} disabled={!!busy} onClick={() => project && install(project)}>
                <DownloadIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                {pending ? 'Installing...' : 'Install'}
            </Button>
        );
    };

    return (
        <ServerContentBlock title={'Mods & Plugins'}>
            <PageHeader
                title={'Mods & Plugins'}
                subtitle={`Browse Modrinth and install ${kind === 'modpack' ? 'modpacks' : unit} on ${serverName}`}
            />
            <FlashMessageRender byKey={'mods'} css={tw`mb-4`} />

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                <div css={tw`flex flex-wrap items-center gap-3`}>
                    <div css={tw`inline-flex p-1 bg-neutral-600 rounded-xl`}>
                        <Segment
                            active={kind === 'plugin'}
                            onClick={() => {
                                picked.current = true;
                                setKind('plugin');
                            }}
                        >
                            Plugins
                        </Segment>
                        <Segment
                            active={kind === 'mod'}
                            onClick={() => {
                                picked.current = true;
                                setKind('mod');
                            }}
                        >
                            Mods
                        </Segment>
                        <Segment
                            active={kind === 'modpack'}
                            onClick={() => {
                                picked.current = true;
                                setKind('modpack');
                            }}
                        >
                            Modpacks
                        </Segment>
                    </div>
                    {kind !== 'modpack' && (
                        <>
                            <div css={tw`inline-flex p-1 bg-neutral-600 rounded-xl`}>
                                <Segment active={view === 'browse'} onClick={() => setView('browse')}>
                                    Browse
                                </Segment>
                                <Segment active={view === 'installed'} onClick={() => setView('installed')}>
                                    Installed ({installedOfKind.length})
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

            {kind === 'modpack' ? (
                <ModpackSearch actionLabel={'Install'} onPick={setModpack} />
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

            <InstallModpackModal project={modpack} onClose={() => setModpack(null)} onInstall={startModpack} />
        </ServerContentBlock>
    );
};
