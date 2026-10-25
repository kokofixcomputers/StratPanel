import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, ScaleIcon, ServerIcon, TrashIcon, ArrowRightIcon } from '@heroicons/react/outline';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Spinner from '@/components/elements/Spinner';
import Slider from '@/components/elements/Slider';
import Input from '@/components/elements/Input';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import { ServerContext } from '@/state/server';
import useFlash from '@/plugins/useFlash';
import { divideServer, removePart, Share, splitServer, SplitPart, useSplit } from '@/api/server/split';
import { Draft, formatAmount, isDirty, mostFor, Resource, RESOURCES, setShare, toDraft } from '@/lib/split';

const LABELS: Record<Resource, string> = { memory: 'Memory', disk: 'Disk space', cpu: 'CPU' };
const STEPS: Record<Resource, number> = { memory: 256, disk: 512, cpu: 10 };
// One colour per part, the same in the bars and next to the names.
const COLORS = ['bg-primary-600', 'bg-green-500', 'bg-yellow-500', 'bg-red-400', 'bg-blue-400', 'bg-purple-400'];
const color = (index: number) => COLORS[index % COLORS.length];

/** Splitting a server into parts that share its memory, disk and CPU, and moving those between the parts. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();
    const { data, error, mutate } = useSplit();
    const [draft, setDraft] = useState<Draft>({});
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState<SplitPart | null>(null);
    const [name, setName] = useState('');
    const [share, setNewShare] = useState<Share>({ memory: 1024, disk: 2048, cpu: 50 });

    useEffect(() => {
        clearAndAddHttpError({ key: 'split', error });
    }, [error]);

    // A fresh state from the panel (loaded, saved, a part added or removed) replaces what was being edited.
    useEffect(() => {
        if (data) setDraft(toDraft(data.parts));
    }, [data]);

    const parts = data?.parts ?? [];
    const root = data?.root ?? '';
    const ready = !!data && parts.every((part) => !!draft[part.uuid]);
    const dirty = ready && isDirty(draft, parts);
    const rootPart = parts.find((part) => part.isRoot);

    const run = (action: Promise<any>, done: string) => {
        clearFlashes('split');
        setSaving(true);

        return action
            .then((state) => {
                addFlash({ key: 'split', type: 'success', title: 'Done', message: done });

                return mutate(state, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'split', error: e }))
            .then(() => setSaving(false));
    };

    const save = () =>
        run(
            divideServer(
                uuid,
                parts.map((part) => ({ uuid: part.uuid, ...draft[part.uuid] }))
            ),
            'The resources are divided as shown.'
        );

    const confirmRemoval = () => {
        const part = removing;
        if (!part) return;
        setRemoving(null);
        run(removePart(uuid, part.uuid), `${part.name} was deleted, its resources went back to ${rootPart?.name}.`);
    };

    if (!data || !ready) {
        return (
            <ServerContentBlock title={'Split'}>
                <PageHeader title={'Split'} />
                <FlashMessageRender byKey={'split'} css={tw`mb-4`} />
                <Spinner size={'large'} centered />
            </ServerContentBlock>
        );
    }

    // What the first server can spare for a new part, and whether that is enough for the least a part has.
    const most = (key: Resource) => (rootPart ? rootPart[key] : 0) - data.minimum[key];
    const roomToAdd = RESOURCES.every((key) => most(key) >= data.minimum[key]);
    const canAdd = data.canManage && data.splittable && parts.length < data.maxParts;
    const fitted = (key: Resource) => Math.min(Math.max(share[key], data.minimum[key]), most(key));

    return (
        <ServerContentBlock title={'Split'}>
            <PageHeader
                title={'Split'}
                subtitle={
                    'Share the memory, disk space and CPU of this server between several servers, and move it from one to the other whenever you like'
                }
            />
            <FlashMessageRender byKey={'split'} css={tw`mb-4`} />
            <Dialog.Confirm
                open={!!removing}
                title={`Delete ${removing?.name ?? ''}`}
                confirm={'Delete it'}
                onConfirmed={confirmRemoval}
                onClose={() => setRemoving(null)}
            >
                {removing?.name} is deleted with its files and everything on it. What it had of memory, disk space and
                CPU goes back to {rootPart?.name}.
            </Dialog.Confirm>
            {data.isPart && rootPart && (
                <p css={tw`mb-4 text-sm text-neutral-300`}>
                    This server is a part of{' '}
                    <Link to={`/server/${rootPart.uuid}/split`} css={tw`text-primary-400 hover:underline`}>
                        {rootPart.name}
                    </Link>
                    , it shares its resources.
                </p>
            )}
            {!data.splittable && !data.isPart && parts.length < 2 ? (
                <EmptyState>
                    This server has no limit on memory, disk space or CPU (0 means no limit), so there is nothing to
                    share. An administrator can give it a limit.
                </EmptyState>
            ) : (
                <>
                    <ListHeader icon={<ScaleIcon css={tw`h-6 w-6`} />} title={'Shared'} count={`${parts.length} parts`}>
                        {data.canManage && dirty && (
                            <>
                                <Button
                                    type={'button'}
                                    variant={Button.Variants.Secondary}
                                    disabled={saving}
                                    onClick={() => setDraft(toDraft(parts))}
                                >
                                    Reset
                                </Button>
                                <Button type={'button'} disabled={saving} onClick={save}>
                                    Save
                                </Button>
                            </>
                        )}
                    </ListHeader>
                    <GreyRowBox css={tw`mb-4 flex-col items-stretch gap-4`} $hoverable={false}>
                        {RESOURCES.map((key) => (
                            <div key={key}>
                                <div css={tw`mb-1 flex items-baseline justify-between text-sm`}>
                                    <span css={tw`font-medium text-neutral-200`}>{LABELS[key]}</span>
                                    <span css={tw`text-neutral-400`}>
                                        {formatAmount(key, data.total[key])} together
                                    </span>
                                </div>
                                <div css={tw`flex h-3 overflow-hidden rounded-full bg-neutral-600`}>
                                    {parts.map((part, index) => (
                                        <div
                                            key={part.uuid}
                                            className={color(index)}
                                            style={{ width: `${(draft[part.uuid][key] / data.total[key]) * 100}%` }}
                                            title={`${part.name}: ${formatAmount(key, draft[part.uuid][key])}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </GreyRowBox>
                    {parts.map((part, index) => (
                        <GreyRowBox key={part.uuid} css={tw`mb-3 flex-col items-stretch gap-4`} $hoverable={false}>
                            <div css={tw`flex flex-wrap items-center gap-3`}>
                                <span className={`h-3 w-3 flex-shrink-0 rounded-full ${color(index)}`} />
                                <ServerIcon css={tw`h-5 w-5 flex-shrink-0 text-neutral-300`} />
                                <p css={tw`min-w-0 flex-1 truncate text-sm font-medium`}>
                                    {part.name}
                                    <span css={tw`ml-2 text-xs font-normal text-neutral-400`}>
                                        {part.isRoot ? 'keeps the rest' : 'part'}
                                        {part.uuid === data.current ? ' · this server' : ''}
                                    </span>
                                </p>
                                {part.uuid !== data.current && (
                                    <Link to={`/server/${part.uuid}`}>
                                        <Button
                                            type={'button'}
                                            size={Button.Sizes.Small}
                                            variant={Button.Variants.Secondary}
                                        >
                                            Open <ArrowRightIcon css={tw`ml-1 h-4 w-4`} />
                                        </Button>
                                    </Link>
                                )}
                                {data.canManage && !part.isRoot && (
                                    <Button.Danger
                                        type={'button'}
                                        size={Button.Sizes.Small}
                                        variant={Button.Variants.Secondary}
                                        disabled={saving}
                                        onClick={() => setRemoving(part)}
                                    >
                                        <TrashIcon css={tw`mr-1 h-4 w-4`} /> Delete
                                    </Button.Danger>
                                )}
                            </div>
                            {part.isRoot || !data.canManage ? (
                                <div css={tw`grid gap-2 text-sm text-neutral-300 sm:grid-cols-3`}>
                                    {RESOURCES.map((key) => (
                                        <p key={key}>
                                            {LABELS[key]}:{' '}
                                            <span css={tw`font-semibold text-neutral-50`}>
                                                {formatAmount(key, draft[part.uuid][key])}
                                            </span>
                                        </p>
                                    ))}
                                </div>
                            ) : (
                                <div css={tw`grid gap-4 sm:grid-cols-3`}>
                                    {RESOURCES.map((key) => (
                                        <Slider
                                            key={key}
                                            label={LABELS[key]}
                                            value={draft[part.uuid][key]}
                                            min={data.minimum[key]}
                                            max={Math.max(
                                                data.minimum[key] + STEPS[key],
                                                mostFor(draft, root, part.uuid, key, data.minimum)
                                            )}
                                            step={STEPS[key]}
                                            display={formatAmount(key, draft[part.uuid][key])}
                                            hint={`${rootPart?.name} keeps ${formatAmount(key, draft[root][key])}`}
                                            onChange={(value) =>
                                                setDraft((now) =>
                                                    setShare(now, root, part.uuid, key, value, data.minimum)
                                                )
                                            }
                                        />
                                    ))}
                                </div>
                            )}
                        </GreyRowBox>
                    ))}
                </>
            )}
            {canAdd && (
                <>
                    <ListHeader icon={<PlusIcon css={tw`h-6 w-6`} />} title={'Split off a part'} css={tw`mt-6`} />
                    <GreyRowBox css={tw`flex-col items-stretch gap-4`} $hoverable={false}>
                        {dirty ? (
                            <p css={tw`text-sm text-neutral-300`}>Save or reset the changes above first.</p>
                        ) : !roomToAdd ? (
                            <p css={tw`text-sm text-neutral-300`}>
                                {rootPart?.name} has too little left to give a part the least it needs. Take some back
                                from another part first.
                            </p>
                        ) : (
                            <>
                                <div>
                                    <label
                                        css={tw`mb-1 block text-sm font-medium text-neutral-200`}
                                        htmlFor={'part-name'}
                                    >
                                        Name
                                    </label>
                                    <Input
                                        id={'part-name'}
                                        value={name}
                                        maxLength={191}
                                        placeholder={'Lobby'}
                                        onChange={(e) => setName(e.currentTarget.value)}
                                    />
                                </div>
                                <div css={tw`grid gap-4 sm:grid-cols-3`}>
                                    {RESOURCES.map((key) => (
                                        <Slider
                                            key={key}
                                            label={LABELS[key]}
                                            value={fitted(key)}
                                            min={data.minimum[key]}
                                            max={Math.max(data.minimum[key] + STEPS[key], most(key))}
                                            step={STEPS[key]}
                                            display={formatAmount(key, fitted(key))}
                                            hint={`${rootPart?.name} keeps ${formatAmount(
                                                key,
                                                (rootPart?.[key] ?? 0) - fitted(key)
                                            )}`}
                                            onChange={(next) => setNewShare((now) => ({ ...now, [key]: next }))}
                                        />
                                    ))}
                                </div>
                                <div css={tw`flex justify-end`}>
                                    <Button
                                        type={'button'}
                                        disabled={saving || name.trim().length === 0}
                                        onClick={() =>
                                            run(
                                                splitServer(uuid, name.trim(), {
                                                    memory: fitted('memory'),
                                                    disk: fitted('disk'),
                                                    cpu: fitted('cpu'),
                                                }),
                                                `${name.trim()} was split off.`
                                            ).then(() => setName(''))
                                        }
                                    >
                                        <PlusIcon css={tw`mr-1 h-4 w-4`} /> Split off
                                    </Button>
                                </div>
                            </>
                        )}
                    </GreyRowBox>
                </>
            )}
        </ServerContentBlock>
    );
};
