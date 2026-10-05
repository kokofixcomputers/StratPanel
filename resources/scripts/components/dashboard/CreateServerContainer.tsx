import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import tw from 'twin.macro';
import classNames from 'classnames';
import {
    AdjustmentsIcon,
    ArrowLeftIcon,
    ArrowRightIcon,
    CheckCircleIcon,
    CheckIcon,
    XCircleIcon,
} from '@heroicons/react/solid';
import PageContentBlock from '@/components/elements/PageContentBlock';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Select from '@/components/elements/Select';
import Button from '@/components/elements/Button';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import getServer, { Server } from '@/api/server/getServer';
import { createServer, getSelfService, SelfService, SelfServiceNode, Specs } from '@/api/selfService';
import Slider from '@/components/elements/Slider';
import { pingUrl } from '@/lib/ping';
import { LocationMarkerIcon } from '@heroicons/react/outline';
import { buildLabel, iconFor, SOFTWARE, SoftwareType } from '@/lib/mcjars';
import { bytesToString, mbToBytes } from '@/lib/formatters';
import { SoftwareGrid, useVersionSelection, VersionFields } from '@/components/server/versions/VersionPicker';
import installVersion, { ProgressStep } from '@/components/server/versions/installVersion';
import installModpack from '@/components/server/mods/installModpack';
import { describeVersion, ModpackSearch, toSpec, useModpackVersions } from '@/components/server/mods/modpack';
import { ModrinthProject } from '@/lib/minecraft';

