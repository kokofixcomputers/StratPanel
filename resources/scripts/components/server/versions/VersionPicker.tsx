import React, { useEffect, useMemo, useState } from 'react';
import tw from 'twin.macro';
import classNames from 'classnames';
import Spinner from '@/components/elements/Spinner';
import Select from '@/components/elements/Select';
import Label from '@/components/elements/Label';
import {
    Build,
    buildLabel,
    getBuilds,
    getVersions,
    iconFor,
    Software,
    SOFTWARE,
    SoftwareType,
    VersionInfo,
} from '@/lib/mcjars';

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
            <p css={tw`text-sm font-semibold text-neutral-50`}>{software.name}</p>
            <p css={tw`text-xs text-neutral-400 line-clamp-2`}>{software.description}</p>
        </div>
    </button>
);

export const SoftwareGrid = ({ type, onChange }: { type: SoftwareType; onChange: (type: SoftwareType) => void }) => (
    <div css={tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        {SOFTWARE.map((s) => (
            <SoftwareTile key={s.type} software={s} active={s.type === type} onClick={() => onChange(s.type)} />
        ))}
    </div>
);

/**
 * Loads the versions and builds of a software from MCJars and keeps the "newest stable build" preselected.
 */
export const useVersionSelection = (type: SoftwareType, onError: (message: string) => void) => {
    const [versions, setVersions] = useState<VersionInfo[] | null>(null);
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [version, setVersion] = useState('');
    const [builds, setBuilds] = useState<Build[] | null>(null);
    const [buildId, setBuildId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setVersions(null);
        setBuilds(null);
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
        setBuilds(null);
        getBuilds(type, version)
            .then((list) => {
                if (cancelled) return;

                setBuilds(list);
                // Prefer the newest stable build, experimental ones are still selectable.
                setBuildId((list.find((b) => !b.experimental) || list[0])?.id ?? null);
            })
            .catch((error) => onError(error.message));

        return () => {
            cancelled = true;
        };
    }, [type, version]);

    return {
        versions,
        visible,
        showSnapshots,
        setShowSnapshots,
        version,
        setVersion,
        builds,
        buildId,
        setBuildId,
        selectedVersion: (versions || []).find((v) => v.id === version),
        selectedBuild: (builds || []).find((b) => b.id === buildId),
    };
};

type Selection = ReturnType<typeof useVersionSelection>;

export const VersionFields = ({ title, selection }: { title: string; selection: Selection }) => {
    const { versions, visible, version, setVersion, builds, buildId, setBuildId, showSnapshots, setShowSnapshots } =
        selection;

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
                <div css={tw`grid gap-4 md:grid-cols-2`}>
                    <div>
                        <Label>Minecraft version</Label>
                        <Select value={version} onChange={(e) => setVersion(e.currentTarget.value)}>
                            {visible.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.id}
                                    {v.type === 'SNAPSHOT' ? ' (snapshot)' : ''}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <Label>Build</Label>
                        <Select
                            value={buildId ?? ''}
                            disabled={!builds}
                            onChange={(e) => setBuildId(Number(e.currentTarget.value))}
                        >
                            {(builds || []).map((b, index) => (
                                <option key={b.id} value={b.id}>
                                    {buildLabel(b)}
                                    {index === 0 ? ' - newest' : ''}
                                    {b.experimental ? ' (experimental)' : ''}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>
            )}
        </>
    );
};
