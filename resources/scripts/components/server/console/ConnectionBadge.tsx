import React from 'react';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';

/** Whether the live connection (websocket) to the server's node is up: console output and stats only flow while it is. */
export default ({ className }: { className?: string }) => {
    const connected = ServerContext.useStoreState((state) => state.socket.connected);

    return (
        <span
            title={
                connected
                    ? 'Live connection to the server is up'
                    : 'No live connection to the server, trying to reconnect. Console and stats are paused.'
            }
            className={classNames(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
                connected ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
                className
            )}
        >
            <span
                className={classNames(
                    'w-1.5 h-1.5 rounded-full mr-2',
                    connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
                )}
            />
            {connected ? 'Connected' : 'Disconnected'}
        </span>
    );
};
