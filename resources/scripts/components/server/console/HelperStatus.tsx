import React, { useEffect, useState } from 'react';
import { ArrowCircleUpIcon, CheckIcon, MinusIcon, RefreshIcon, XIcon } from '@heroicons/react/solid';
import classNames from 'classnames';
import { ServerContext } from '@/state/server';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { askPlugin, useBridgeStatus } from '@/lib/bridge';
import { bundledHelperVersion, installHelperPlugin } from '@/lib/helperPlugin';
import { usePermissions } from '@/plugins/usePermissions';

/**
 * Shows whether the StratPanel plugin on the server has answered the panel. Clicking it asks the plugin for fresh
 * information: the players that are online and the list of commands.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const bridge = useBridgeStatus(uuid);
    const [canUpdate] = usePermissions(['file.create']);
    const [bundled, setBundled] = useState<string | null>(null);
    const [updating, setUpdating] = useState(false);
    const [updated, setUpdated] = useState<string | null>(null);
    const [failed, setFailed] = useState('');

    useEffect(() => {
        bundledHelperVersion().then(setBundled);
    }, []);

    // The plugin on the server is not the one that ships with the panel, which is how a server ends up with an old one.
    const outdated =
        bridge.state === 'connected' && !!bridge.version && !!bundled && bridge.version !== bundled && !updated;

    const update = async () => {
        setUpdating(true);
        setFailed('');
        try {
            await installHelperPlugin(uuid);
            setUpdated(bundled);
        } catch (e) {
            setFailed((e as Error).message || 'The plugin could not be uploaded.');
        } finally {
            setUpdating(false);
        }
    };

    const running = status === 'running';
    const busy = bridge.state === 'checking' || bridge.refreshing || updating;

    const detail = [bridge.platform, bridge.minecraft, bridge.version && `plugin ${bridge.version}`]
        .filter(Boolean)
        .join(' · ');
    const title = !running
        ? 'The server is not running, the helper plugin can only answer while it is.'
        : updating
        ? 'Uploading the helper plugin...'
        : updated
        ? `The helper plugin ${updated} was uploaded. Restart the server to load it.`
        : failed
        ? `The helper plugin could not be updated: ${failed}`
        : outdated
        ? `The helper plugin on this server is ${bridge.version}, this panel has ${bundled}.${
              canUpdate ? ' Click to update it, the server has to be restarted afterwards.' : ''
          }`
        : busy
        ? 'Talking to the helper plugin...'
        : bridge.state === 'connected'
        ? `Helper plugin connected${
              detail ? ` (${detail})` : ''
          }. Click to refresh the online players and the command list.`
        : 'The helper plugin did not answer. Install StratPanel on the server for command completion and a reliable player list. Click to try again.';

    const tone = !running
        ? 'border-neutral-500 bg-white text-neutral-400'
        : outdated || failed
        ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
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
                    onClick={() =>
                        outdated && canUpdate ? update() : instance && askPlugin(uuid, instance, 'refresh')
                    }
                    className={classNames(
                        'flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-colors duration-150 disabled:cursor-default',
                        tone
                    )}
                >
                    {busy ? (
                        <RefreshIcon className={'h-5 w-5 animate-spin'} />
                    ) : !running ? (
                        <MinusIcon className={'h-5 w-5'} />
                    ) : outdated || failed ? (
                        <ArrowCircleUpIcon className={'h-5 w-5'} />
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
