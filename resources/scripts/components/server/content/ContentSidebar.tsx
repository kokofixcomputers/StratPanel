import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import StatusBadge from '@/components/server/console/StatusBadge';
import ContentFilters from '@/components/server/content/ContentFilters';
import KindNav from '@/components/server/content/KindNav';

/**
 * Replaces the server navigation while Content is open: the search and the filters of Modrinth instead. The way back to
 * the server is at the top. Narrow screens have no sidebar, the page shows the same filters above the results there.
 */
export default ({ backUrl }: { backUrl: string }) => {
    const name = ServerContext.useStoreState((state) => state.server.data!.name);

    return (
        <aside className={'hidden w-72 flex-shrink-0 pl-4 pt-6 lg:block'}>
            <nav
                aria-label={'Content filters'}
                className={
                    'sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-neutral-500 bg-white p-2 shadow-md'
                }
            >
                <div className={'mb-2 border-b border-neutral-500 px-2 pb-3 pt-2'}>
                    <Link
                        to={backUrl}
                        className={
                            'mb-3 flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-neutral-300 no-underline hover:bg-neutral-600 hover:text-neutral-50'
                        }
                    >
                        <ArrowLeftIcon className={'h-4 w-4'} />
                        Back to the server
                    </Link>
                    <div className={'flex items-center justify-between gap-2'}>
                        <p className={'truncate text-sm font-semibold text-neutral-50'}>{name}</p>
                        <StatusBadge />
                    </div>
                </div>
                <KindNav />
                <ContentFilters />
            </nav>
        </aside>
    );
};
