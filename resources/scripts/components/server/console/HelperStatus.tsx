import React from 'react';
import { CheckIcon, MinusIcon, RefreshIcon, XIcon } from '@heroicons/react/solid';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { askPlugin, useBridgeStatus } from '@/lib/bridge';

/**
 * Shows whether the StratPanel plugin on the server has answered the panel. Clicking it asks the plugin for fresh
 * information: the players that are online and the list of commands.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const bridge = useBridgeStatus(uuid);

    const running = status === 'running';
    const busy = bridge.state === 'checking' || bridge.refreshing;

    const detail = [bridge.platform, bridge.minecraft, bridge.version && `plugin ${bridge.version}`]
        .filter(Boolean)
        .join(' · ');
    const title = !running
        ? 'The server is not running, the helper plugin can only answer while it is.'
        : busy
        ? 'Talking to the helper plugin...'
        : bridge.state === 'connected'
        ? `Helper plugin connected${
              detail ? ` (${detail})` : ''
          }. Click to refresh the online players and the command list.`
        : 'The helper plugin did not answer. Install StratPanel on the server for command completion and a reliable player list. Click to try again.';

    const tone = !running
        ? 'border-neutral-500 bg-white text-neutral-400'
        : bridge.state === 'connected'
        ? 'border-green-200 bg-green-50 text-green-700'
        : bridge.state === 'missing'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-neutral-500 bg-white text-neutral-400';

    return (
        // The wrapper takes the hover so the tooltip still shows while the button itself is disabled.
        <Tooltip content={title} rest={0} delay={0} placement={'bottom'}>
            <span className={'inline-flex'}>
                <button
                    type={'button'}
                    aria-label={title}
                    disabled={!running || !instance || busy}
                    onClick={() => instance && askPlugin(uuid, instance, 'refresh')}
                    className={classNames(
                        'flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-colors duration-150 disabled:cursor-default',
                        tone
                    )}
                >
                    {busy ? (
                        <RefreshIcon className={'h-5 w-5 animate-spin'} />
                    ) : !running ? (
                        <MinusIcon className={'h-5 w-5'} />
                    ) : bridge.state === 'connected' ? (
                        <CheckIcon className={'h-5 w-5'} />
                    ) : bridge.state === 'missing' ? (
                        <XIcon className={'h-5 w-5'} />
                    ) : (
                        <MinusIcon className={'h-5 w-5'} />
                    )}
                </button>
            </span>
        </Tooltip>
    );
};
