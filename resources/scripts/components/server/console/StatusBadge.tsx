import React from 'react';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';
import { capitalize } from '@/lib/strings';
import useSleeping from '@/components/server/console/useSleeping';

const colors: Record<string, string> = {
    running: 'bg-green-50 text-green-700 border-green-200',
    starting: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    stopping: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    offline: 'bg-neutral-600 text-neutral-300 border-neutral-500',
    // Stopped by auto sleep, it starts again when a player joins.
    sleeping: 'bg-blue-50 text-blue-700 border-blue-200',
};

const dots: Record<string, string> = {
    running: 'bg-green-500',
    starting: 'bg-yellow-500 animate-pulse',
    stopping: 'bg-yellow-500 animate-pulse',
    offline: 'bg-neutral-400',
    sleeping: 'bg-blue-400',
};

export default ({ className }: { className?: string }) => {
    const stopped = ServerContext.useStoreState((state) => state.status.value) || 'offline';
    const sleeping = useSleeping();
    const status = sleeping ? 'sleeping' : stopped;

    return (
        <span
            className={classNames(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
                colors[status],
                className
            )}
        >
            <span className={classNames('w-1.5 h-1.5 rounded-full mr-2', dots[status])} />
            {status === 'offline' ? 'Offline' : status === 'sleeping' ? 'Sleeping' : capitalize(status)}
        </span>
    );
};
