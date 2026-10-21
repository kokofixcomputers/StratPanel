import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import { Button } from '@/components/elements/button/index';
import { Row, Segmented, Toggle } from '@/components/admin/theme/controls';
import { iconFor, LINK_ICONS } from '@/lib/linkIcons';

export interface LinkCardLinkEdit {
    label: string;
    url: string;
    icon: string;
    new_tab: boolean;
}

export interface LinkCardEdit {
    id: string;
    title: string;
    position: 'top' | 'bottom';
    style: 'list' | 'cards' | 'grid';
    enabled: boolean;
    links: LinkCardLinkEdit[];
}

const field = 'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100';
const small = 'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50 disabled:opacity-30';

const BLANK_LINK: LinkCardLinkEdit = { label: '', url: '', icon: 'link', new_tab: true };

/** The icons to choose from, as a grid under the link that is being edited. */
const IconPicker = ({ value, onPick }: { value: string; onPick: (id: string) => void }) => (
    <div
        className={'grid grid-cols-6 gap-1 rounded-lg border border-neutral-500 bg-neutral-600/40 p-2 sm:grid-cols-8'}
        role={'listbox'}
        aria-label={'Icons'}
    >
        {Object.entries(LINK_ICONS).map(([id, { label, Icon }]) => (
            <button
                key={id}
                type={'button'}
                title={label}
                aria-label={label}
                aria-selected={id === value}
                onClick={() => onPick(id)}
                className={classNames(
                    'flex h-9 w-9 items-center justify-center rounded-md border p-1.5 transition-colors',
                    id === value
                        ? 'border-primary-600 bg-primary-50 text-primary-600'
                        : 'border-transparent text-neutral-300 hover:bg-neutral-600'
                )}
            >
                <Icon className={'h-full w-full'} />
            </button>
        ))}
    </div>
);

/**
 * The cards of links on the dashboard ("Need a hand?" with Discord and Support): as many cards as you like, each on top of the servers or at
 * the bottom, as a list, as tall cards or as a compact grid, with an icon for every link. Branding, so they are saved here with their own button.
 */
