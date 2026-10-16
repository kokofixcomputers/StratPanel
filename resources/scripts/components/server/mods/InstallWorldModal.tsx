import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { CheckIcon, ExclamationIcon } from '@heroicons/react/solid';
import Modal from '@/components/elements/Modal';
import Spinner from '@/components/elements/Spinner';
import Select from '@/components/elements/Select';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import LegacyButton from '@/components/elements/Button';
import { bytesToString } from '@/lib/formatters';
import { getProjectVersions, ModrinthProject, ModrinthVersion, primaryFile, versionRange } from '@/lib/minecraft';
import { folderNameFor, isValidFolderName } from '@/lib/worldImport';

export interface WorldChoice {
    link: string;
    name: string;
    makeActive: boolean;
    version: ModrinthVersion;
}

/**
 * Installing a world of CurseForge: which version of it, and what to call the folder. The world is downloaded and unpacked
 * next to the others, the same way as one from a link, see lib/worldImport.ts.
 */
export default ({
    project,
    offline,
    gameVersion,
    onClose,
    onConfirm,
}: {
    project: ModrinthProject | null;
    // The Minecraft version of the server, the file for it is chosen first.
    gameVersion?: string;
    // Worlds are only added while the server is stopped, it would write over them.
    offline: boolean;
    onClose: () => void;
    onConfirm: (choice: WorldChoice) => void;
}) => {
    const [versions, setVersions] = useState<ModrinthVersion[] | null>(null);
    const [restricted, setRestricted] = useState(false);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [name, setName] = useState('');
    const [active, setActive] = useState(false);

    useEffect(() => {
        setVersions(null);
        setRestricted(false);
        setError('');
        setActive(false);
        setName(project ? folderNameFor(project.title) : '');
        if (!project) return;

        let cancelled = false;
        getProjectVersions(project.project_id)
            .then((list) => {
                if (cancelled) return;
                const usable = list.filter((v) => v.files.length > 0);
                setRestricted(list.length > 0 && usable.length === 0);
                setVersions(usable);
                setSelectedId(
                    (usable.find((v) => gameVersion && v.game_versions.includes(gameVersion)) || usable[0])?.id || ''
                );
            })
            .catch((e) => !cancelled && setError(e.message));

        return () => {
            cancelled = true;
        };
    }, [project?.project_id, gameVersion]);

    const selected = versions?.find((v) => v.id === selectedId);
    const file = selected ? primaryFile(selected) : null;
    const archive = !file || /\.(zip|tar\.gz|tgz)$/i.test(file.filename);
    const valid = !!selected && !!file && archive && isValidFolderName(name) && offline;

    return (
        <Modal visible={!!project} onDismissed={onClose}>
            {project && (
                <>
                    <h2 css={tw`text-xl leading-tight pr-8`}>Install {project.title}</h2>
                    <p css={tw`mt-1 text-xs text-neutral-400`}>by {project.author}</p>

                    <div css={tw`mt-5`}>
                        {error ? (
                            <p css={tw`text-sm text-red-600`}>{error}</p>
                        ) : !versions ? (
                            <Spinner centered size={'base'} />
                        ) : versions.length === 0 ? (
                            <p css={tw`text-sm text-neutral-300`}>
                                {restricted
                                    ? 'The author of this world only lets it be downloaded from CurseForge. Download it there and upload it to the server.'
                                    : 'This world has no file to install.'}
                            </p>
                        ) : (
                            <>
                                <Label htmlFor={'world-version'}>Version</Label>
                                <Select
                                    id={'world-version'}
                                    value={selectedId}
                                    onChange={(e) => setSelectedId(e.currentTarget.value)}
                                >
                                    {versions.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.version_number} (Minecraft {versionRange(v.game_versions)})
                                        </option>
                                    ))}
                                </Select>
                                {file && (
                                    <p css={tw`mt-1 text-xs text-neutral-400`}>
                                        {file.filename}
                                        {file.size ? ` · ${bytesToString(file.size)}` : ''}
                                    </p>
                                )}
                                {!archive && (
                                    <div
                                        css={tw`mt-3 flex items-start rounded-xl bg-yellow-50 border border-yellow-200 p-3`}
                                    >
                                        <ExclamationIcon css={tw`w-5 h-5 text-yellow-600 mr-2 flex-shrink-0`} />
                                        <p css={tw`text-sm text-yellow-800`}>
                                            This file is not a .zip or .tar.gz, the panel can not unpack it. Download it
                                            and put the world on the server by hand.
                                        </p>
                                    </div>
                                )}

                                <div css={tw`mt-4`}>
                                    <Label htmlFor={'world-folder'}>Folder name</Label>
                                    <Input
                                        id={'world-folder'}
                                        value={name}
                                        onChange={(e) => setName(e.currentTarget.value)}
                                    />
                                    {name && !isValidFolderName(name) && (
                                        <p css={tw`mt-1 text-xs text-red-600`}>
                                            Use letters, numbers, - and _ , at most 48.
                                        </p>
                                    )}
                                </div>
                                <label css={tw`mt-4 flex items-center cursor-pointer`}>
                                    <input
                                        type={'checkbox'}
                                        checked={active}
                                        onChange={(e) => setActive(e.currentTarget.checked)}
                                        css={tw`mr-3`}
                                    />
                                    <span css={tw`text-sm text-neutral-100`}>Use it as the world of the server</span>
                                </label>
                                <p css={tw`mt-3 text-xs text-neutral-400`}>
                                    {offline
                                        ? 'It is added next to your other worlds, nothing is replaced. The download runs in the background, follow it in the task menu.'
                                        : 'Stop the server first.'}
                                </p>
                            </>
                        )}
                    </div>

                    <div css={tw`mt-6 flex justify-end space-x-3`}>
                        <LegacyButton isSecondary onClick={onClose}>
                            Cancel
                        </LegacyButton>
                        <LegacyButton
                            disabled={!valid}
                            onClick={() =>
                                selected &&
                                file &&
                                onConfirm({ link: file.url, name, makeActive: active, version: selected })
                            }
                        >
                            <CheckIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                            Install world
                        </LegacyButton>
                    </div>
                </>
            )}
        </Modal>
    );
};