const STEPS = ['Name & software', 'Version', 'Node', 'Review'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Stepper = ({ step }: { step: number }) => (
    <ol css={tw`flex items-center mb-8`}>
        {STEPS.map((label, index) => (
            <React.Fragment key={label}>
                <li css={tw`flex items-center`}>
                    <span
                        className={classNames(
                            'flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors duration-150',
                            index < step && 'bg-primary-600 text-white',
                            index === step && 'bg-primary-600 text-white ring-4 ring-primary-600/20',
                            index > step && 'bg-neutral-500 text-neutral-300'
                        )}
                    >
                        {index < step ? <CheckIcon css={tw`w-4 h-4`} /> : index + 1}
                    </span>
                    <span
                        className={classNames(
                            'ml-3 text-sm font-medium hidden sm:block',
                            index <= step ? 'text-neutral-50' : 'text-neutral-400'
                        )}
                    >
                        {label}
                    </span>
                </li>
                {index < STEPS.length - 1 && <li css={tw`flex-1 mx-4 h-px bg-neutral-500`} aria-hidden />}
            </React.Fragment>
        ))}
    </ol>
);

const Card = ({ children }: { children: React.ReactNode }) => (
    <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 sm:p-6`}>{children}</div>
);

const StepRow = ({ step }: { step: ProgressStep }) => (
    <li css={tw`flex items-start text-sm`}>
        <span css={tw`mt-0.5 mr-3 w-5 h-5 flex items-center justify-center flex-shrink-0`}>
            {step.state === 'done' ? (
                <CheckCircleIcon css={tw`w-5 h-5 text-green-600`} />
            ) : step.state === 'failed' ? (
                <XCircleIcon css={tw`w-5 h-5 text-red-600`} />
            ) : step.state === 'running' ? (
                <Spinner size={'small'} isBlue />
            ) : (
                <span css={tw`w-2 h-2 rounded-full bg-neutral-500 mx-1.5`} />
            )}
        </span>
        <div>
            <p css={step.state === 'pending' || step.state === 'skipped' ? tw`text-neutral-400` : tw`text-neutral-100`}>
                {step.label}
            </p>
            {step.detail && <p css={tw`text-xs text-red-600 mt-0.5`}>{step.detail}</p>}
        </div>
    </li>
);

export default () => {
    const history = useHistory();
    const { addFlash, clearFlashes } = useFlash();

    const [config, setConfig] = useState<SelfService | null | undefined>(undefined);
    const [step, setStep] = useState(0);
    const [name, setName] = useState('');
    const [type, setType] = useState<SoftwareType>('PAPER');

    const [specs, setSpecs] = useState<Specs | null>(null);
    const [editingSpecs, setEditingSpecs] = useState(false);
    const [nodeId, setNodeId] = useState<number | null>(null);
    const [pings, setPings] = useState<Record<number, number | null | undefined>>({});

    const [running, setRunning] = useState(false);
    const [created, setCreated] = useState<Server | null>(null);
    const [head, setHead] = useState<ProgressStep[]>([]);
    const [install, setInstall] = useState<ProgressStep[]>([]);
    const [outcome, setOutcome] = useState<'success' | 'failed' | null>(null);

    // A modpack can be installed instead of plain server software.
    const [source, setSource] = useState<'software' | 'modpack'>('software');
    const [pack, setPack] = useState<ModrinthProject | null>(null);
    const [packVersionId, setPackVersionId] = useState('');
    const packVersions = useModpackVersions(source === 'modpack' && pack ? pack.project_id : null);
    useEffect(() => {
        if (packVersions.versions?.length) setPackVersionId(packVersions.versions[0].id);
    }, [packVersions.versions]);
    const packVersion = packVersions.versions?.find((v) => v.id === packVersionId) || null;

    const software = SOFTWARE.find((s) => s.type === type)!;
    const selection = useVersionSelection(type, (message) => addFlash({ key: 'create', type: 'error', message }));
    const { selectedVersion, selectedBuild, builds } = selection;

    useEffect(() => {
        getSelfService()
            .then((value) => {
                setConfig(value);
                setSpecs(value.limits);
            })
            .catch(() => setConfig(null));
    }, []);

    useEffect(() => {
        if (!config) return;

        let cancelled = false;
        config.nodes.forEach((node) =>
            pingUrl(node.pingUrl).then((ms) => !cancelled && setPings((current) => ({ ...current, [node.id]: ms })))
        );

        return () => {
            cancelled = true;
        };
    }, [config]);

    const fits = (node: SelfServiceNode, wanted: Specs | null) =>
        !!wanted && node.freeAllocations > 0 && node.memoryFree >= wanted.memory && node.diskFree >= wanted.disk;

    // Preselect the fastest node that can hold the server, until the user picks one themselves.
    useEffect(() => {
        if (!config || nodeId !== null || !config.nodes.length) return;

        const candidates = config.nodes.filter((n) => fits(n, specs));
        const measured = candidates.filter((n) => typeof pings[n.id] === 'number');
        if (measured.length === candidates.filter((n) => pings[n.id] !== undefined).length && measured.length) {
            measured.sort((a, b) => (pings[a.id] as number) - (pings[b.id] as number));
            setNodeId(measured[0].id);
        } else if (candidates.length && Object.keys(pings).length === config.nodes.length) {
            setNodeId(candidates[0].id);
        }
    }, [config, pings, specs]);

    const selectedNode = config?.nodes.find((n) => n.id === nodeId) || null;
    const nodeFits = !config?.nodes.length || (!!selectedNode && fits(selectedNode, specs));

    const canContinue =
        step === 0
            ? name.trim().length > 0 && (source === 'software' || !!pack)
            : step === 1
            ? source === 'modpack'
                ? !!packVersion
                : !!selectedVersion && !!selectedBuild && !!builds
            : step === 2
            ? !config?.nodes.length || (!!selectedNode && fits(selectedNode, specs))
            : true;

    const setHeadState = (key: string, state: ProgressStep['state'], detail?: string) =>
        setHead((steps) => steps.map((s) => (s.key === key ? { ...s, state, detail } : s)));

    const start = async () => {
        if (source === 'software' && (!selectedVersion || !selectedBuild)) return;
        if (source === 'modpack' && (!pack || !packVersion)) return;

        clearFlashes('create');
        setRunning(true);
        setOutcome(null);
        setInstall([]);
        setHead([
            { key: 'create', label: 'Creating your server', state: 'running' },
            { key: 'wait', label: 'Waiting for the server to be set up', state: 'pending' },
        ]);

        let server = created;
        let phase = 'create';
        try {
            if (!server) {
                server = await createServer(name.trim(), undefined, specs || undefined, nodeId);
                setCreated(server);
            }
            setHeadState('create', 'done');

            phase = 'wait';
            setHeadState('wait', 'running');
            for (let attempt = 0; attempt < 200; attempt++) {
                const [current] = await getServer(server.id);
                if (current.status === 'install_failed') throw new Error('The server failed to install.');
                if (current.status === null) break;

                await sleep(3000);
            }
            setHeadState('wait', 'done');

            phase = 'install';
            if (source === 'modpack') {
                const spec = toSpec(pack!, packVersion!);
                const show = (label: string, state: ProgressStep['state'] = 'running') =>
                    setInstall([{ key: 'modpack', label, state }]);

                show(`Installing ${spec.title}...`);
                try {
                    await installModpack({
                        uuid: server.uuid,
                        status: 'offline',
                        instance: null,
                        spec,
                        report: (detail) => show(detail),
                    });
                } catch (e) {
                    setInstall([
                        {
                            key: 'modpack',
                            label: `Installing ${spec.title}`,
                            state: 'failed',
                            detail: (e as Error).message,
                        },
                    ]);
                    throw e;
                }
                show(`Installed ${spec.title}`, 'done');
            } else {
                await installVersion({
                    uuid: server.uuid,
                    status: 'offline',
                    instance: null,
                    software,
                    version: selectedVersion!,
                    build: selectedBuild!,
                    onProgress: setInstall,
                });
            }

            setOutcome('success');
            setTimeout(() => history.push(`/server/${server!.id}`), 1500);
        } catch (error) {
            const message = (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message;
            if (phase !== 'install') setHeadState(phase, 'failed', message);
            setOutcome('failed');
        }
    };

    if (config === undefined) {
        return (
            <PageContentBlock title={'Create server'}>
                <Spinner centered size={'large'} />
            </PageContentBlock>
        );
    }

    if (!config || !config.canCreate) {
        return (
            <PageContentBlock title={'Create server'}>
                <Card>
                    <p css={tw`text-lg font-semibold text-neutral-50`}>You can&apos;t create a server right now</p>
                    <p css={tw`mt-1 text-sm text-neutral-400`}>
                        {config && config.maxServers > 0 && config.owned >= config.maxServers
                            ? `You already have ${config.owned} of ${config.maxServers} servers allowed on your account.`
                            : 'Creating servers is not enabled on this panel.'}
                    </p>
                    <Button css={tw`mt-5`} isSecondary onClick={() => history.push('/')}>
                        Back to servers
                    </Button>
                </Card>
            </PageContentBlock>
        );
    }

    if (running) {
        const steps = [
            ...head,
            ...(install.length
                ? install
                : [
                      {
                          key: 'install',
                          label:
                              source === 'modpack'
                                  ? `Installing ${pack?.title}`
                                  : `Installing ${software.name} ${selectedVersion?.id || ''}`,
                          state: 'pending',
                      } as ProgressStep,
                  ]),
        ];

        return (
            <PageContentBlock title={'Create server'}>
                <div css={tw`max-w-2xl mx-auto`}>
                    <Card>
                        <h2 css={tw`text-xl mb-1`}>
                            {outcome === 'success'
                                ? 'Your server is ready'
                                : outcome === 'failed'
                                ? 'Something went wrong'
                                : `Setting up ${name}...`}
                        </h2>
                        <p css={tw`text-sm text-neutral-400 mb-6`}>
                            {outcome === 'success'
                                ? 'Taking you to your new server.'
                                : 'This usually takes a minute or two. You can keep this page open.'}
                        </p>
                        <ul css={tw`space-y-3`}>
                            {steps.map((s) => (
                                <StepRow key={s.key} step={s} />
                            ))}
                        </ul>
                        {outcome && (
                            <div css={tw`mt-8 flex justify-end space-x-3`}>
                                {outcome === 'failed' && (
                                    <>
                                        {created && (
                                            <Button isSecondary onClick={() => history.push(`/server/${created.id}`)}>
                                                Open server anyway
                                            </Button>
                                        )}
                                        <Button onClick={start}>Try again</Button>
                                    </>
                                )}
                                {outcome === 'success' && created && (
                                    <Button onClick={() => history.push(`/server/${created.id}`)}>Open server</Button>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            </PageContentBlock>
        );
    }

    return (
        <PageContentBlock title={'Create server'}>
            <div css={tw`max-w-3xl mx-auto`}>
                <div css={tw`mb-6`}>
                    <h1 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>Create a new server</h1>
                    <p css={tw`mt-1 text-neutral-400`}>Pick your software and version, we handle the rest.</p>
                </div>
                <Stepper step={step} />
                <FlashMessageRender byKey={'create'} css={tw`mb-4`} />

                {step === 0 && (
                    <div css={tw`space-y-4`}>
                        <Card>
                            <Label htmlFor={'server-name'}>Server name</Label>
                            <Input
                                id={'server-name'}
                                type={'text'}
                                value={name}
                                maxLength={191}
                                placeholder={'My survival world'}
                                autoFocus
                                onChange={(e) => setName(e.currentTarget.value)}
                            />
                        </Card>
                        <Card>
                            <div css={tw`flex flex-wrap items-center justify-between gap-2 mb-4`}>
                                <p css={tw`text-base font-semibold text-neutral-50`}>
                                    {source === 'modpack' ? 'Choose a modpack' : 'Choose your software'}
                                </p>
                                <Button
                                    type={'button'}
                                    isSecondary
                                    size={'xsmall'}
                                    onClick={() => setSource(source === 'modpack' ? 'software' : 'modpack')}
                                >
                                    {source === 'modpack' ? 'Use regular software instead' : 'Use a modpack instead'}
                                </Button>
                            </div>
                            {source === 'modpack' ? (
                                <ModpackSearch selectedId={pack?.project_id} actionLabel={'Select'} onPick={setPack} />
                            ) : (
                                <SoftwareGrid type={type} onChange={setType} />
                            )}
                        </Card>
                    </div>
                )}

                {step === 1 && source === 'modpack' && (
                    <Card>
                        <p css={tw`text-base font-semibold text-neutral-50 mb-4`}>{pack?.title} version</p>
                        {packVersions.error ? (
                            <p css={tw`text-sm text-red-600`}>{packVersions.error}</p>
                        ) : !packVersions.versions ? (
                            <Spinner centered size={'base'} />
                        ) : packVersions.versions.length === 0 ? (
                            <p css={tw`text-sm text-neutral-300`}>
                                This modpack has no versions that can be installed.
                            </p>
                        ) : (
                            <>
                                <Label htmlFor={'pack-version'}>Version</Label>
                                <Select
                                    id={'pack-version'}
                                    value={packVersionId}
                                    onChange={(e) => setPackVersionId(e.currentTarget.value)}
                                >
                                    {packVersions.versions.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {describeVersion(v)}
                                        </option>
                                    ))}
                                </Select>
                                <p css={tw`mt-3 text-xs text-neutral-400`}>
                                    The matching server software and all mods meant for servers are installed
                                    automatically.
                                </p>
                            </>
                        )}
                    </Card>
                )}

                {step === 1 && source === 'software' && (
                    <Card>
                        <VersionFields title={`${software.name} version`} selection={selection} />
                        {selectedVersion && (
                            <div css={tw`mt-4 flex flex-wrap items-center gap-2 text-xs`}>
                                <span css={tw`rounded-full bg-primary-50 text-primary-700 px-3 py-1 font-medium`}>
                                    Requires Java {selectedVersion.java}
                                </span>
                                {selectedBuild?.changes?.[0] && (
                                    <span css={tw`text-neutral-400 truncate`}>{selectedBuild.changes[0]}</span>
                                )}
                            </div>
                        )}
                    </Card>
                )}

                {step === 2 && (
                    <Card>
                        <p css={tw`text-base font-semibold text-neutral-50`}>Choose a node</p>
                        <p css={tw`text-sm text-neutral-400 mt-1 mb-4`}>
                            The ping is measured from your browser, a lower number means less lag for you.
                        </p>
                        {!config.nodes.length ? (
                            <p css={tw`text-sm text-neutral-300`}>
                                The best available node is picked for you automatically.
                            </p>
                        ) : (
                            <div css={tw`space-y-3`}>
                                {[...config.nodes]
                                    .sort((a, b) => (pings[a.id] ?? 99999) - (pings[b.id] ?? 99999))
                                    .map((node) => {
                                        const ok = fits(node, specs);
                                        const ms = pings[node.id];

                                        return (
                                            <button
                                                key={node.id}
                                                type={'button'}
                                                disabled={!ok}
                                                onClick={() => setNodeId(node.id)}
                                                className={classNames(
                                                    'flex w-full items-center text-left rounded-xl border p-4 transition-all duration-150 bg-white',
                                                    node.id === nodeId
                                                        ? 'border-primary-600 ring-4 ring-primary-600/10 shadow-md'
                                                        : 'border-neutral-500 hover:border-neutral-400',
                                                    !ok && 'opacity-50 cursor-not-allowed'
                                                )}
                                            >
                                                <span
                                                    css={tw`flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0`}
                                                >
                                                    <LocationMarkerIcon css={tw`w-5 h-5`} />
                                                </span>
                                                <span css={tw`ml-4 flex-1 min-w-0`}>
                                                    <span
                                                        css={tw`block text-sm font-semibold text-neutral-50 truncate`}
                                                    >
                                                        {node.name}
                                                        {node.location && (
                                                            <span css={tw`ml-2 text-xs font-normal text-neutral-400`}>
                                                                {node.location}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span css={tw`block text-xs text-neutral-400 mt-0.5`}>
                                                        {ok
                                                            ? `${bytesToString(
                                                                  mbToBytes(node.memoryFree)
                                                              )} memory and ${bytesToString(
                                                                  mbToBytes(node.diskFree)
                                                              )} disk free`
                                                            : node.freeAllocations < 1
                                                            ? 'No free ports on this node'
                                                            : 'Not enough free resources for your specs'}
                                                    </span>
                                                </span>
                                                <span
                                                    className={classNames(
                                                        'ml-3 rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0',
                                                        ms === undefined && 'bg-neutral-600 text-neutral-400',
                                                        ms === null && 'bg-neutral-600 text-neutral-400',
                                                        typeof ms === 'number' &&
                                                            ms < 60 &&
                                                            'bg-green-50 text-green-700',
                                                        typeof ms === 'number' &&
                                                            ms >= 60 &&
                                                            ms < 150 &&
                                                            'bg-yellow-50 text-yellow-700',
                                                        typeof ms === 'number' && ms >= 150 && 'bg-red-50 text-red-700'
                                                    )}
                                                >
                                                    {ms === undefined
                                                        ? 'Pinging...'
                                                        : ms === null
                                                        ? 'No ping'
                                                        : `${ms} ms`}
                                                </span>
                                            </button>
                                        );
                                    })}
                            </div>
                        )}
                    </Card>
                )}

                {step === 3 &&
                    ((source === 'software' && selectedVersion && selectedBuild) ||
                        (source === 'modpack' && pack && packVersion)) && (
                        <Card>
                            <div css={tw`flex items-center`}>
                                <img
                                    src={source === 'modpack' ? pack?.icon_url || iconFor('FABRIC') : iconFor(type)}
                                    alt={''}
                                    css={tw`w-14 h-14 rounded-xl bg-neutral-600 object-contain p-1.5 flex-shrink-0`}
                                />
                                <div css={tw`ml-4 min-w-0`}>
                                    <p css={tw`text-xl font-semibold text-neutral-50 truncate`}>{name}</p>
                                    <p css={tw`text-sm text-neutral-400`}>
                                        {source === 'modpack'
                                            ? `${pack?.title} ${packVersion?.version_number}`
                                            : `${software.name} ${selectedVersion?.id} · ${
                                                  selectedBuild ? buildLabel(selectedBuild) : ''
                                              }`}
                                    </p>
                                    {selectedNode && (
                                        <p css={tw`text-sm text-neutral-400`}>
                                            Node {selectedNode.name}
                                            {typeof pings[selectedNode.id] === 'number'
                                                ? ` · ${pings[selectedNode.id]} ms`
                                                : ''}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div css={tw`mt-6 flex items-center justify-between`}>
                                <p css={tw`text-sm font-semibold text-neutral-50`}>Resources</p>
                                <Button
                                    type={'button'}
                                    isSecondary
                                    size={'xsmall'}
                                    onClick={() => setEditingSpecs((v) => !v)}
                                >
                                    <AdjustmentsIcon css={tw`w-4 h-4 mr-1.5`} />
                                    {editingSpecs ? 'Done' : 'Edit specs'}
                                </Button>
                            </div>
                            {specs && !editingSpecs && (
                                <dl css={tw`mt-3 grid grid-cols-3 gap-3`}>
                                    {[
                                        ['Memory', bytesToString(mbToBytes(specs.memory))],
                                        ['Disk', bytesToString(mbToBytes(specs.disk))],
                                        ['CPU', `${specs.cpu}%`],
                                    ].map(([label, value]) => (
                                        <div
                                            key={label}
                                            css={tw`rounded-xl bg-neutral-900 border border-neutral-500 p-4`}
                                        >
                                            <dt css={tw`text-2xs uppercase tracking-wide text-neutral-400`}>{label}</dt>
                                            <dd css={tw`mt-1 text-lg font-semibold text-neutral-50`}>{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            {specs && editingSpecs && (
                                <div css={tw`mt-4 space-y-6 rounded-xl bg-neutral-900 border border-neutral-500 p-5`}>
                                    <Slider
                                        label={'Memory'}
                                        value={specs.memory}
                                        min={512}
                                        max={config.max.memory}
                                        step={256}
                                        display={bytesToString(mbToBytes(specs.memory))}
                                        hint={`up to ${bytesToString(mbToBytes(config.max.memory))}`}
                                        onChange={(memory) => setSpecs({ ...specs, memory })}
                                    />
                                    <Slider
                                        label={'Disk'}
                                        value={specs.disk}
                                        min={1024}
                                        max={config.max.disk}
                                        step={1024}
                                        display={bytesToString(mbToBytes(specs.disk))}
                                        hint={`up to ${bytesToString(mbToBytes(config.max.disk))}`}
                                        onChange={(disk) => setSpecs({ ...specs, disk })}
                                    />
                                    <Slider
                                        label={'CPU'}
                                        value={specs.cpu}
                                        min={50}
                                        max={config.max.cpu}
                                        step={50}
                                        display={`${specs.cpu}% (${(specs.cpu / 100).toFixed(1)} cores)`}
                                        hint={`up to ${config.max.cpu}%, 100% is one core`}
                                        onChange={(cpu) => setSpecs({ ...specs, cpu })}
                                    />
                                    <Button
                                        type={'button'}
                                        isSecondary
                                        size={'xsmall'}
                                        onClick={() => setSpecs(config.limits)}
                                    >
                                        Reset to defaults
                                    </Button>
                                </div>
                            )}
                            {!nodeFits && (
                                <p
                                    css={tw`mt-4 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800`}
                                >
                                    {selectedNode?.name || 'The selected node'} doesn&apos;t have room for these specs.
                                    Lower them or go back and pick another node.
                                </p>
                            )}
                            <p css={tw`mt-4 text-xs text-neutral-400`}>
                                The server is created on {selectedNode ? selectedNode.name : 'the best available node'}{' '}
                                and installed automatically.
                                {source === 'software' && selectedVersion
                                    ? ` Java ${selectedVersion.java} will be used when your host offers it.`
                                    : ' The Java version the modpack needs is picked automatically.'}
                            </p>
                        </Card>
                    )}

                <div css={tw`mt-6 flex items-center justify-between`}>
                    <Button
                        isSecondary
                        type={'button'}
                        onClick={() => (step === 0 ? history.push('/') : setStep(step - 1))}
                    >
                        <ArrowLeftIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                        {step === 0 ? 'Cancel' : 'Back'}
                    </Button>
                    {step < 3 ? (
                        <Button type={'button'} disabled={!canContinue} onClick={() => setStep(step + 1)}>
                            Continue
                            <ArrowRightIcon css={tw`w-4 h-4 ml-2 -mr-1`} />
                        </Button>
                    ) : (
                        <Button type={'button'} color={'green'} disabled={!nodeFits} onClick={start}>
                            Create server
                        </Button>
                    )}
                </div>
            </div>
        </PageContentBlock>
    );
};
