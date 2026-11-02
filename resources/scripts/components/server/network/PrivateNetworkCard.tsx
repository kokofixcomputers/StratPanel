import React, { useState } from 'react';
import tw from 'twin.macro';
import { LockClosedIcon } from '@heroicons/react/solid';
import Can from '@/components/elements/Can';
import CopyOnClick from '@/components/elements/CopyOnClick';
import Code from '@/components/elements/Code';
import { Button } from '@/components/elements/button/index';
import { useFlashKey } from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import { joinPrivateNetwork, leavePrivateNetwork, usePrivateNetwork } from '@/api/server/privateNetwork';

/**
 * The private network between the servers of a person: a server that joined has an address the others reach it on, without the traffic going
 * over the public internet. It is only there when an admin turned the private network on.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { data, mutate } = usePrivateNetwork();
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('server:network');
    const [busy, setBusy] = useState(false);

    if (!data || !data.enabled) return null;

    const act = (work: Promise<unknown>) => {
        clearFlashes();
        setBusy(true);

        return work
            .then((next) => mutate(next as any, false))
            .catch((error) => clearAndAddHttpError(error))
            .then(() => setBusy(false));
    };

    return (
        <div css={tw`mb-4 rounded-xl border border-neutral-500 bg-white p-4 shadow`}>
            <div css={tw`flex flex-wrap items-center gap-3`}>
                <span
                    css={tw`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600`}
                >
                    <LockClosedIcon css={tw`h-5 w-5`} />
                </span>
                <div css={tw`min-w-0 flex-1`}>
                    <p css={tw`text-sm font-semibold text-neutral-50`}>
                        {data.joined ? 'On the private network' : 'Not on the private network'}
                    </p>
                    <p css={tw`text-xs text-neutral-400`}>
                        {data.joined
                            ? 'The other servers of your account that joined reach this one on this address, without going over the public internet.'
                            : data.available
                            ? 'Join to give this server a private address that the servers you connect it to can reach it on. Reach other servers directly, without going over the public internet.'
                            : 'The node this server runs on is not on the private network, so it cannot join. Ask an administrator to enable it for the node.'}
                    </p>
                </div>
                {data.joined && data.address && (
                    <CopyOnClick text={data.address}>
                        <Code dark>{data.address}</Code>
                    </CopyOnClick>
                )}
                <Can action={'allocation.update'}>
                    {data.joined ? (
                        <Button.Danger
                            size={Button.Sizes.Small}
                            variant={Button.Variants.Secondary}
                            disabled={busy}
                            onClick={() => act(leavePrivateNetwork(uuid))}
                        >
                            Leave
                        </Button.Danger>
                    ) : (
                        <Button
                            size={Button.Sizes.Small}
                            disabled={busy || !data.available}
                            onClick={() => act(joinPrivateNetwork(uuid))}
                        >
                            Join
                        </Button>
                    )}
                </Can>
            </div>
            {data.joined && (
                <div css={tw`mt-3 border-t border-neutral-500 pt-3`}>
                    {data.others.length === 0 ? (
                        <p css={tw`text-xs text-neutral-400`}>
                            No other server of yours is on the private network yet. Join the others to reach them here.
                        </p>
                    ) : (
                        <ul css={tw`space-y-1.5`}>
                            {data.others.map((other) => (
                                <li key={other.identifier} css={tw`flex items-center justify-between gap-3 text-sm`}>
                                    <span css={tw`truncate text-neutral-200`}>{other.name}</span>
                                    <CopyOnClick text={other.address}>
                                        <Code dark>{other.address}</Code>
                                    </CopyOnClick>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p css={tw`mt-2 text-xs text-neutral-400`}>
                        Use these addresses with the port the other server listens on (for a Velocity proxy: the servers
                        section of velocity.toml).
                    </p>
                </div>
            )}
        </div>
    );
};
