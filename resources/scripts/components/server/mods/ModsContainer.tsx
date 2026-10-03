import React, { useCallback, useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import { CheckIcon, DownloadIcon, SearchIcon, PuzzleIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import pullFile from '@/api/server/files/pullFile';
import createDirectory from '@/api/server/files/createDirectory';
import { httpErrorToHuman } from '@/api/http';
import {
    findDownload,
    ModrinthProject,
    MOD_LOADERS,
    PLUGIN_LOADERS,
    ProjectKind,
    searchModrinth,
} from '@/lib/minecraft';

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

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
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
    const [query, setQuery] = useState('');
    const [loader, setLoader] = useState('');
    const [version, setVersion] = useState(detectedVersion);
    const [projects, setProjects] = useState<ModrinthProject[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [installing, setInstalling] = useState<string | null>(null);
    const [installed, setInstalled] = useState<Record<string, string>>({});
    const request = useRef(0);

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
        const timeout = setTimeout(() => fetchPage(0), 350);

        return () => clearTimeout(timeout);
    }, [fetchPage]);

    useEffect(() => setLoader(''), [kind]);

    const install = async (project: ModrinthProject) => {
        setInstalling(project.project_id);
        clearFlashes('mods');
        const directory = kind === 'plugin' ? '/plugins' : '/mods';

        try {
            const { file, versionNumber } = await findDownload({
                projectId: project.project_id,
                kind,
                loader: loader || undefined,
                version: version.trim() || undefined,
            });

            // The folder will not exist on a fresh server, creating it when it does is harmless.
            await createDirectory(uuid, '/', directory.slice(1)).catch(() => undefined);
            await pullFile(uuid, file.url, directory, file.filename);

            setInstalled((current) => ({ ...current, [project.project_id]: versionNumber }));
            addFlash({
                key: 'mods',
                type: 'success',
                message: `${project.title} ${versionNumber} was downloaded to ${directory}. Restart the server to load it.`,
            });
        } catch (error) {
            addFlash({
                key: 'mods',
                type: 'error',
                message: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message,
            });
        } finally {
            setInstalling(null);
        }
    };

    const loaders = kind === 'plugin' ? PLUGIN_LOADERS : MOD_LOADERS;

    return (
        <ServerContentBlock title={'Mods & Plugins'}>
            <PageHeader
                title={'Mods & Plugins'}
                subtitle={`Browse Modrinth and install ${kind === 'plugin' ? 'plugins' : 'mods'} on ${serverName}`}
            />
            <FlashMessageRender byKey={'mods'} css={tw`mb-4`} />
            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                <div css={tw`flex flex-wrap items-center gap-3`}>
                    <div css={tw`inline-flex p-1 bg-neutral-600 rounded-xl`}>
                        <Segment active={kind === 'plugin'} onClick={() => setKind('plugin')}>
                            Plugins
                        </Segment>
                        <Segment active={kind === 'mod'} onClick={() => setKind('mod')}>
                            Mods
                        </Segment>
                    </div>
                    <div css={tw`relative flex-1 min-w-[12rem]`}>
                        <SearchIcon css={tw`absolute left-4 top-0 bottom-0 my-auto w-5 h-5 text-neutral-400`} />
                        <Input
                            type={'text'}
                            value={query}
                            placeholder={`Search ${kind === 'plugin' ? 'plugins' : 'mods'}...`}
                            style={{ paddingLeft: '3rem' }}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                        />
                    </div>
                    <div css={tw`w-40`}>
                        <Select value={loader} onChange={(e) => setLoader(e.currentTarget.value)}>
                            <option value={''}>{kind === 'plugin' ? 'Any platform' : 'Any loader'}</option>
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
                </div>
            </div>
            {loading && projects.length === 0 ? (
                <Spinner size={'large'} centered />
            ) : projects.length === 0 ? (
                <EmptyState>No results. Try a different search or remove the version filter.</EmptyState>
            ) : (
                <>
                    <div css={tw`grid gap-4 md:grid-cols-2`}>
                        {projects.map((project) => (
                            <div
                                key={project.project_id}
                                css={tw`flex items-start bg-white border border-neutral-500 rounded-xl shadow-md p-5`}
                            >
                                <div
                                    css={tw`flex items-center justify-center flex-shrink-0 w-14 h-14 rounded-xl bg-neutral-600 overflow-hidden mr-4`}
                                >
                                    {project.icon_url ? (
                                        <img src={project.icon_url} alt={''} css={tw`w-full h-full object-cover`} />
                                    ) : (
                                        <PuzzleIcon css={tw`w-6 h-6 text-neutral-400`} />
                                    )}
                                </div>
                                <div css={tw`flex-1 min-w-0`}>
                                    <div css={tw`flex items-baseline`}>
                                        <h3 css={tw`text-base font-semibold text-neutral-50 truncate`}>
                                            {project.title}
                                        </h3>
                                        <span css={tw`ml-2 text-xs text-neutral-400 truncate`}>
                                            by {project.author}
                                        </span>
                                    </div>
                                    <p css={tw`mt-1 text-sm text-neutral-400 line-clamp-2`}>{project.description}</p>
                                    <div css={tw`mt-3 flex items-center justify-between`}>
                                        <span css={tw`text-xs text-neutral-400 inline-flex items-center`}>
                                            <DownloadIcon css={tw`w-4 h-4 mr-1`} />
                                            {compact(project.downloads)}
                                        </span>
                                        {installed[project.project_id] ? (
                                            <span
                                                css={tw`inline-flex items-center text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5`}
                                            >
                                                <CheckIcon css={tw`w-4 h-4 mr-1.5`} />
                                                Installed
                                            </span>
                                        ) : (
                                            <Button
                                                size={Button.Sizes.Small}
                                                disabled={installing !== null}
                                                onClick={() => install(project)}
                                            >
                                                <DownloadIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                                                {installing === project.project_id ? 'Installing...' : 'Install'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
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
        </ServerContentBlock>
    );
};
