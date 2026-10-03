import React, { useEffect, useState } from 'react';
import { PlayIcon, RefreshIcon, StopIcon } from '@heroicons/react/solid';
import classNames from 'classnames';
import Can from '@/components/elements/Can';
import { ServerContext } from '@/state/server';
import { PowerAction } from '@/components/server/console/ServerConsoleContainer';
import { Dialog } from '@/components/elements/dialog';

interface PowerButtonProps {
    className?: string;
}

const base =
    'inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow transition-all duration-150 focus-visible:ring-[3px] disabled:cursor-not-allowed';

export default ({ className }: PowerButtonProps) => {
    const [open, setOpen] = useState(false);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);

    const killable = status === 'stopping';
    const onButtonClick = (
        action: PowerAction | 'kill-confirmed',
        e: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ): void => {
        e.preventDefault();
        if (action === 'kill') {
            return setOpen(true);
        }

        if (instance) {
            setOpen(false);
            instance.send('set state', action === 'kill-confirmed' ? 'kill' : action);
        }
    };

    useEffect(() => {
        if (status === 'offline') {
            setOpen(false);
        }
    }, [status]);

    return (
        <div className={className}>
            <Dialog.Confirm
                open={open}
                hideCloseIcon
                onClose={() => setOpen(false)}
                title={'Forcibly Stop Process'}
                confirm={'Continue'}
                onConfirmed={onButtonClick.bind(this, 'kill-confirmed')}
            >
                Forcibly stopping a server can lead to data corruption.
            </Dialog.Confirm>
            <Can action={'control.start'}>
                <button
                    className={classNames(
                        base,
                        'bg-green-600 hover:bg-green-700 focus-visible:ring-green-600/30 disabled:opacity-50'
                    )}
                    disabled={status !== 'offline'}
                    onClick={onButtonClick.bind(this, 'start')}
                >
                    <PlayIcon className={'w-5 h-5 mr-1.5 -ml-1'} />
                    Start
                </button>
            </Can>
            <Can action={'control.stop'}>
                <button
                    className={classNames(
                        base,
                        'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600/30 disabled:bg-red-300 disabled:opacity-70'
                    )}
                    disabled={status === 'offline' || !status}
                    onClick={onButtonClick.bind(this, killable ? 'kill' : 'stop')}
                >
                    <StopIcon className={'w-5 h-5 mr-1.5 -ml-1'} />
                    {killable ? 'Kill' : 'Stop'}
                </button>
            </Can>
            <Can action={'control.restart'}>
                <button
                    className={classNames(
                        base,
                        'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500/30 disabled:opacity-50'
                    )}
                    disabled={!status}
                    onClick={onButtonClick.bind(this, 'restart')}
                >
                    <RefreshIcon className={'w-5 h-5 mr-1.5 -ml-1'} />
                    Restart
                </button>
            </Can>
        </div>
    );
};
