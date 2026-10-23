import React, { useEffect, useMemo, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import { format } from 'date-fns';
import { ExclamationIcon, SearchIcon } from '@heroicons/react/solid';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import {
    Build,
    buildLabel,
    getBuilds,
    getVersions,
    iconFor,
    loaderOfBuild,
    loadersOfBuilds,
    MOD_LOADER_INFO,
    ModLoader,
    Software,
    SOFTWARE,
    SoftwareType,
    VersionInfo,
} from '@/lib/mcjars';
import { BUILD_CAP, capped, filterBuilds, filterVersions, VERSION_CAP } from '@/lib/versionSearch';

export const SoftwareTile = ({
    software,
    active,
    onClick,
}: {
    software: Software;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        type={'button'}
        onClick={onClick}
        className={classNames(
            'flex items-center text-left rounded-xl border p-4 transition-all duration-150 bg-white',
            active
                ? 'border-primary-600 ring-4 ring-primary-600/10 shadow-md'
                : 'border-neutral-500 hover:border-neutral-400 shadow-sm'
        )}
    >
        <img
            src={iconFor(software.type)}
            alt={''}
            css={tw`w-11 h-11 rounded-lg bg-neutral-600 object-contain p-1 flex-shrink-0`}
        />
        <div css={tw`ml-3 min-w-0`}>
            <p css={tw`text-sm font-semibold text-neutral-50 flex items-center gap-1.5`}>
                {software.name}
                {software.experimental && (
                    <span
                        css={tw`rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 text-2xs font-medium`}
                    >
                        Experimental
                    </span>
                )}
            </p>
            <p css={tw`text-xs text-neutral-400 line-clamp-2`}>{software.description}</p>
        </div>
    </button>
);

export const SoftwareGrid = ({ type, onChange }: { type: SoftwareType; onChange: (type: SoftwareType) => void }) => {
    const chosen = SOFTWARE.find((s) => s.type === type);

    return (
        <>
            <div css={tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
                {SOFTWARE.map((s) => (
                    <SoftwareTile key={s.type} software={s} active={s.type === type} onClick={() => onChange(s.type)} />
                ))}
            </div>
            {chosen?.experimental && (
                <div
                    role={'alert'}
                    css={tw`mt-4 flex items-start rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900`}
                >
                    <ExclamationIcon css={tw`mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500`} />
                    <p css={tw`text-yellow-900`}>
                        <strong>{chosen.name} is experimental.</strong> It can break between versions, lag behind new
                        Minecraft releases, and many mods and plugins are not tested on it. Make a backup first and do
                        not use it for a server people depend on.
                    </p>
                </div>
            )}
        </>
    );
};

/**
 * Loads the versions and builds of a software from MCJars and keeps the "newest stable build" preselected.
 */
export const useVersionSelection = (type: SoftwareType, onError: (message: string) => void) => {
    const [versions, setVersions] = useState<VersionInfo[] | null>(null);
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [version, setVersion] = useState('');
    const [allBuilds, setAllBuilds] = useState<Build[] | null>(null);
    const [buildId, setBuildId] = useState<number | null>(null);
    // Software whose builds are for several mod loaders (Arclight) asks for the loader after the version.
    const [wantedLoader, setWantedLoader] = useState<ModLoader | null>(null);
    const chooses = !!SOFTWARE.find((s) => s.type === type)?.loaders;

    useEffect(() => {
        let cancelled = false;
        setVersions(null);
        setAllBuilds(null);
        setVersion('');

        getVersions(type)
            .then((list) => !cancelled && setVersions(list))
            .catch((error) => onError(error.message));

        return () => {
            cancelled = true;
        };
    }, [type]);

    const visible = useMemo(
        () => (versions || []).filter((v) => showSnapshots || v.type === 'RELEASE'),
        [versions, showSnapshots]
    );

    // Preselect the newest version whenever the list changes.
    useEffect(() => {
        if (visible.length && !visible.some((v) => v.id === version)) setVersion(visible[0].id);
    }, [visible]);

    useEffect(() => {
        if (!version) return;

        let cancelled = false;
        setAllBuilds(null);
        getBuilds(type, version)
            .then((list) => !cancelled && setAllBuilds(list))
            .catch((error) => onError(error.message));

        return () => {
            cancelled = true;
        };
    }, [type, version]);

    // What was chosen stays chosen from one version to the next while the version has builds for it, otherwise the loader of the newest build.
    const loaders = useMemo(() => (chooses && allBuilds ? loadersOfBuilds(allBuilds) : []), [chooses, allBuilds]);
    const loader: ModLoader | null = loaders.length
        ? wantedLoader && loaders.includes(wantedLoader)
            ? wantedLoader
            : loaders[0]
        : null;
    const builds = useMemo(
        () => (allBuilds && loader ? allBuilds.filter((b) => loaderOfBuild(b) === loader) : allBuilds),
        [allBuilds, loader]
    );

    // Prefer the newest stable build, experimental ones are still selectable.
    useEffect(() => {
        if (builds) setBuildId((builds.find((b) => !b.experimental) || builds[0])?.id ?? null);
    }, [builds]);

    return {
        versions,
        visible,
        showSnapshots,
        setShowSnapshots,
        version,
        setVersion,
        builds,
        loaders,
        loader,
        setLoader: setWantedLoader,
        buildId,
        setBuildId,
        selectedVersion: (versions || []).find((v) => v.id === version),
        selectedBuild: (builds || []).find((b) => b.id === buildId),
    };
};

type Selection = ReturnType<typeof useVersionSelection>;

const Chip = ({ children, tone }: { children: React.ReactNode; tone: 'primary' | 'yellow' | 'neutral' }) => (
    <span
        className={classNames(
            'rounded-full px-1.5 py-0.5 text-2xs font-medium',
            tone === 'primary' && 'bg-primary-50 text-primary-700',
            tone === 'yellow' && 'bg-yellow-50 text-yellow-700',
            tone === 'neutral' && 'bg-neutral-600 text-neutral-300'
        )}
    >
        {children}
    </span>
);

const SearchBox = ({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) => (
    <div css={tw`relative`}>
        <SearchIcon css={tw`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400`} />
        <Input
            type={'search'}
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => onChange(e.currentTarget.value)}
            style={{ paddingLeft: '2.25rem' }}
        />
    </div>
);

const pick = (selected: boolean) =>
    classNames(
        'rounded-xl border p-3 text-left transition-colors duration-150',
        selected
            ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-600/20'
            : 'border-neutral-500 hover:bg-neutral-600'
    );

/** The version to install, as cards with a search, and then the build of it as cards. */
export const VersionFields = ({ title, selection }: { title: string; selection: Selection }) => {
    const {
        versions,
        visible,
        version,
        setVersion,
        builds,
        buildId,
        setBuildId,
        showSnapshots,
        setShowSnapshots,
        loaders,
        loader,
        setLoader,
    } = selection;
    const [query, setQuery] = useState('');
    const [allVersions, setAllVersions] = useState(false);
    const [buildQuery, setBuildQuery] = useState('');
    const [allBuilds, setAllBuilds] = useState(false);

    // A new version has its own builds, which start from the newest again.
    useEffect(() => {
        setBuildQuery('');
        setAllBuilds(false);
    }, [version]);

    const found = filterVersions(visible, query);
    const shown = capped(found, VERSION_CAP, allVersions || query.trim() !== '');
    // The version that is chosen stays in view even when the search or the cap would hide it.
    const withChosen = shown.some((v) => v.id === version)
        ? shown
        : [...found.filter((v) => v.id === version), ...shown];
    const foundBuilds = filterBuilds(builds || [], buildQuery);
    const shownBuilds = capped(foundBuilds, BUILD_CAP, allBuilds || buildQuery.trim() !== '');

    return (
        <>
            <div css={tw`flex items-center justify-between mb-4`}>
                <p css={tw`text-base font-semibold text-neutral-50`}>{title}</p>
                <label css={tw`flex items-center text-sm text-neutral-300 cursor-pointer select-none`}>
                    <input
                        type={'checkbox'}
                        checked={showSnapshots}
                        onChange={(e) => setShowSnapshots(e.currentTarget.checked)}
                        css={tw`mr-2 rounded`}
                    />
                    Show snapshots
                </label>
            </div>
            {!versions ? (
                <Spinner centered size={'base'} />
            ) : (
                <div css={tw`space-y-6`}>
                    <div>
                        <div css={tw`mb-2 flex items-center justify-between gap-3`}>
                            <Label css={tw`mb-0`}>Minecraft version</Label>
                            <div css={tw`w-48`}>
                                <SearchBox value={query} onChange={setQuery} placeholder={'Search versions'} />
                            </div>
                        </div>
                        {found.length === 0 ? (
                            <p css={tw`rounded-xl border border-neutral-500 p-4 text-sm text-neutral-400`}>
                                No version has &quot;{query.trim()}&quot; in it.
                            </p>
                        ) : (
                            <div css={tw`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4`}>
                                {withChosen.map((v) => (
                                    <button
                                        key={v.id}
                                        type={'button'}
                                        onClick={() => setVersion(v.id)}
                                        aria-pressed={v.id === version}
                                        className={pick(v.id === version)}
                                    >
                                        <span css={tw`flex items-center justify-between gap-2`}>
                                            <span css={tw`text-sm font-semibold text-neutral-50`}>{v.id}</span>
                                            {v.type === 'SNAPSHOT' ? (
                                                <Chip tone={'yellow'}>snapshot</Chip>
                                            ) : v.id === visible[0]?.id && query.trim() === '' ? (
                                                <Chip tone={'primary'}>newest</Chip>
                                            ) : null}
                                        </span>
                                        <span css={tw`mt-1 block text-xs text-neutral-400`}>
                                            Java {v.java} &middot; {v.builds} {v.builds === 1 ? 'build' : 'builds'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {query.trim() === '' && found.length > VERSION_CAP && (
                            <button
                                type={'button'}
                                css={tw`mt-3 text-sm text-primary-600`}
                                onClick={() => setAllVersions((v) => !v)}
                            >
                                {allVersions ? 'Show fewer versions' : `Show all ${found.length} versions`}
                            </button>
                        )}
                    </div>
                    {loaders.length > 0 && (
                        <div>
                            <Label>Mod loader</Label>
                            <div css={tw`grid grid-cols-1 gap-2 sm:grid-cols-3`}>
                                {loaders.map((id) => (
                                    <button
                                        key={id}
                                        type={'button'}
                                        onClick={() => setLoader(id)}
                                        aria-pressed={id === loader}
                                        className={pick(id === loader)}
                                    >
                                        <span css={tw`block text-sm font-semibold text-neutral-50`}>
                                            {MOD_LOADER_INFO[id].name}
                                        </span>
                                        <span css={tw`mt-1 block text-xs text-neutral-400`}>
                                            {MOD_LOADER_INFO[id].description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <div css={tw`mb-2 flex items-center justify-between gap-3`}>
                            <Label css={tw`mb-0`}>
                                Build{version ? ` of ${version}` : ''}
                                {loader ? ` for ${MOD_LOADER_INFO[loader].name}` : ''}
                            </Label>
                            <div css={tw`w-48`}>
                                <SearchBox value={buildQuery} onChange={setBuildQuery} placeholder={'Search builds'} />
                            </div>
                        </div>
                        {!builds ? (
                            <Spinner centered size={'base'} />
                        ) : foundBuilds.length === 0 ? (
                            <p css={tw`rounded-xl border border-neutral-500 p-4 text-sm text-neutral-400`}>
                                {builds.length === 0 ? 'This version has no builds.' : 'No build matches that.'}
                            </p>
                        ) : (
                            <div css={tw`grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3`}>
                                {shownBuilds.map((b) => (
                                    <button
                                        key={b.id}
                                        type={'button'}
                                        onClick={() => setBuildId(b.id)}
                                        aria-pressed={b.id === buildId}
                                        className={pick(b.id === buildId)}
                                    >
                                        <span css={tw`flex items-center justify-between gap-2`}>
                                            <span
                                                css={tw`truncate text-sm font-semibold text-neutral-50`}
                                                title={buildLabel(b)}
                                            >
                                                {loader
                                                    ? buildLabel(b).replace(new RegExp(`-${loader}$`, 'i'), '')
                                                    : buildLabel(b)}
                                            </span>
                                            {b.id === builds[0]?.id && buildQuery.trim() === '' ? (
                                                <Chip tone={'primary'}>newest</Chip>
                                            ) : null}
                                        </span>
                                        <span css={tw`mt-1 flex items-center gap-2 text-xs text-neutral-400`}>
                                            {b.created && <span>{format(new Date(b.created), 'PP')}</span>}
                                            {b.experimental && <Chip tone={'yellow'}>experimental</Chip>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {buildQuery.trim() === '' && foundBuilds.length > BUILD_CAP && (
                            <button
                                type={'button'}
                                css={tw`mt-3 text-sm text-primary-600`}
                                onClick={() => setAllBuilds((v) => !v)}
                            >
                                {allBuilds ? 'Show fewer builds' : `Show all ${foundBuilds.length} builds`}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
