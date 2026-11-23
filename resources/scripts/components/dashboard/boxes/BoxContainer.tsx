import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, RefreshIcon, ServerIcon } from '@heroicons/react/solid';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Sensitive from '@/components/elements/Sensitive';
import useFlash from '@/plugins/useFlash';
import { BoxDetail, BoxServer, createBoxServer, resizeBoxServer, useBox } from '@/api/boxes';
import { checkout, useStore } from '@/api/store';
import { formatMoney, periodLabel, Share, SHARE_KEYS, shareText } from '@/lib/store';
import BoxMeters from '@/components/dashboard/boxes/BoxMeters';
import BoxStatus from '@/components/dashboard/boxes/BoxStatus';
import ShareSliders from '@/components/dashboard/boxes/ShareSliders';

const first = (box: BoxDetail): Share => {
    // A sensible start: a quarter of what is left, or all of it when little is.
    const pick = (key: keyof Share, step: number) =>
        Math.max(
            box.minimum[key],
            Math.min(box.remaining[key], Math.floor(box.remaining[key] / 4 / step) * step || box.remaining[key])
        );

    return {
        memory: pick('memory', 256),
        disk: pick('disk', 1024),
        cpu: pick('cpu', 50),
        allocations: Math.max(1, Math.min(box.remaining.allocations, 1)),
        backups: Math.min(box.remaining.backups, 1),
        databases: 0,
    };
};

