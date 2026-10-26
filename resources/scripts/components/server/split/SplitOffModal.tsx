import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/solid';
import { ModalMask } from '@/components/elements/Modal';
import Portal from '@/components/elements/Portal';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { SoftwareGrid, useVersionSelection, VersionFields } from '@/components/server/versions/VersionPicker';
import installVersion, { ProgressStep } from '@/components/server/versions/installVersion';
import detectCurrent from '@/components/server/versions/detectCurrent';
import getServer from '@/api/server/getServer';
import { httpErrorToHuman } from '@/api/http';
import { Share, splitServer, SplitState } from '@/api/server/split';
import { SOFTWARE, SoftwareType } from '@/lib/mcjars';
import { formatAmount, RESOURCES } from '@/lib/split';

interface Props {
    open: boolean;
    // The server whose page this is, its software is what is offered first.
    uuid: string;
    name: string;
    share: Share;
    parts: string[];
    onClose: () => void;
    onSplit: (state: SplitState) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const StepRow = ({ step }: { step: ProgressStep }) => (
    <li css={tw`flex items-start text-sm`}>
        <span css={tw`mt-0.5 mr-3 flex h-5 w-5 flex-shrink-0 items-center justify-center`}>
            {step.state === 'done' ? (
                <CheckCircleIcon css={tw`h-5 w-5 text-green-600`} />
            ) : step.state === 'failed' ? (
                <XCircleIcon css={tw`h-5 w-5 text-red-600`} />
            ) : step.state === 'running' ? (
                <Spinner size={'small'} isBlue />
            ) : (
                <span css={tw`mx-1.5 h-2 w-2 rounded-full bg-neutral-500`} />
            )}
        </span>
        <div>
            <p css={step.state === 'pending' || step.state === 'skipped' ? tw`text-neutral-400` : tw`text-neutral-100`}>
                {step.label}
            </p>
            {step.detail && <p css={tw`mt-0.5 text-xs text-red-600`}>{step.detail}</p>}
        </div>
    </li>
);

/** Asks which software and version the new part runs, then splits it off and installs that on it. */
export default ({ open, uuid, name, share, parts, onClose, onSplit }: Props) => {
    const [type, setType] = useState<SoftwareType>('PAPER');
    const [error, setError] = useState('');
    const selection = useVersionSelection(type, setError);
    const { selectedVersion, selectedBuild, builds } = selection;
    const software = SOFTWARE.find((s) => s.type === type)!;

    const [running, setRunning] = useState(false);
    // What was asked for when it started: the server has less to give once the part is made.
    const [asked, setAsked] = useState<Share>(share);
    const [head, setHead] = useState<ProgressStep[]>([]);
    const [install, setInstall] = useState<ProgressStep[]>([]);
    const [outcome, setOutcome] = useState<'success' | 'failed' | null>(null);
    // The part once it was made, a second try goes on from there instead of making another.
    const [made, setMade] = useState<{ uuid: string; state: SplitState } | null>(null);

    useEffect(() => {
        if (!open) return;

        setRunning(false);
        setOutcome(null);
        setMade(null);
        setError('');
        // What this server runs is the likeliest choice for a part of it.
        detectCurrent(uuid, null)
            .then((current) => {
                if (current.type && SOFTWARE.some((s) => s.type === current.type))
                    setType(current.type as SoftwareType);
            })
            .catch(() => undefined);
    }, [open]);

    const mark = (key: string, state: ProgressStep['state'], detail?: string) =>
        setHead((steps) => steps.map((s) => (s.key === key ? { ...s, state, detail } : s)));

    const start = async () => {
        if (!selectedVersion || !selectedBuild) return;

        setAsked(share);
        setRunning(true);
        setOutcome(null);
        setInstall([]);
        setHead([
            { key: 'create', label: `Splitting off ${name}`, state: 'running' },
            { key: 'wait', label: 'Waiting for the server to be set up', state: 'pending' },
        ]);

        let phase = 'create';
        try {
            let part = made;
            if (!part) {
                const state = await splitServer(uuid, name, share);
                const added = state.parts.find((p) => !parts.includes(p.uuid));
                if (!added) throw new Error('The new server could not be found.');
                part = { uuid: added.uuid, state };
                setMade(part);
                onSplit(state);
            }
            mark('create', 'done');

            phase = 'wait';
            mark('wait', 'running');
            for (let attempt = 0; attempt < 200; attempt++) {
                const [current] = await getServer(part.uuid);
                if (current.status === 'install_failed') throw new Error('The server failed to install.');
                if (current.status === null) break;

                await sleep(3000);
            }
            mark('wait', 'done');

            phase = 'install';
            await installVersion({
                uuid: part.uuid,
                status: 'offline',
                instance: null,
                software,
                version: selectedVersion,
                build: selectedBuild,
                loader: selection.loader,
                onProgress: setInstall,
            });
            setOutcome('success');
        } catch (e) {
            const message = (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message;
            if (phase !== 'install') mark(phase, 'failed', message);
            setOutcome('failed');
        }
    };

    if (!open) return null;

    const steps = [
        ...head,
        ...(install.length
            ? install
            : [
                  {
                      key: 'install',
                      label: `Installing ${software.name} ${selectedVersion?.id || ''}`,
                      state: 'pending',
                  } as ProgressStep,
              ]),
    ];

    return (
        <Portal>
            <ModalMask onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
                <div
                    role={'dialog'}
                    aria-label={`Split off ${name}`}
                    css={tw`relative m-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-neutral-500 bg-white shadow-xl`}
                    style={{ maxWidth: '95%', width: 760 }}
                >
                    <div css={tw`overflow-y-auto p-6`}>
                        <h2 css={tw`font-header text-lg font-semibold text-neutral-50`}>
                            {running ? `Setting up ${name}...` : `Split off ${name}`}
                        </h2>
                        <p css={tw`mt-1 mb-5 text-sm text-neutral-400`}>
                            {RESOURCES.map(
                                (key) =>
                                    `${formatAmount(key, (running ? asked : share)[key])} ${
                                        key === 'cpu' ? 'CPU' : key
                                    }`
                            ).join(', ')}{' '}
                            come from this server.{' '}
                            {running ? 'This usually takes a minute or two.' : 'Choose what the new server runs.'}
                        </p>
                        {running ? (
                            <ul css={tw`space-y-3`}>
                                {steps.map((s) => (
                                    <StepRow key={s.key} step={s} />
                                ))}
                            </ul>
                        ) : (
                            <div css={tw`space-y-6`}>
                                {error && <p css={tw`text-sm text-red-600`}>{error}</p>}
                                <SoftwareGrid type={type} onChange={setType} />
                                <div>
                                    <VersionFields title={`${software.name} version`} selection={selection} />
                                </div>
                            </div>
                        )}
                    </div>
                    <div
                        css={tw`flex justify-end gap-2 rounded-b-2xl border-t border-neutral-500 bg-neutral-700 px-6 py-4`}
                    >
                        {outcome === 'success' ? (
                            <Button onClick={onClose}>Done</Button>
                        ) : outcome === 'failed' ? (
                            <>
                                <Button.Text onClick={onClose}>Close</Button.Text>
                                <Button onClick={start}>Try again</Button>
                            </>
                        ) : running ? (
                            <Button disabled>Working...</Button>
                        ) : (
                            <>
                                <Button.Text onClick={onClose}>Cancel</Button.Text>
                                <Button disabled={!selectedVersion || !selectedBuild || !builds} onClick={start}>
                                    Split off {name}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </ModalMask>
        </Portal>
    );
};
