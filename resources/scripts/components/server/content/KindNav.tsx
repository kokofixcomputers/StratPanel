import React from 'react';
import classNames from 'classnames';
import {
    ArchiveIcon,
    CollectionIcon,
    CubeIcon,
    GlobeAltIcon,
    PhotographIcon,
    PuzzleIcon,
} from '@heroicons/react/solid';
import useContentQuery, { ContentKind, KINDS } from '@/components/server/content/useContentQuery';
import useServerVersion from '@/components/server/content/useServerVersion';

const ICONS: Record<ContentKind, React.ComponentType<{ className?: string }>> = {
    plugin: PuzzleIcon,
    mod: CubeIcon,
    datapack: CollectionIcon,
    resourcepack: PhotographIcon,
    modpack: ArchiveIcon,
    world: GlobeAltIcon,
};

/** What kind of content to look at: plugins, mods, datapacks and the rest, as the first thing in the sidebar. */
export default () => {
    const { query, update } = useContentQuery(useServerVersion());

    return (
        <div className={'mb-2 border-b border-neutral-500 pb-2'}>
            <p className={'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>Content</p>
            {KINDS.map((k) => {
                const Icon = ICONS[k.id];
                const active = query.kind === k.id;

                return (
                    <button
                        key={k.id}
                        type={'button'}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => update({ kind: k.id, view: 'browse' }, 'push')}
                        className={classNames(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
                            active
                                ? 'bg-primary-50 text-primary-700'
                                : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
                        )}
                    >
                        <Icon className={'h-5 w-5 flex-shrink-0'} />
                        {k.label}
                    </button>
                );
            })}
        </div>
    );
};