export default ({
    cards: initial,
    onSaved,
    onDraft,
}: {
    cards: LinkCardEdit[];
    onSaved: () => void;
    onDraft: (cards: LinkCardEdit[]) => void;
}) => {
    const [cards, setCards] = useState<LinkCardEdit[]>(initial);
    const [picking, setPicking] = useState<string | null>(null);
    const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({
        busy: false,
        message: null,
        error: false,
    });
    useEffect(() => onDraft(cards), [cards]);

    const changeCard = (i: number, changes: Partial<LinkCardEdit>) =>
        setCards(cards.map((c, at) => (at === i ? { ...c, ...changes } : c)));
    const changeLink = (i: number, j: number, changes: Partial<LinkCardLinkEdit>) =>
        changeCard(i, { links: cards[i].links.map((l, at) => (at === j ? { ...l, ...changes } : l)) });
    const moveLink = (i: number, j: number, by: number) => {
        const links = [...cards[i].links];
        const to = j + by;
        if (to < 0 || to >= links.length) return;
        links.splice(to, 0, links.splice(j, 1)[0]);
        changeCard(i, { links });
    };

    const save = () => {
        setState({ busy: true, message: null, error: false });
        // A link that has no name or address yet is not saved.
        const clean = cards.map((c) => ({ ...c, links: c.links.filter((l) => l.label.trim() && l.url.trim()) }));
        http.put('/api/client/theme/branding', { link_cards: clean })
            .then(() => {
                setState({ busy: false, message: 'Link cards saved.', error: false });
                onSaved();
            })
            .catch((e) => setState({ busy: false, message: httpErrorToHuman(e), error: true }));
    };

    return (
        <div className={'space-y-3'}>
            <p className={'text-xs text-neutral-400'}>
                Cards of links on the dashboard, like a <em>Need a hand?</em> card with a link to your Discord and one
                to support. The preview shows what you type before it is saved.
            </p>
            {cards.length === 0 && <p className={'text-sm text-neutral-300'}>There are no link cards.</p>}
            {cards.map((card, i) => (
                <div key={card.id || i} className={'space-y-3 rounded-lg border border-neutral-500 p-3'}>
                    <div className={'flex items-center gap-2'}>
                        <input
                            value={card.title}
                            maxLength={40}
                            placeholder={'Title, like Need a hand?'}
                            onChange={(e) => changeCard(i, { title: e.currentTarget.value })}
                            className={field}
                        />
                        <button
                            type={'button'}
                            className={small}
                            disabled={i === 0}
                            aria-label={'Move the card up'}
                            onClick={() =>
                                setCards(cards.map((_, at) => cards[at === i ? i - 1 : at === i - 1 ? i : at]))
                            }
                        >
                            <ArrowUpIcon className={'h-4 w-4'} />
                        </button>
                        <button
                            type={'button'}
                            className={small}
                            disabled={i === cards.length - 1}
                            aria-label={'Move the card down'}
                            onClick={() =>
                                setCards(cards.map((_, at) => cards[at === i ? i + 1 : at === i + 1 ? i : at]))
                            }
                        >
                            <ArrowDownIcon className={'h-4 w-4'} />
                        </button>
                        <button
                            type={'button'}
                            className={small}
                            aria-label={'Remove the card'}
                            onClick={() => setCards(cards.filter((_, at) => at !== i))}
                        >
                            <TrashIcon className={'h-4 w-4'} />
                        </button>
                    </div>
                    <Row label={'Where'}>
                        <Segmented
                            value={card.position}
                            onChange={(position) => changeCard(i, { position })}
                            options={[
                                { value: 'top', label: 'On top of the servers' },
                                { value: 'bottom', label: 'At the bottom' },
                            ]}
                        />
                    </Row>
                    <Row label={'Style'}>
                        <Segmented
                            value={card.style}
                            onChange={(style) => changeCard(i, { style })}
                            options={[
                                { value: 'list', label: 'List' },
                                { value: 'cards', label: 'Cards' },
                                { value: 'grid', label: 'Grid' },
                            ]}
                        />
                        <p className={'mt-1 text-2xs text-neutral-400'}>
                            {
                                {
                                    list: 'One link under the other, in a single box.',
                                    cards: 'A tall card for every link, with its address.',
                                    grid: 'Like cards, but low tiles that take little height.',
                                }[card.style]
                            }
                        </p>
                    </Row>
                    <Toggle label={'Shown'} checked={card.enabled} onChange={(enabled) => changeCard(i, { enabled })} />
                    <div className={'space-y-2'}>
                        {card.links.map((link, j) => {
                            const key = `${i}:${j}`;
                            const { Icon } = iconFor(link.icon);

                            return (
                                <div key={j} className={'space-y-2 rounded-lg bg-neutral-600/40 p-2'}>
                                    <div className={'flex items-center gap-2'}>
                                        <button
                                            type={'button'}
                                            title={'Choose an icon'}
                                            aria-label={'Choose an icon'}
                                            aria-expanded={picking === key}
                                            onClick={() => setPicking(picking === key ? null : key)}
                                            className={
                                                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-500 bg-white p-2 text-primary-600'
                                            }
                                        >
                                            <Icon className={'h-full w-full'} />
                                        </button>
                                        <input
                                            value={link.label}
                                            maxLength={50}
                                            placeholder={'Name'}
                                            onChange={(e) => changeLink(i, j, { label: e.currentTarget.value })}
                                            className={field}
                                        />
                                        <button
                                            type={'button'}
                                            className={small}
                                            disabled={j === 0}
                                            aria-label={'Move up'}
                                            onClick={() => moveLink(i, j, -1)}
                                        >
                                            <ArrowUpIcon className={'h-4 w-4'} />
                                        </button>
                                        <button
                                            type={'button'}
                                            className={small}
                                            disabled={j === card.links.length - 1}
                                            aria-label={'Move down'}
                                            onClick={() => moveLink(i, j, 1)}
                                        >
                                            <ArrowDownIcon className={'h-4 w-4'} />
                                        </button>
                                        <button
                                            type={'button'}
                                            className={small}
                                            aria-label={'Remove the link'}
                                            onClick={() =>
                                                changeCard(i, { links: card.links.filter((_, at) => at !== j) })
                                            }
                                        >
                                            <TrashIcon className={'h-4 w-4'} />
                                        </button>
                                    </div>
                                    {picking === key && (
                                        <IconPicker
                                            value={link.icon}
                                            onPick={(icon) => {
                                                changeLink(i, j, { icon });
                                                setPicking(null);
                                            }}
                                        />
                                    )}
                                    <div className={'flex items-center gap-3'}>
                                        <input
                                            value={link.url}
                                            placeholder={'https://discord.gg/... or /page'}
                                            onChange={(e) => changeLink(i, j, { url: e.currentTarget.value })}
                                            className={`${field} font-mono text-xs`}
                                        />
                                        <label
                                            className={
                                                'flex flex-shrink-0 items-center gap-1.5 text-xs text-neutral-300'
                                            }
                                        >
                                            <input
                                                type={'checkbox'}
                                                checked={link.new_tab}
                                                onChange={(e) => changeLink(i, j, { new_tab: e.currentTarget.checked })}
                                                className={'accent-primary-600'}
                                            />
                                            New tab
                                        </label>
                                    </div>
                                </div>
                            );
                        })}
                        <Button.Text
                            type={'button'}
                            disabled={card.links.length >= 12}
                            onClick={() => changeCard(i, { links: [...card.links, { ...BLANK_LINK }] })}
                        >
                            <PlusIcon className={'mr-1 h-4 w-4'} />
                            Add a link
                        </Button.Text>
                    </div>
                </div>
            ))}
            <div className={'flex items-center gap-3'}>
                <Button.Text
                    type={'button'}
                    disabled={cards.length >= 8}
                    onClick={() =>
                        setCards([
                            ...cards,
                            {
                                id: '',
                                title: 'Need a hand?',
                                position: 'bottom',
                                style: 'cards',
                                enabled: true,
                                links: [
                                    { ...BLANK_LINK, icon: 'discord' },
                                    { ...BLANK_LINK, icon: 'support' },
                                ],
                            },
                        ])
                    }
                >
                    <PlusIcon className={'mr-1 h-4 w-4'} />
                    Add a card
                </Button.Text>
                <Button type={'button'} disabled={state.busy} onClick={save}>
                    Save link cards
                </Button>
            </div>
            {state.message && (
                <p className={`text-xs ${state.error ? 'text-red-600' : 'text-green-700'}`}>{state.message}</p>
            )}
        </div>
    );
};
