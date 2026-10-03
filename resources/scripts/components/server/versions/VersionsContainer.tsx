import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { CheckCircleIcon, DownloadIcon, ExclamationIcon, XCircleIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Modal from '@/components/elements/Modal';
import { Button } from '@/components/elements/button/index';
import LegacyButton from '@/components/elements/Button';
import useFlash from '@/plugins/useFlash';
import { buildLabel, iconFor, SOFTWARE, SoftwareType } from '@/lib/mcjars';
import { SoftwareGrid, useVersionSelection, VersionFields } from '@/components/server/versions/VersionPicker';
import installVersion, { ProgressStep } from '@/components/server/versions/installVersion';
import detectCurrent, { CurrentVersion } from '@/components/server/versions/detectCurrent';
import { format } from 'date-fns';

const StepIcon = ({ state }: { state: ProgressStep['state'] }) =>
    state === 'done' ? (
        <CheckCircleIcon css={tw`w-5 h-5 text-green-600`} />
    ) : state === 'failed' ? (
        <XCircleIcon css={tw`w-5 h-5 text-red-600`} />
    ) : state === 'running' ? (
        <Spinner size={'small'} isBlue />
    ) : (
        <span css={tw`w-2 h-2 rounded-full bg-neutral-500 mx-1.5`} />
    );

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const { clearFlashes, addFlash } = useFlash();

    const [type, setType] = useState<SoftwareType>('PAPER');

    const [confirm, setConfirm] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [finished, setFinished] = useState<'success' | 'failed' | null>(null);
    const [progress, setProgress] = useState<ProgressStep[]>([]);

    const software = SOFTWARE.find((s) => s.type === type)!;

    const dockerImage = ServerContext.useStoreState((state) => state.server.data!.dockerImage);
    const variableVersion = ServerContext.useStoreState(
        (state) =>
            state.server.data!.variables.find(
                (v) =>
                    ['MC_VERSION', 'MINECRAFT_VERSION', 'VERSION'].includes(v.envVariable) &&
                    /^\d+\.\d+/.test(v.serverValue || '')
            )?.serverValue || null
    );
    const [current, setCurrent] = useState<CurrentVersion | null | undefined>(undefined);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        detectCurrent(uuid, variableVersion)
            .then(setCurrent)
            .catch(() => setCurrent(null));
    }, [uuid, reload]);

    useEffect(() => {
        clearFlashes('versions');
    }, [type]);

    const selection = useVersionSelection(type, (message) => addFlash({ key: 'versions', type: 'error', message }));
    const { versions, version, builds, selectedVersion, selectedBuild } = selection;

    const install = async () => {
        if (!selectedVersion || !selectedBuild) return;

        setInstalling(true);
        setFinished(null);
        try {
            await installVersion({
                uuid,
                status,
                instance,
                software,
                version: selectedVersion,
                build: selectedBuild,
                onProgress: setProgress,
            });
            setFinished('success');
            setReload((n) => n + 1);
        } catch (e) {
            setFinished('failed');
        } finally {
            setInstalling(false);
        }
    };

    const closeModal = () => {
        if (installing) return;

        setConfirm(false);
        setFinished(null);
        setProgress([]);
    };

    const started = progress.length > 0;

    return (
        <ServerContentBlock title={'Versions'}>
            <PageHeader
                title={'Versions'}
                subtitle={`Change the Minecraft software and version running on ${serverName}`}
            />
            <FlashMessageRender byKey={'versions'} css={tw`mb-4`} />

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                <p css={tw`text-base font-semibold text-neutral-50 mb-4`}>Currently running</p>
                {current === undefined ? (
                    <Spinner size={'small'} isBlue />
                ) : (
                    <div css={tw`flex flex-wrap items-center gap-4`}>
                        {current?.type && current.type !== 'VANILLA' ? (
                            <img
                                src={iconFor(current.type)}
                                alt={''}
                                css={tw`w-14 h-14 rounded-xl bg-neutral-600 object-contain p-1.5 flex-shrink-0`}
                            />
                        ) : (
                            <div
                                css={tw`flex items-center justify-center w-14 h-14 rounded-xl bg-neutral-600 text-neutral-400 text-xl font-bold flex-shrink-0`}
                            >
                                {current?.type === 'VANILLA' ? 'MC' : '?'}
                            </div>
                        )}
                        <div css={tw`flex-1 min-w-0`}>
                            <p css={tw`text-xl font-semibold text-neutral-50`}>
                                {current?.type
                                    ? `${SOFTWARE.find((s) => s.type === current.type)?.name || 'Vanilla'} ${
                                          current.version || ''
                                      }`
                                    : 'Unknown software'}
                            </p>
                            <p css={tw`text-sm text-neutral-400 mt-0.5`}>
                                {current?.source === 'panel' && current.installedAt
                                    ? `Installed from this page on ${format(
                                          new Date(current.installedAt),
                                          'MMM do, yyyy h:mma'
                                      )}`
                                    : current?.type
                                    ? 'Detected from the server files. Install a version below to track it exactly.'
                                    : 'Nothing recognisable was found. Pick a version below to install one.'}
                            </p>
                        </div>
                        <div css={tw`flex flex-wrap gap-2 text-xs`}>
                            {current?.build && (
                                <span css={tw`rounded-full bg-neutral-600 text-neutral-200 px-3 py-1 font-medium`}>
                                    Build {current.build}
                                </span>
                            )}
                            <span css={tw`rounded-full bg-primary-50 text-primary-700 px-3 py-1 font-medium font-mono`}>
                                {dockerImage.split('/').pop()}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                <p css={tw`text-base font-semibold text-neutral-50 mb-4`}>Server software</p>
                <SoftwareGrid type={type} onChange={setType} />
            </div>

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5`}>
                <VersionFields title={`${software.name} version`} selection={selection} />
                {!versions ? null : (
                    <>
                        {selectedVersion && (
                            <div css={tw`mt-4 flex flex-wrap items-center gap-2 text-xs`}>
                                <span css={tw`rounded-full bg-primary-50 text-primary-700 px-3 py-1 font-medium`}>
                                    Requires Java {selectedVersion.java}
                                </span>
                                {!selectedVersion.supported && (
                                    <span
                                        css={tw`rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 font-medium`}
                                    >
                                        No longer supported upstream
                                    </span>
                                )}
                                {selectedBuild?.changes?.[0] && (
                                    <span css={tw`text-neutral-400 truncate`}>{selectedBuild.changes[0]}</span>
                                )}
                            </div>
                        )}
                        <div css={tw`mt-6 flex justify-end`}>
                            <Button disabled={!selectedBuild || !builds} onClick={() => setConfirm(true)}>
                                <DownloadIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                                Install {software.name} {version}
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <Modal
                visible={confirm}
                dismissable={!installing}
                closeOnBackground={!installing}
                closeOnEscape={!installing}
                onDismissed={closeModal}
            >
                {!started ? (
                    <>
                        <div css={tw`flex items-start`}>
                            <div
                                css={tw`flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 text-yellow-600 mr-4 flex-shrink-0`}
                            >
                                <ExclamationIcon css={tw`w-6 h-6`} />
                            </div>
                            <div>
                                <h2 css={tw`text-xl pr-10`}>
                                    Install {software.name} {version}?
                                </h2>
                                <p css={tw`mt-2 text-sm text-neutral-300 leading-relaxed`}>
                                    The server will be <strong>shut down</strong> and its current{' '}
                                    <code>server.jar</code> and libraries will be replaced with {software.name}{' '}
                                    {version}
                                    {selectedBuild ? ` (${buildLabel(selectedBuild)})` : ''}. Your worlds, plugins, mods
                                    and configs are kept, but they may not work on a different version. Switching to an
                                    older version can corrupt a world, so make a backup first.
                                </p>
                            </div>
                        </div>
                        <div
                            css={tw`mt-6 -mx-5 sm:-mx-6 md:-mx-8 -mb-5 sm:-mb-6 md:-mb-8 px-8 py-5 bg-neutral-900 border-t border-neutral-500 rounded-b-2xl flex justify-end space-x-3`}
                        >
                            <LegacyButton isSecondary onClick={closeModal}>
                                Cancel
                            </LegacyButton>
                            <LegacyButton color={'red'} onClick={install}>
                                Stop server &amp; install
                            </LegacyButton>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 css={tw`text-xl mb-5 pr-10`}>
                            {finished === 'success'
                                ? 'Installation complete'
                                : finished === 'failed'
                                ? 'Installation failed'
                                : `Installing ${software.name} ${version}...`}
                        </h2>
                        <ul css={tw`space-y-3`}>
                            {progress.map((step) => (
                                <li key={step.key} css={tw`flex items-start text-sm`}>
                                    <span css={tw`mt-0.5 mr-3 w-5 h-5 flex items-center justify-center flex-shrink-0`}>
                                        <StepIcon state={step.state} />
                                    </span>
                                    <div>
                                        <p
                                            css={
                                                step.state === 'pending' || step.state === 'skipped'
                                                    ? tw`text-neutral-400`
                                                    : tw`text-neutral-100`
                                            }
                                        >
                                            {step.label}
                                        </p>
                                        {step.detail && <p css={tw`text-xs text-red-600 mt-0.5`}>{step.detail}</p>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {finished && (
                            <div css={tw`mt-6 flex justify-end space-x-3`}>
                                <LegacyButton isSecondary onClick={closeModal}>
                                    Close
                                </LegacyButton>
                                {finished === 'success' && (
                                    <LegacyButton
                                        color={'green'}
                                        onClick={() => {
                                            instance?.send('set state', 'start');
                                            closeModal();
                                        }}
                                    >
                                        Start server
                                    </LegacyButton>
                                )}
                            </div>
                        )}
                    </>
                )}
            </Modal>
        </ServerContentBlock>
    );
};
