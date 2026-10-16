import React from 'react';
import { Link } from 'react-router-dom';
import { LocationDescriptor } from 'history';
import { CheckIcon, ClockIcon, DownloadIcon, HeartIcon } from '@heroicons/react/solid';
import { Button } from '@/components/elements/button/index';
import { ManagedProject } from '@/lib/pterodactylJson';
import { prettyTag, SearchHit } from '@/lib/modrinth';
import ProjectIcon from '@/components/server/content/ProjectIcon';
import TagIcon from '@/components/server/content/TagIcon';
import { compact, timeAgo } from '@/components/server/content/format';

/** One result, like on Modrinth: the picture, the words, the tags and the numbers, and a button to install it. */
export default ({
    hit,
    to,
    icons,
    labels = {},
    record,
    inUse,
    update,
    busy,
    actionLabel,
    onInstall,
}: {
    hit: SearchHit;
    to: LocationDescriptor;
    // Inline SVG of the tags by name.
    icons: Record<string, string>;
    // The names to show for tags that are not written the way prettyTag would, by tag.
    labels?: Record<string, string>;
    record?: ManagedProject;
    inUse?: boolean;
    update?: string;
    busy: boolean;
    actionLabel: string;
    onInstall: () => void;
}) => {
    const tags = (hit.display_categories?.length ? hit.display_categories : hit.categories).slice(0, 4);

    return (
        <article
            className={
                'flex flex-wrap items-center gap-4 rounded-xl border border-neutral-500 bg-white p-4 shadow-md transition-shadow duration-150 hover:shadow-lg'
            }
        >
            <Link to={to} className={'flex min-w-0 flex-1 basis-80 items-start gap-4 no-underline'}>
                <ProjectIcon src={hit.icon_url} size={80} />
                <div className={'min-w-0 flex-1'}>
                    <div className={'flex flex-wrap items-baseline gap-x-2'}>
                        <h3 className={'text-base font-semibold text-neutral-50'}>{hit.title}</h3>
                        <span className={'text-xs text-neutral-400'}>by {hit.author}</span>
                    </div>
                    <p className={'mt-1 line-clamp-2 text-sm text-neutral-300'}>{hit.description}</p>
                    {tags.length > 0 && (
                        <div className={'mt-2 flex flex-wrap gap-1.5'}>
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className={
                                        'inline-flex items-center gap-1 rounded-full bg-neutral-600 px-2 py-0.5 text-2xs font-medium text-neutral-300'
                                    }
                                >
                                    <TagIcon svg={icons[tag]} size={12} />
                                    {labels[tag] || prettyTag(tag)}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </Link>
            <div className={'flex flex-shrink-0 flex-col items-end gap-3'}>
                <div className={'flex items-center gap-4 text-xs text-neutral-400'}>
                    <span className={'inline-flex items-center'} title={'Downloads'}>
                        <DownloadIcon className={'mr-1 h-4 w-4'} />
                        {compact(hit.downloads)}
                    </span>
                    <span className={'inline-flex items-center'} title={'Follows'}>
                        <HeartIcon className={'mr-1 h-4 w-4'} />
                        {compact(hit.follows || 0)}
                    </span>
                    {hit.date_modified && (
                        <span className={'inline-flex items-center'} title={'Last updated'}>
                            <ClockIcon className={'mr-1 h-4 w-4'} />
                            {timeAgo(hit.date_modified)}
                        </span>
                    )}
                </div>
                {inUse ? (
                    <span className={'inline-flex items-center text-xs font-medium text-green-700'}>
                        <CheckIcon className={'mr-1 h-4 w-4'} />
                        In use
                    </span>
                ) : record ? (
                    <span
                        className={
                            'rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700'
                        }
                    >
                        {update
                            ? `Installed ${record.versionNumber}, update available`
                            : `Installed ${record.versionNumber}`}
                    </span>
                ) : (
                    <Button size={Button.Sizes.Small} disabled={busy} onClick={onInstall}>
                        <DownloadIcon className={'mr-1.5 -ml-1 h-4 w-4'} />
                        {actionLabel}
                    </Button>
                )}
            </div>
        </article>
    );
};
