import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { ExclamationCircleIcon, GlobeAltIcon } from '@heroicons/react/solid';
import Can from '@/components/elements/Can';
import CopyOnClick from '@/components/elements/CopyOnClick';
import Spinner from '@/components/elements/Spinner';
import Code from '@/components/elements/Code';
import { Button } from '@/components/elements/button/index';
import { useFlashKey } from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import { closeTunnel, openTunnel, useTunnels } from '@/api/server/tunnels';

/**
 * Opening a port of the server to the internet through a tunnel (ngrok, run by the node), so the server can be played without forwarding a
 * port on the router. It is only there when an admin turned tunnels on.
 */
export default ({ allocation }: { allocation: number }) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [polling, setPolling] = useState(false);
    const { data, mutate } = useTunnels({ refreshInterval: polling ? 2000 : 0 });
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('server:network');
    const [busy, setBusy] = useState(false);

    // Looked at again every couple of seconds while the node is opening a tunnel.
    useEffect(() => setPolling(!!data?.allocations.some((a) => a.tunnel?.status === 'pending')), [data]);

    const row = data?.allocations.find((a) => a.id === allocation);
    if (!data || !row || (!data.enabled && !row.tunnel)) return null;

    const tunnel = row.tunnel;
    const act = (work: Promise<unknown>) => {
        clearFlashes();
        setBusy(true);

        return work
            .then((next) => mutate(next as any, false))
            .catch((error) => clearAndAddHttpError(error))
            .then(() => setBusy(false));
    };

    const others = data.allocations.filter((a) => a.id !== allocation && a.tunnel).length;
    const atMax = !tunnel && others >= data.max;

    return (
        <div
            css={tw`-mt-2 mb-3 flex flex-wrap items-center gap-3 rounded-b-xl border border-t-0 border-neutral-500 bg-neutral-900 px-4 py-3 text-sm`}
        >
            <GlobeAltIcon
                css={[
                    tw`h-5 w-5 flex-shrink-0`,
                    tunnel?.status === 'active' ? tw`text-green-600` : tw`text-neutral-400`,
                ]}
            />
            {!tunnel && (
                <>
                    <span css={tw`flex-1 text-neutral-300`}>
                        Not open to the internet. A tunnel lets players connect without port forwarding.
                    </span>
                    <Can action={'allocation.update'}>
                        <Button
                            size={Button.Sizes.Small}
                            disabled={busy || atMax}
                            title={atMax ? `A server can have ${data.max} open at once` : undefined}
                            onClick={() => act(openTunnel(uuid, allocation))}
                        >
                            Open to the internet
                        </Button>
                    </Can>
                </>
            )}
            {tunnel?.status === 'pending' && (
                <>
                    <Spinner size={'small'} isBlue />
                    <span css={tw`flex-1 text-neutral-300`}>Opening the tunnel...</span>
                </>
            )}
            {tunnel?.status === 'waiting' && (
                <span css={tw`flex-1 text-neutral-300`}>
                    Open to the internet while the server runs: the tunnel opens when the server starts.
                </span>
            )}
            {tunnel?.status === 'active' && (
                <>
                    <span css={tw`text-neutral-300`}>Players connect to</span>
                    <CopyOnClick text={tunnel.address || ''}>
                        <Code dark>{tunnel.address || ''}</Code>
                    </CopyOnClick>
                    <span css={tw`flex-1`} />
                </>
            )}
            {tunnel?.status === 'failed' && (
                <>
                    <ExclamationCircleIcon css={tw`h-5 w-5 flex-shrink-0 text-red-500`} />
                    <span css={tw`min-w-0 flex-1 text-red-600`}>
                        {tunnel.error || 'The tunnel could not be opened.'}
                    </span>
                    <Can action={'allocation.update'}>
                        <Button
                            size={Button.Sizes.Small}
                            disabled={busy}
                            onClick={() => act(openTunnel(uuid, allocation))}
                        >
                            Try again
                        </Button>
                    </Can>
                </>
            )}
            {tunnel && (
                <Can action={'allocation.update'}>
                    <Button.Danger
                        size={Button.Sizes.Small}
                        variant={Button.Variants.Secondary}
                        disabled={busy}
                        onClick={() => act(closeTunnel(uuid, tunnel.id))}
                    >
                        Close
                    </Button.Danger>
                </Can>
            )}
        </div>
    );
};
