import React from 'react';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';
import { capitalize } from '@/lib/strings';

const colors: Record<string, string> = {
    running: 'bg-green-50 text-green-700 border-green-200',
    starting: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    stopping: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    offline: 'bg-neutral-600 text-neutral-300 border-neutral-500',
};

const dots: Record<string, string> = {
    running: 'bg-green-500',
    starting: 'bg-yellow-500 animate-pulse',
    stopping: 'bg-yellow-500 animate-pulse',
    offline: 'bg-neutral-400',
};

export default ({ className }: { className?: string }) => {
    const status = ServerContext.useStoreState((state) => state.status.value) || 'offline';

    return (
        <span
            className={classNames(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
                colors[status],
                className
            )}
        >
            <span className={classNames('w-1.5 h-1.5 rounded-full mr-2', dots[status])} />
            {status === 'offline' ? 'Offline' : capitalize(status)}
        </span>
    );
};
