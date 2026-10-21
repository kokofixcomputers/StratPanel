import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    ExclamationIcon,
    InformationCircleIcon,
    MenuIcon,
    PlusIcon,
    ShieldExclamationIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import { Button } from '@/components/elements/button/index';
import { Row, Segmented, Switch, Toggle } from '@/components/admin/theme/controls';
import { EggInfo } from '@/components/admin/theme/BannersEditor';
import { Announcement, BrandingData } from '@/components/admin/theme/BrandingPanels';
import { PLACES } from '@/lib/branding';
import { SOFTWARE } from '@/lib/mcjars';

const field = 'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100';

const TYPES: Record<
    Announcement['type'],
    { label: string; box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    info: {
        label: 'Info',
        box: 'border-blue-200 bg-blue-50 text-blue-900',
        icon: 'text-blue-500',
        Icon: InformationCircleIcon,
    },
    success: {
        label: 'Success',
        box: 'border-green-200 bg-green-50 text-green-900',
        icon: 'text-green-500',
        Icon: CheckCircleIcon,
    },
    warning: {
        label: 'Warning',
        box: 'border-yellow-200 bg-yellow-50 text-yellow-900',
        icon: 'text-yellow-500',
        Icon: ExclamationIcon,
    },
    danger: {
        label: 'Danger',
        box: 'border-red-200 bg-red-50 text-red-900',
        icon: 'text-red-500',
        Icon: ShieldExclamationIcon,
    },
};

const SOFTWARE_CHOICES = [{ type: 'VANILLA', name: 'Vanilla' }, ...SOFTWARE];

const BLANK: Announcement = {
    id: '',
    title: '',
    message: '',
    type: 'info',
    enabled: true,
    dismissible: true,
    link_label: '',
    link_url: '',
    where: ['dashboard'],
    eggs: [],
    software: [],
    nodes: [],
};

