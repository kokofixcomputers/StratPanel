import React from 'react';
import classNames from 'classnames';
import { SOURCES } from '@/lib/contentSource';
import useContentQuery from '@/components/server/content/useContentQuery';
import useCurseForgeEnabled from '@/components/server/content/useCurseForgeEnabled';
import useServerVersion from '@/components/server/content/useServerVersion';

/**
 * Chooses where the projects come from: Modrinth, or CurseForge. Only there when an admin has added a CurseForge key, and
 * still there when the address asks for CurseForge, so the way back is not lost.
 */
export default ({ className }: { className?: string }) => {
    const { query, update } = useContentQuery(useServerVersion());
    const enabled = useCurseForgeEnabled();

    if (!enabled && query.source === 'modrinth') return null;

    return (
        <div
            className={classNames('inline-flex rounded-xl bg-neutral-600 p-1', className)}
            role={'group'}
            aria-label={'Source'}
        >
            {SOURCES.map((source) => (
                <button
                    key={source.id}
                    type={'button'}
                    aria-pressed={query.source === source.id}
                    onClick={() => update({ source: source.id }, 'push')}
                    className={classNames(
                        'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                        query.source === source.id
                            ? 'bg-primary-600 text-snow shadow'
                            : 'text-neutral-300 hover:text-neutral-50'
                    )}
                >
                    {source.label}
                </button>
            ))}
        </div>
    );
};
