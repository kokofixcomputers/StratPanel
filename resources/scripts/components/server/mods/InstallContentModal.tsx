import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import {
    CheckIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ExclamationIcon,
    SwitchHorizontalIcon,
} from '@heroicons/react/solid';
import Spinner from '@/components/elements/Spinner';
import Modal from '@/components/elements/Modal';
import LegacyButton from '@/components/elements/Button';
import { bytesToString } from '@/lib/formatters';
import {
    getProjectVersions,
    loadersFor,
    ModrinthProject,
    ModrinthVersion,
    primaryFile,
    ProjectKind,
    versionRange,
} from '@/lib/minecraft';

const TYPE_STYLES: Record<string, string> = {
    release: 'bg-green-50 text-green-700 border-green-200',
    beta: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    alpha: 'bg-red-50 text-red-700 border-red-200',
};

const compact = (value: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const TypePill = ({ type }: { type?: string }) => (
    <span
        className={classNames(
            'ml-2 rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide',
            TYPE_STYLES[type || 'release'] || TYPE_STYLES.release
        )}
    >
        {type || 'release'}
    </span>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div css={tw`flex items-start justify-between gap-4 py-2 border-b border-neutral-500 last:border-b-0`}>
        <dt css={tw`text-sm text-neutral-300 flex-shrink-0`}>{label}</dt>
        <dd css={tw`text-sm text-neutral-50 text-right min-w-0 break-words m-0`}>{children}</dd>
    </div>
);

interface Props {
    project: ModrinthProject | null;
    kind: ProjectKind;
    loader?: string;
    // The Minecraft version of the server, used to find versions that fit it.
    gameVersion: string;
    // What the user does with the chosen version: "Install" for files, "Use this pack" for a resource pack.
    confirmLabel?: string;
    // Shown for resource packs, which can be made mandatory.
    allowRequire?: boolean;
    // True when a resource pack is already set and would be replaced.
    replaces?: boolean;
    busy?: boolean;
    onClose: () => void;
    onConfirm: (version: ModrinthVersion, options: { required: boolean }) => void;
}

/**
 * Shows everything about the version that is about to be installed and lets the user pick another one before
 * confirming.
 */
export default ({
    project,
    kind,
    loader,
    gameVersion,
    confirmLabel = 'Install',
    allowRequire,
    replaces,
    busy,
    onClose,
    onConfirm,
}: Props) => {
    const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [changing, setChanging] = useState(false);
    const [changelog, setChangelog] = useState(false);
    const [required, setRequired] = useState(false);

    useEffect(() => {
        setVersions(null);
        setError('');
        setChanging(false);
        setChangelog(false);
        setRequired(false);
        if (!project) return;

        let cancelled = false;
        (async () => {
            try {
                const loaders = loadersFor(kind, loader);
                let list = await getProjectVersions(project.project_id, {
                    loaders: loaders.length ? loaders : undefined,
                    gameVersions: gameVersion ? [gameVersion] : undefined,
                });
                // Nothing fits the server's version: show everything, with a warning on the ones that do not fit.
                if (!list.some((v) => v.files.length) && gameVersion) {
                    list = await getProjectVersions(project.project_id, {
                        loaders: loaders.length ? loaders : undefined,
                    });
                }
                list = list.filter((v) => v.files.length > 0);
                if (cancelled) return;

                setVersions(list);
                setSelectedId(list[0]?.id || '');
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [project?.project_id, kind, loader, gameVersion]);

    const selected = versions?.find((v) => v.id === selectedId);
    const file = selected ? primaryFile(selected) : null;
    const fits = !selected || !gameVersion || selected.game_versions.includes(gameVersion);

    return (
        <Modal visible={!!project} dismissable={!busy} onDismissed={onClose}>
            {project && (
                <>
                    <div css={tw`flex items-start pr-8`}>
                        <div
                            css={tw`flex items-center justify-center flex-shrink-0 rounded-xl bg-neutral-600 overflow-hidden mr-4`}
                            style={{ width: 56, height: 56 }}
                        >
                            {project.icon_url && (
                                <img src={project.icon_url} alt={''} css={tw`w-full h-full object-cover`} />
                            )}
                        </div>
                        <div css={tw`min-w-0`}>
                            <h2 css={tw`text-xl leading-tight`}>{project.title}</h2>
                            <p css={tw`text-xs text-neutral-400 mt-0.5`}>
                                by {project.author} &middot; {compact(project.downloads)} downloads
                            </p>
                        </div>
                    </div>
                    <p css={tw`mt-3 text-sm text-neutral-300`}>{project.description}</p>
                    {project.categories.length > 0 && (
                        <div css={tw`mt-2 flex flex-wrap gap-1.5`}>
                            {project.categories.slice(0, 6).map((category) => (
                                <span
                                    key={category}
                                    css={tw`rounded-full bg-neutral-600 px-2 py-0.5 text-2xs text-neutral-300`}
                                >
                                    {category}
                                </span>
                            ))}
                        </div>
                    )}

                    <div css={tw`mt-5`}>
                        {error ? (
                            <p css={tw`text-sm text-red-600`}>{error}</p>
                        ) : !versions ? (
                            <Spinner centered size={'base'} />
                        ) : versions.length === 0 || !selected || !file ? (
                            <p css={tw`text-sm text-neutral-300`}>
                                This project has no version that can be installed here.
                            </p>
                        ) : changing ? (
                            <>
                                <p css={tw`text-sm font-semibold text-neutral-50 mb-2`}>Choose a version</p>
                                <div css={tw`max-h-72 overflow-y-auto space-y-2 pr-1`}>
                                    {versions.map((v) => {
                                        const compatible = !gameVersion || v.game_versions.includes(gameVersion);

                                        return (
                                            <button
                                                key={v.id}
                                                type={'button'}
                                                onClick={() => {
                                                    setSelectedId(v.id);
                                                    setChanging(false);
                                                }}
                                                className={classNames(
                                                    'w-full text-left rounded-lg border px-3 py-2 transition-colors duration-150',
                                                    v.id === selectedId
                                                        ? 'border-primary-500 bg-primary-50'
                                                        : 'border-neutral-500 hover:bg-neutral-600'
                                                )}
                                            >
                                                <span css={tw`flex items-center`}>
                                                    <span css={tw`text-sm font-semibold text-neutral-50`}>
                                                        {v.version_number}
                                                    </span>
                                                    <TypePill type={v.version_type} />
                                                    {v.id === versions[0].id && (
                                                        <span css={tw`ml-2 text-2xs text-neutral-400`}>newest</span>
                                                    )}
                                                    {!compatible && (
                                                        <span css={tw`ml-auto text-2xs text-yellow-700`}>
                                                            not for {gameVersion}
                                                        </span>
                                                    )}
                                                </span>
                                                <span css={tw`block text-xs text-neutral-400 mt-0.5`}>
                                                    Minecraft {versionRange(v.game_versions)} &middot;{' '}
                                                    {v.loaders.join(', ')} &middot;{' '}
                                                    {new Date(v.date_published).toLocaleDateString()}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div css={tw`mt-3`}>
                                    <LegacyButton isSecondary onClick={() => setChanging(false)}>
                                        Back
                                    </LegacyButton>
                                </div>
                            </>
                        ) : (
                            <>
                                <div css={tw`rounded-xl border border-neutral-500 bg-neutral-700 px-4 py-2`}>
                                    <div css={tw`flex items-center justify-between py-2`}>
                                        <p css={tw`flex items-center`}>
                                            <span css={tw`text-base font-semibold text-neutral-50`}>
                                                {selected.version_number}
                                            </span>
                                            <TypePill type={selected.version_type} />
                                        </p>
                                        {versions.length > 1 && (
                                            <button
                                                type={'button'}
                                                onClick={() => setChanging(true)}
                                                css={tw`inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700`}
                                            >
                                                <SwitchHorizontalIcon css={tw`w-4 h-4 mr-1`} />
                                                Change version
                                            </button>
                                        )}
                                    </div>
                                    <dl css={tw`m-0 border-t border-neutral-500`}>
                                        <Row label={'Name'}>{selected.name || selected.version_number}</Row>
                                        <Row label={'Minecraft'}>{versionRange(selected.game_versions)}</Row>
                                        {selected.loaders.length > 0 && (
                                            <Row label={'Works with'}>{selected.loaders.join(', ')}</Row>
                                        )}
                                        <Row label={'Released'}>
                                            {new Date(selected.date_published).toLocaleDateString()}
                                        </Row>
                                        <Row label={'File'}>
                                            <span css={tw`font-mono text-xs`}>{file.filename}</span>
                                            {file.size ? ` (${bytesToString(file.size)})` : ''}
                                        </Row>
                                        {selected.downloads !== undefined && (
                                            <Row label={'Downloads'}>{compact(selected.downloads)}</Row>
                                        )}
                                    </dl>
                                    {selected.changelog && selected.changelog.trim() && (
                                        <div css={tw`py-2 border-t border-neutral-500`}>
                                            <button
                                                type={'button'}
                                                onClick={() => setChangelog((v) => !v)}
                                                css={tw`inline-flex items-center text-sm text-neutral-300 hover:text-neutral-50`}
                                            >
                                                {changelog ? (
                                                    <ChevronUpIcon css={tw`w-4 h-4 mr-1`} />
                                                ) : (
                                                    <ChevronDownIcon css={tw`w-4 h-4 mr-1`} />
                                                )}
                                                Changelog
                                            </button>
                                            {changelog && (
                                                <pre
                                                    css={tw`mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-neutral-300 font-sans`}
                                                >
                                                    {selected.changelog.trim()}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {!fits && (
                                    <div
                                        css={tw`mt-3 flex items-start rounded-xl bg-yellow-50 border border-yellow-200 p-3`}
                                    >
                                        <ExclamationIcon css={tw`w-5 h-5 text-yellow-600 mr-2 flex-shrink-0`} />
                                        <p css={tw`text-sm text-yellow-800`}>
                                            This version is not listed for Minecraft {gameVersion}, the version of this
                                            server. It may not work.
                                        </p>
                                    </div>
                                )}

                                {allowRequire && (
                                    <label css={tw`mt-4 flex items-start cursor-pointer`}>
                                        <input
                                            type={'checkbox'}
                                            checked={required}
                                            onChange={(e) => setRequired(e.currentTarget.checked)}
                                            css={tw`mt-1 mr-3`}
                                        />
                                        <span>
                                            <span css={tw`block text-sm font-medium text-neutral-50`}>
                                                Require players to install it
                                            </span>
                                            <span css={tw`block text-xs text-neutral-400`}>
                                                Players who decline the resource pack are disconnected. Without this
                                                they are asked, and may say no.
                                            </span>
                                        </span>
                                    </label>
                                )}
                                {replaces && (
                                    <p css={tw`mt-3 text-xs text-neutral-400`}>
                                        This replaces the resource pack the server uses now.
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {!changing && (
                        <div css={tw`mt-6 flex justify-end space-x-3`}>
                            <LegacyButton isSecondary disabled={busy} onClick={onClose}>
                                Cancel
                            </LegacyButton>
                            <LegacyButton
                                disabled={!selected || busy}
                                onClick={() => selected && onConfirm(selected, { required })}
                            >
                                <CheckIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                                {busy ? 'Working...' : confirmLabel}
                            </LegacyButton>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
};