/** A choice among many that can be on together, drawn as chips. */
const Chips = <T extends string | number>({
    options,
    value,
    onChange,
    empty,
}: {
    options: { value: T; label: string }[];
    value: T[];
    onChange: (value: T[]) => void;
    empty: string;
}) =>
    options.length === 0 ? (
        <p className={'text-xs text-neutral-400'}>{empty}</p>
    ) : (
        <div className={'flex flex-wrap gap-1.5'}>
            {options.map((option) => {
                const on = value.includes(option.value);

                return (
                    <button
                        key={String(option.value)}
                        type={'button'}
                        aria-pressed={on}
                        onClick={() =>
                            onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])
                        }
                        className={classNames(
                            'rounded-full border px-3 py-1 text-xs transition-colors',
                            on
                                ? 'border-primary-600 bg-primary-50 font-medium text-primary-700'
                                : 'border-neutral-500 text-neutral-300 hover:bg-neutral-600'
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );

/** What decides who sees an announcement, in a few words for the card. */
const summary = (a: Announcement, eggs: EggInfo[], places = PLACES): string[] => {
    const out = [
        places
            .filter((p) => a.where.includes(p.id))
            .map((p) => ({ dashboard: 'Dashboard', server: 'Inside servers', account: 'Account settings' }[p.id]))
            .join(', ') || 'Dashboard',
    ];
    if (a.eggs.length) out.push(a.eggs.map((id) => eggs.find((e) => e.id === id)?.name ?? `Egg ${id}`).join(', '));
    if (a.software.length)
        out.push(a.software.map((t) => SOFTWARE_CHOICES.find((s) => s.type === t)?.name ?? t).join(', '));
    if (a.nodes.length) out.push(`Node ${a.nodes.join(', ')}`);

    return out;
};

/**
 * All the announcements on a page of their own: a card for each, in the order they are shown (drag them to change it), switched on and off
 * on the card itself. Opening a card shows everything of it: the text, where it is shown and who it is for. Saved by one button, apart from the theme.
 */
export default ({ data, eggs, onSaved }: { data: BrandingData; eggs: EggInfo[] | null; onSaved: () => void }) => {
    const [items, setItems] = useState<Announcement[]>(data.announcements);
    const [open, setOpen] = useState<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const [nodes, setNodes] = useState<{ id: number; name: string }[] | null>(null);
    const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({
        busy: false,
        message: null,
        error: false,
    });
    const saved = useMemo(() => JSON.stringify(data.announcements), [data.announcements]);
    const dirty = JSON.stringify(items) !== saved;

    useEffect(() => {
        http.get('/api/client/theme/nodes')
            .then(({ data: list }) => setNodes(list))
            .catch(() => setNodes([]));
    }, []);

    const change = (i: number, changes: Partial<Announcement>) =>
        setItems(items.map((a, at) => (at === i ? { ...a, ...changes } : a)));
    const move = (from: number, to: number) => {
        if (from === to || to < 0 || to >= items.length) return;
        const next = [...items];
        next.splice(to, 0, next.splice(from, 1)[0]);
        setItems(next);
    };

    const save = () => {
        setState({ busy: true, message: null, error: false });
        http.put('/api/client/theme/branding', { announcements: items })
            .then(({ data: fresh }) => {
                setItems(fresh.announcements);
                setState({ busy: false, message: 'Announcements saved.', error: false });
                onSaved();
            })
            .catch((e) => setState({ busy: false, message: httpErrorToHuman(e), error: true }));
    };

    const header = (
        <div className={'mb-5 flex flex-wrap items-center gap-3'}>
            <div className={'mr-auto'}>
                <h2 className={'text-xl font-semibold text-neutral-50'}>Announcements</h2>
                <p className={'text-sm text-neutral-400'}>
                    Notes at the top of the panel, shown in this order. Drag a card to move it, switch it on or off on
                    the card, open it for the rest.
                </p>
            </div>
            {dirty && (
                <span className={'rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs text-yellow-700'}>Not saved</span>
            )}
            {state.message && (
                <span className={`text-xs ${state.error ? 'text-red-600' : 'text-green-700'}`}>{state.message}</span>
            )}
            <Button type={'button'} disabled={state.busy || !dirty} onClick={save}>
                Save announcements
            </Button>
        </div>
    );

    if (open !== null && items[open]) {
        const a = items[open];
        const { Icon, icon } = TYPES[a.type];

        return (
            <div className={'mx-auto w-full max-w-3xl'}>
                {header}
                <button
                    type={'button'}
                    onClick={() => setOpen(null)}
                    className={'mb-4 inline-flex items-center gap-1.5 text-sm text-primary-600'}
                >
                    <ArrowLeftIcon className={'h-4 w-4'} />
                    All announcements
                </button>
                <div className={'space-y-5 rounded-2xl border border-neutral-500 bg-white p-6 shadow-md'}>
                    <div className={'flex items-center gap-3'}>
                        <Icon className={classNames('h-6 w-6', icon)} />
                        <input
                            value={a.title}
                            maxLength={100}
                            placeholder={'Title (optional)'}
                            onChange={(e) => change(open, { title: e.currentTarget.value })}
                            className={`${field} text-base font-semibold`}
                        />
                    </div>
                    <Row label={'Message'}>
                        <textarea
                            value={a.message}
                            maxLength={1000}
                            rows={4}
                            placeholder={'What do you want to say?'}
                            onChange={(e) => change(open, { message: e.currentTarget.value })}
                            className={field}
                        />
                        <p className={'mt-1 text-right text-2xs text-neutral-400'}>{a.message.length}/1000</p>
                    </Row>
                    <Row label={'Kind'}>
                        <Segmented
                            value={a.type}
                            onChange={(type) => change(open, { type })}
                            options={(Object.keys(TYPES) as Announcement['type'][]).map((value) => ({
                                value,
                                label: TYPES[value].label,
                            }))}
                        />
                    </Row>
                    <Row label={'Link (optional)'}>
                        <div className={'flex gap-2'}>
                            <input
                                value={a.link_label}
                                maxLength={50}
                                placeholder={'Link name'}
                                onChange={(e) => change(open, { link_label: e.currentTarget.value })}
                                className={field}
                            />
                            <input
                                value={a.link_url}
                                placeholder={'https://... or /page'}
                                onChange={(e) => change(open, { link_url: e.currentTarget.value })}
                                className={`${field} font-mono text-xs`}
                            />
                        </div>
                    </Row>
                    <div className={'grid gap-3 sm:grid-cols-2'}>
                        <Toggle label={'Shown'} checked={a.enabled} onChange={(enabled) => change(open, { enabled })} />
                        <Toggle
                            label={'People can dismiss it'}
                            checked={a.dismissible}
                            onChange={(dismissible) => change(open, { dismissible })}
                        />
                    </div>

                    <div className={'border-t border-neutral-500 pt-5'}>
                        <p className={'mb-1 text-sm font-semibold text-neutral-50'}>Where it is shown</p>
                        <p className={'mb-3 text-xs text-neutral-400'}>
                            It is shown at the top of these parts of the panel.
                        </p>
                        <div className={'space-y-2'}>
                            {PLACES.map((place) => (
                                <Toggle
                                    key={place.id}
                                    label={place.label}
                                    checked={a.where.includes(place.id)}
                                    onChange={(on) => {
                                        const where = on
                                            ? [...a.where, place.id]
                                            : a.where.filter((p) => p !== place.id);
                                        // It has to be shown somewhere.
                                        if (where.length > 0) change(open, { where });
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className={'space-y-4 border-t border-neutral-500 pt-5'}>
                        <div>
                            <p className={'mb-1 text-sm font-semibold text-neutral-50'}>Who it is for</p>
                            <p className={'text-xs text-neutral-400'}>
                                Leave a list empty to ask for nothing. With several, a person needs all of them; inside
                                one list one choice is enough. They are looked at in the browser, so it is a way to keep
                                a note short and to the point, not to keep a secret.
                            </p>
                        </div>
                        <Row label={'Has a server of this egg'}>
                            <Chips
                                options={(eggs ?? []).map((e) => ({
                                    value: e.id,
                                    label: e.nest ? `${e.name} (${e.nest})` : e.name,
                                }))}
                                value={a.eggs}
                                onChange={(next) => change(open, { eggs: next })}
                                empty={eggs === null ? 'Loading the eggs...' : 'There are no eggs.'}
                            />
                        </Row>
                        <Row label={'Has a server running this software'}>
                            <Chips
                                options={SOFTWARE_CHOICES.map((s) => ({ value: s.type, label: s.name }))}
                                value={a.software}
                                onChange={(next) => change(open, { software: next })}
                                empty={''}
                            />
                            <p className={'mt-1 text-2xs text-neutral-400'}>
                                The software is found out from the files of a server, so it counts once the panel has
                                looked at that server.
                            </p>
                        </Row>
                        <Row label={'Has a server on this node'}>
                            <Chips
                                options={(nodes ?? []).map((n) => ({ value: n.name, label: n.name }))}
                                value={a.nodes}
                                onChange={(next) => change(open, { nodes: next })}
                                empty={nodes === null ? 'Loading the nodes...' : 'There are no nodes.'}
                            />
                        </Row>
                    </div>

                    <div className={'flex items-center justify-between border-t border-neutral-500 pt-5'}>
                        <button
                            type={'button'}
                            className={'inline-flex items-center gap-1.5 text-sm text-red-600'}
                            onClick={() => {
                                if (window.confirm('Delete this announcement?')) {
                                    setItems(items.filter((_, at) => at !== open));
                                    setOpen(null);
                                }
                            }}
                        >
                            <TrashIcon className={'h-4 w-4'} />
                            Delete it
                        </button>
                        <Button.Text type={'button'} onClick={() => setOpen(null)}>
                            Done
                        </Button.Text>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={'mx-auto w-full max-w-6xl'}>
            {header}
            <div className={'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                {items.map((a, i) => {
                    const { box, icon, Icon, label } = TYPES[a.type];

                    return (
                        <div
                            key={a.id || `new-${i}`}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                setDragging(i);
                            }}
                            onDragEnd={() => {
                                setDragging(null);
                                setOver(null);
                            }}
                            onDragOver={(e) => {
                                if (dragging === null) return;
                                e.preventDefault();
                                setOver(i);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragging !== null) move(dragging, i);
                                setDragging(null);
                                setOver(null);
                            }}
                            className={classNames(
                                'group relative flex flex-col rounded-2xl border bg-white p-4 shadow transition-all',
                                over === i && dragging !== i
                                    ? 'border-primary-600 ring-2 ring-primary-600/30'
                                    : 'border-neutral-500',
                                dragging === i && 'opacity-50',
                                !a.enabled && 'opacity-70'
                            )}
                        >
                            <div className={'mb-3 flex items-center gap-2'}>
                                <span
                                    title={'Drag to move'}
                                    className={'cursor-grab text-neutral-400 active:cursor-grabbing'}
                                >
                                    <MenuIcon className={'h-5 w-5'} />
                                </span>
                                <span
                                    className={classNames(
                                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
                                        box
                                    )}
                                >
                                    <Icon className={classNames('h-3.5 w-3.5', icon)} />
                                    {label}
                                </span>
                                <span className={'ml-auto text-2xs text-neutral-400'}>{i + 1}</span>
                                <Switch
                                    checked={a.enabled}
                                    onChange={(enabled) => change(i, { enabled })}
                                    label={`Show ${a.title || 'the announcement'}`}
                                />
                            </div>
                            <button type={'button'} onClick={() => setOpen(i)} className={'flex-1 text-left'}>
                                <p className={'truncate font-semibold text-neutral-50'}>{a.title || 'No title'}</p>
                                <p className={'mt-1 line-clamp-3 whitespace-pre-line text-sm text-neutral-300'}>
                                    {a.message || 'No message yet.'}
                                </p>
                            </button>
                            <div className={'mt-3 flex flex-wrap gap-1'}>
                                {summary(a, eggs ?? []).map((text, at) => (
                                    <span
                                        key={at}
                                        className={
                                            'truncate rounded-full bg-neutral-600 px-2 py-0.5 text-2xs text-neutral-300'
                                        }
                                        style={{ maxWidth: '100%' }}
                                    >
                                        {text}
                                    </span>
                                ))}
                                {!a.dismissible && (
                                    <span
                                        className={'rounded-full bg-neutral-600 px-2 py-0.5 text-2xs text-neutral-300'}
                                    >
                                        Cannot be dismissed
                                    </span>
                                )}
                            </div>
                            <div className={'mt-3 flex items-center justify-between'}>
                                <button
                                    type={'button'}
                                    onClick={() => setOpen(i)}
                                    className={'text-xs font-medium text-primary-600'}
                                >
                                    Open
                                </button>
                                <span className={'flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'}>
                                    <button
                                        type={'button'}
                                        disabled={i === 0}
                                        onClick={() => move(i, i - 1)}
                                        className={
                                            'rounded px-1.5 text-xs text-neutral-400 hover:bg-neutral-600 disabled:opacity-30'
                                        }
                                        aria-label={'Move earlier'}
                                    >
                                        &larr;
                                    </button>
                                    <button
                                        type={'button'}
                                        disabled={i === items.length - 1}
                                        onClick={() => move(i, i + 1)}
                                        className={
                                            'rounded px-1.5 text-xs text-neutral-400 hover:bg-neutral-600 disabled:opacity-30'
                                        }
                                        aria-label={'Move later'}
                                    >
                                        &rarr;
                                    </button>
                                </span>
                            </div>
                        </div>
                    );
                })}
                <button
                    type={'button'}
                    disabled={items.length >= 20}
                    onClick={() => {
                        setItems([...items, { ...BLANK }]);
                        setOpen(items.length);
                    }}
                    className={
                        'flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-400 text-sm text-neutral-300 transition-colors hover:border-primary-600 hover:text-primary-600 disabled:opacity-40'
                    }
                >
                    <PlusIcon className={'h-6 w-6'} />
                    Add an announcement
                </button>
            </div>
            {items.length === 0 && <p className={'mt-4 text-sm text-neutral-300'}>There are no announcements yet.</p>}
        </div>
    );
};
