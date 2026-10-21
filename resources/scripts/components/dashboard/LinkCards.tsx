import React from 'react';
import classNames from 'classnames';
import { ArrowRightIcon } from '@heroicons/react/solid';
import useBranding from '@/plugins/useBranding';
import { appliesTo, LinkCard, Place } from '@/lib/branding';
import { iconFor } from '@/lib/linkIcons';
import { columnsFor } from '@/lib/linkCards';

const anchor = (link: LinkCard['links'][number]) => ({
    href: link.url,
    target: link.newTab ? '_blank' : undefined,
    rel: 'noopener noreferrer',
});

/** How big a link is by how many there are (0 up to 2 links, 1 up to 4, 2 for more): the more, the smaller. */
const CARD_TIERS = [
    { box: 'gap-5 p-7', icon: 'h-16 w-16 p-4', text: 'text-xl' },
    { box: 'gap-4 p-5', icon: 'h-12 w-12 p-3', text: 'text-base' },
    { box: 'gap-3 p-4', icon: 'h-10 w-10 p-2.5', text: 'text-sm' },
];
const GRID_TIERS = [
    { box: 'gap-3 px-4 py-3', icon: 'h-10 w-10 p-2', text: 'text-base' },
    { box: 'gap-2.5 px-3 py-2.5', icon: 'h-8 w-8 p-1.5', text: 'text-sm' },
    { box: 'gap-2 px-3 py-2', icon: 'h-7 w-7 p-1.5', text: 'text-xs' },
];
const tierFor = (count: number): 0 | 1 | 2 => (count <= 2 ? 0 : count <= 4 ? 1 : 2);

/** One card of links: a title and its links as a list, as tall cards or as a compact grid of tiles. */
const Card = ({ card }: { card: LinkCard }) => {
    const count = card.links.length;
    const tier = tierFor(count);

    return (
        <section aria-label={card.title || 'Links'} className={'link-card'}>
            {card.title && (
                <h3 className={'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>
                    {card.title}
                </h3>
            )}
            {card.style === 'list' ? (
                <div
                    className={
                        'divide-y divide-neutral-500 overflow-hidden rounded-xl border border-neutral-500 bg-white shadow'
                    }
                >
                    {card.links.map((link, i) => {
                        const { Icon } = iconFor(link.icon);

                        return (
                            <a
                                key={`${link.url}:${i}`}
                                {...anchor(link)}
                                className={
                                    'fx group flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-neutral-100 no-underline transition-colors hover:bg-neutral-600'
                                }
                            >
                                <Icon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                                <span className={'min-w-0 flex-1 truncate'}>{link.label}</span>
                                <ArrowRightIcon
                                    className={
                                        'h-4 w-4 flex-shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5'
                                    }
                                />
                            </a>
                        );
                    })}
                </div>
            ) : (
                <div
                    className={'link-grid'}
                    // The links share the whole width: two links are two big cards side by side, and the more there are the smaller each gets.
                    style={
                        {
                            '--c-sm': columnsFor(count, 2),
                            '--c-lg': columnsFor(count, card.style === 'grid' ? 6 : 5),
                        } as React.CSSProperties
                    }
                >
                    {card.links.map((link, i) => {
                        const { Icon } = iconFor(link.icon);
                        const grid = card.style === 'grid';

                        return (
                            <a
                                key={`${link.url}:${i}`}
                                {...anchor(link)}
                                className={classNames(
                                    'fx hover-card group flex min-w-0 items-center rounded-xl border border-neutral-500 bg-white text-neutral-100 no-underline shadow transition-all duration-150 hover:border-neutral-400 hover:shadow-md',
                                    grid ? GRID_TIERS[tier].box : CARD_TIERS[tier].box
                                )}
                            >
                                <span
                                    className={classNames(
                                        'flex flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600',
                                        grid ? GRID_TIERS[tier].icon : CARD_TIERS[tier].icon
                                    )}
                                >
                                    <Icon className={'h-full w-full'} />
                                </span>
                                <span className={'min-w-0 flex-1'}>
                                    <span
                                        className={classNames(
                                            'block truncate font-semibold',
                                            grid ? GRID_TIERS[tier].text : CARD_TIERS[tier].text
                                        )}
                                    >
                                        {link.label}
                                    </span>
                                    {!grid && tier < 2 && (
                                        <span className={'block truncate text-xs text-neutral-400'}>
                                            {link.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                        </span>
                                    )}
                                </span>
                                <ArrowRightIcon
                                    className={classNames(
                                        'flex-shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5',
                                        grid ? 'h-3.5 w-3.5' : tier === 0 ? 'h-6 w-6' : 'h-5 w-5'
                                    )}
                                />
                            </a>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

/** The cards of links of the dashboard that go on top of the list of servers, or at the bottom. */
export default ({
    position,
    place = 'dashboard',
    className,
}: {
    position: 'top' | 'bottom';
    place?: Place;
    className?: string;
}) => {
    const cards = useBranding().linkCards.filter(
        (card) =>
            card.position === position &&
            appliesTo({ ...card, eggs: [], software: [], nodes: [] }, place, { servers: [], software: () => null })
    );
    if (cards.length === 0) return null;

    return (
        <div className={classNames('space-y-5', className)}>
            {cards.map((card, i) => (
                <Card key={card.id || i} card={card} />
            ))}
        </div>
    );
};