/** One box: what it holds, the servers in it with the share each has, and making and resizing servers inside it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: box, mutate, error } = useBox(id);
    const store = useStore().data;
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [resizing, setResizing] = useState<BoxServer | null>(null);
    const [share, setShare] = useState<Share | null>(null);
    const [name, setName] = useState('');
    const [node, setNode] = useState('');
    const [busy, setBusy] = useState(false);
    const [paying, setPaying] = useState(false);

    if (!box) {
        return (
            <PageContentBlock title={'Box'}>
                {error ? (
                    <p className={'mt-6 text-sm text-red-600'}>This box could not be opened.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </PageContentBlock>
        );
    }

    const run = (work: Promise<BoxDetail>, done: () => void) => {
        clearFlashes('box');
        setBusy(true);
        work.then((next) => {
            mutate(next, false);
            done();
        })
            .catch((e) => clearAndAddHttpError({ key: 'box', error: e }))
            .then(() => setBusy(false));
    };

    const openCreate = () => {
        setShare(first(box));
        setName('');
        setNode(box.node ? String(box.node.id) : '');
        setCreating(true);
    };

    const renew = (provider: string) => {
        if (!box.renew) return;
        clearFlashes('box');
        setPaying(true);
        checkout(box.renew.package, provider, { box: box.id })
            .then((url) => {
                window.location.href = url;
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'box', error: e });
                setPaying(false);
            });
    };

    return (
        <PageContentBlock title={box.name}>
            <div className={'mt-6'}>
                <Link
                    to={'/boxes'}
                    className={'mb-3 inline-flex items-center text-sm text-neutral-300 hover:text-neutral-100'}
                >
                    <ArrowLeftIcon className={'mr-1 h-4 w-4'} />
                    All boxes
                </Link>
                <div className={'flex flex-wrap items-start justify-between gap-3'}>
                    <PageHeader
                        title={box.name}
                        subtitle={`${box.servers} ${box.servers === 1 ? 'server' : 'servers'}${
                            box.node ? ` on ${box.node.name}` : ''
                        }${box.owner ? ` · owned by ${box.owner.username}` : ''}`}
                        className={'mb-0'}
                    />
                    <BoxStatus box={box} detail />
                </div>
            </div>
            <FlashMessageRender byKey={'box'} className={'mb-4'} />

            {box.status !== 'active' && (
                <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800'}>
                    {box.status === 'expired'
                        ? 'This box ran out, its servers are stopped. Renew it to use it again.'
                        : 'This box was suspended by an administrator, its servers are stopped.'}
                </p>
            )}

            {box.renew && store && store.providers.length > 0 && (
                <div
                    className={
                        'mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white p-4 shadow-md'
                    }
                >
                    <RefreshIcon className={'h-5 w-5 text-primary-600'} />
                    <p className={'flex-1 text-sm text-neutral-200'}>
                        Renew for {formatMoney(box.renew.price, box.renew.currency)} per{' '}
                        {periodLabel(box.renew.period_days)}. The time is added to what is left.
                    </p>
                    {store.providers.map((provider) => (
                        <Button
                            key={provider.id}
                            size={Button.Sizes.Small}
                            disabled={paying}
                            onClick={() => renew(provider.id)}
                        >
                            {provider.name}
                        </Button>
                    ))}
                </div>
            )}

            <div className={'mb-6'}>
                <BoxMeters limits={box.limits} used={box.used} />
                <p className={'mt-2 text-xs text-neutral-400'}>
                    The bars show how much of the box the servers in it have been given.
                </p>
            </div>

            <div className={'mb-3 flex flex-wrap items-center justify-between gap-3'}>
                <h2 className={'text-lg font-semibold text-neutral-50'}>Servers in this box</h2>
                <Button onClick={openCreate} disabled={!box.can_create}>
                    <PlusIcon className={'mr-2 -ml-1 h-4 w-4'} />
                    Create a server
                </Button>
            </div>
            {box.servers_list.length === 0 ? (
                <EmptyState>Nothing in this box yet. Make a server and choose how much of the box it gets.</EmptyState>
            ) : (
                <div className={'space-y-2'}>
                    {box.servers_list.map((server) => (
                        <div
                            key={server.uuid}
                            className={
                                'flex flex-wrap items-center gap-4 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-md'
                            }
                        >
                            <span
                                className={
                                    'flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                                }
                            >
                                <ServerIcon className={'h-5 w-5'} />
                            </span>
                            <div className={'min-w-[10rem] flex-1'}>
                                <Link
                                    to={`/server/${server.id}`}
                                    className={'text-sm font-semibold text-neutral-50 hover:text-primary-600'}
                                >
                                    {server.name}
                                </Link>
                                <p className={'text-xs text-neutral-400'}>
                                    {server.node}
                                    {server.address && (
                                        <>
                                            {' · '}
                                            <Sensitive>{server.address}</Sensitive>
                                        </>
                                    )}
                                    {server.status ? ` · ${server.status}` : ''}
                                </p>
                            </div>
                            <p className={'text-xs text-neutral-300'}>
                                {SHARE_KEYS.slice(0, 4)
                                    .map(
                                        (key) =>
                                            `${shareText(key, server.limits[key])}${
                                                key === 'allocations' ? ' ports' : ''
                                            }`
                                    )
                                    .join(' · ')}
                            </p>
                            <Button.Text
                                disabled={box.status !== 'active'}
                                onClick={() => {
                                    setResizing(server);
                                    setShare(server.limits);
                                }}
                            >
                                Resources
                            </Button.Text>
                        </div>
                    ))}
                </div>
            )}

            <Dialog
                open={creating}
                onClose={() => setCreating(false)}
                title={'Create a server'}
                description={`Choose how much of ${box.name} this server gets. You can change it later.`}
            >
                <div className={'space-y-4'}>
                    <div>
                        <Label>Name</Label>
                        <Input
                            value={name}
                            maxLength={191}
                            onChange={(e) => setName(e.currentTarget.value)}
                            placeholder={'Survival'}
                        />
                    </div>
                    {!box.node && box.nodes.length > 0 && (
                        <div>
                            <Label>Node</Label>
                            <Select value={node} onChange={(e) => setNode(e.currentTarget.value)}>
                                <option value={''}>Any node with room</option>
                                {box.nodes.map((n) => (
                                    <option key={n.id} value={n.id}>
                                        {n.name}
                                        {n.location ? ` (${n.location})` : ''}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                    {share && <ShareSliders value={share} min={box.minimum} max={box.remaining} onChange={setShare} />}
                </div>
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button
                        disabled={busy || !name.trim() || !share}
                        onClick={() =>
                            share &&
                            run(
                                createBoxServer(box.id, {
                                    ...share,
                                    name: name.trim(),
                                    node_id: node ? Number(node) : null,
                                }),
                                () => setCreating(false)
                            )
                        }
                    >
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog
                open={!!resizing}
                onClose={() => setResizing(null)}
                title={resizing ? `Resources of ${resizing.name}` : ''}
                description={'What this server may use of the box. What you take away goes back to the box.'}
            >
                {resizing && share && (
                    <ShareSliders
                        value={share}
                        min={box.minimum}
                        max={
                            Object.fromEntries(
                                SHARE_KEYS.map((key) => [key, box.remaining[key] + resizing.limits[key]])
                            ) as unknown as Share
                        }
                        onChange={setShare}
                    />
                )}
                <Dialog.Footer>
                    <Button.Text onClick={() => setResizing(null)}>Cancel</Button.Text>
                    <Button
                        disabled={busy || !share}
                        onClick={() =>
                            resizing &&
                            share &&
                            run(resizeBoxServer(box.id, resizing.uuid, share), () => setResizing(null))
                        }
                    >
                        Save
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </PageContentBlock>
    );
};
