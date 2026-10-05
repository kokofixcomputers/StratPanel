import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import { CheckIcon, DownloadIcon, ExclamationIcon, PuzzleIcon, SearchIcon } from '@heroicons/react/solid';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import Label from '@/components/elements/Label';
import Spinner from '@/components/elements/Spinner';
import Modal from '@/components/elements/Modal';
import LegacyButton from '@/components/elements/Button';
import { EmptyState } from '@/components/elements/PageHeader';
import { getProjectVersions, ModrinthProject, ModrinthVersion, primaryFile, searchModrinth } from '@/lib/minecraft';
import { ModpackSpec } from '@/components/server/mods/installModpack';

const compact = (value: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const toSpec = (project: ModrinthProject, version: ModrinthVersion): ModpackSpec => ({
    projectId: project.project_id,
    title: project.title,
    icon: project.icon_url,
    versionId: version.id,
    versionNumber: version.version_number,
    mrpackUrl: primaryFile(version).url,
});

export const describeVersion = (version: ModrinthVersion) =>
    `${version.version_number} · Minecraft ${
        version.game_versions[version.game_versions.length - 1] || '?'
    } · ${version.loaders.join(', ')}`;

/** The versions of a modpack that can be installed, which are the ones that ship a .mrpack file. */
export const useModpackVersions = (projectId: string | null) => {
    const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setVersions(null);
        setError('');
        if (!projectId) return;

        let cancelled = false;
        getProjectVersions(projectId)
            .then(
                (list) =>
                    !cancelled && setVersions(list.filter((v) => v.files.some((f) => f.filename.endsWith('.mrpack'))))
            )
            .catch((e) => !cancelled && setError(e.message));

        return () => {
            cancelled = true;
        };
    }, [projectId]);

    return { versions, error };
};

/** Searches Modrinth modpacks. Clicking a result calls onPick. */
export const ModpackSearch = ({
    selectedId,
    actionLabel,
    onPick,
}: {
    selectedId?: string | null;
    actionLabel: string;
    onPick: (project: ModrinthProject) => void;
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ModrinthProject[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            setResults(null);
            searchModrinth({ kind: 'modpack', query })
                .then((r) => !cancelled && setResults(r.hits))
                .catch((e) => !cancelled && setError(e.message));
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query]);

    return (
        <div>
            <div css={tw`relative mb-4`}>
                <SearchIcon css={tw`absolute left-4 top-0 bottom-0 my-auto w-5 h-5 text-neutral-400`} />
                <Input
                    type={'text'}
                    value={query}
                    placeholder={'Search modpacks...'}
                    style={{ paddingLeft: '3rem' }}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                />
            </div>
            {error ? (
                <p css={tw`text-sm text-red-600`}>{error}</p>
            ) : !results ? (
                <Spinner centered size={'base'} />
            ) : results.length === 0 ? (
                <EmptyState>No modpacks found.</EmptyState>
            ) : (
                <div css={tw`grid gap-3 md:grid-cols-2`}>
                    {results.map((project) => {
                        const selected = project.project_id === selectedId;

                        return (
                            <button
                                key={project.project_id}
                                type={'button'}
                                onClick={() => onPick(project)}
                                className={classNames(
                                    'flex items-start text-left rounded-xl border p-4 bg-white transition-all duration-150',
                                    selected
                                        ? 'border-primary-600 ring-4 ring-primary-600/10 shadow-md'
                                        : 'border-neutral-500 hover:border-neutral-400 shadow-sm'
                                )}
                            >
                                <span
                                    css={tw`flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-xl bg-neutral-600 overflow-hidden mr-3`}
                                >
                                    {project.icon_url ? (
                                        <img src={project.icon_url} alt={''} css={tw`w-full h-full object-cover`} />
                                    ) : (
                                        <PuzzleIcon css={tw`w-6 h-6 text-neutral-400`} />
                                    )}
                                </span>
                                <span css={tw`flex-1 min-w-0`}>
                                    <span css={tw`flex items-baseline`}>
                                        <span css={tw`text-sm font-semibold text-neutral-50 truncate`}>
                                            {project.title}
                                        </span>
                                        <span css={tw`ml-2 text-xs text-neutral-400 truncate`}>
                                            by {project.author}
                                        </span>
                                    </span>
                                    <span css={tw`block text-xs text-neutral-400 mt-1 line-clamp-2`}>
                                        {project.description}
                                    </span>
                                    <span css={tw`mt-2 flex items-center justify-between text-xs text-neutral-400`}>
                                        <span css={tw`inline-flex items-center`}>
                                            <DownloadIcon css={tw`w-3.5 h-3.5 mr-1`} />
                                            {compact(project.downloads)}
                                        </span>
                                        <span css={tw`font-medium text-primary-600 inline-flex items-center`}>
                                            {selected && <CheckIcon css={tw`w-3.5 h-3.5 mr-1`} />}
                                            {selected ? 'Selected' : actionLabel}
                                        </span>
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/** Lets the user pick a version of a modpack and confirm installing it on an existing server. */
export const InstallModpackModal = ({
    project,
    onClose,
    onInstall,
}: {
    project: ModrinthProject | null;
    onClose: () => void;
    onInstall: (spec: ModpackSpec) => void;
}) => {
    const { versions, error } = useModpackVersions(project?.project_id || null);
    const [versionId, setVersionId] = useState('');

    useEffect(() => {
        if (versions?.length) setVersionId(versions[0].id);
    }, [versions]);

    const version = versions?.find((v) => v.id === versionId);

    return (
        <Modal visible={!!project} onDismissed={onClose}>
            <h2 css={tw`text-xl mb-4 pr-10`}>Install {project?.title}</h2>
            {error ? (
                <p css={tw`text-sm text-red-600`}>{error}</p>
            ) : !versions ? (
                <Spinner centered size={'base'} />
            ) : versions.length === 0 ? (
                <p css={tw`text-sm text-neutral-300`}>This modpack has no versions that can be installed here.</p>
            ) : (
                <>
                    <Label htmlFor={'modpack-version'}>Version</Label>
                    <Select
                        id={'modpack-version'}
                        value={versionId}
                        onChange={(e) => setVersionId(e.currentTarget.value)}
                    >
                        {versions.map((v) => (
                            <option key={v.id} value={v.id}>
                                {describeVersion(v)}
                            </option>
                        ))}
                    </Select>
                    <div css={tw`mt-4 flex items-start rounded-xl bg-yellow-50 border border-yellow-200 p-4`}>
                        <ExclamationIcon css={tw`w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5`} />
                        <p css={tw`text-sm text-yellow-800`}>
                            The server will be stopped and its software replaced with the one this modpack needs. The
                            pack&apos;s mods and configs are then added to the server. Existing worlds are kept, but
                            make a backup first.
                        </p>
                    </div>
                    <div css={tw`mt-6 flex justify-end space-x-3`}>
                        <LegacyButton isSecondary onClick={onClose}>
                            Cancel
                        </LegacyButton>
                        <LegacyButton
                            disabled={!version}
                            onClick={() => project && version && onInstall(toSpec(project, version))}
                        >
                            Install modpack
                        </LegacyButton>
                    </div>
                </>
            )}
        </Modal>
    );
};
