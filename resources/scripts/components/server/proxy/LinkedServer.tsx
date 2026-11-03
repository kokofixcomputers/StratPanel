import React, { useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import { Link } from 'react-router-dom';
import { LockClosedIcon, PencilIcon, UsersIcon } from '@heroicons/react/solid';
import { Server } from '@/api/server/getServer';
import { ServerStats } from '@/api/server/getServerResourceUsage';
import { PlayerCount } from '@/api/palette';
import sendPowerAction, { PowerSignal } from '@/api/server/sendPowerAction';
import { httpErrorToHuman } from '@/api/http';
import { PowerActions } from '@/components/dashboard/ServerRow';
import useServerSoftware from '@/components/dashboard/useServerSoftware';
import { iconFor, SoftwareType } from '@/lib/mcjars';
import { useHiddenClass } from '@/components/elements/Sensitive';
import Input from '@/components/elements/Input';
import { privateAddressOf } from '@/lib/proxyLink';

const DOT = {
    running: 'bg-green-500',
    starting: 'bg-yellow-500',
    stopping: 'bg-yellow-500',
    offline: 'bg-red-500',
};

interface Props {
    server: Server;
    stats?: ServerStats;
    players?: PlayerCount;
    // The address in velocity.toml, and the name the proxy knows the server by.
    address: string;
    name: string;
    // Whether the proxy itself is on the private network, which is what makes the private address usable.
    proxyJoined: boolean;
    onName: (name: string) => void;
    onAddress: (address: string) => void;
    onEdit: () => void;
    onRefresh: () => Promise<unknown>;
}

/**
 * A server of the account in the list of a proxy: the same things the dashboard shows of it (state, players, power buttons) instead of
 * a name and an address to type. The address is kept in velocity.toml as it always was.
 */
export default ({
    server,
    stats,
    players,
    address,
    name,
    proxyJoined,
    onName,
    onAddress,
    onEdit,
    onRefresh,
}: Props) => {
    const hiddenClass = useHiddenClass();
    const [busy, setBusy] = useState<PowerSignal | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const software = useServerSoftware(server.uuid, !server.status && !server.isNodeUnderMaintenance);
    const [logoFailed, setLogoFailed] = useState(false);

    useEffect(
        () => () => {
            if (timer.current) clearInterval(timer.current);
        },
        []
    );

    const power = (signal: PowerSignal) => {
        setError(null);
        setBusy(signal);
        sendPowerAction(server.uuid, signal)
            .then(() => {
                onRefresh();
                // The state is looked at every 2 seconds for a while after, instead of every 30.
                if (timer.current) clearInterval(timer.current);
                let looks = 0;
                timer.current = setInterval(() => {
                    onRefresh();
                    if (++looks >= 12 && timer.current) clearInterval(timer.current);
                }, 2000);
            })
            .catch((e) => {
                setError(httpErrorToHuman(e));
                setTimeout(() => setError(null), 6000);
            })
            .then(() => setBusy(null));
    };

    const state = stats?.status;
    const suspended = !!stats?.isSuspended || server.status === 'suspended';
    const priv = privateAddressOf(server);
    const onPrivate = !!server.privateAddress && address.startsWith(`${server.privateAddress}:`);
    const logo = software && software !== 'VANILLA' && !logoFailed ? iconFor(software as SoftwareType) : null;

    return (
        <>
            <div css={tw`flex items-center gap-3 min-w-0 flex-1 min-w-[18rem]`}>
                <span css={tw`relative flex-shrink-0`}>
                    <span
                        css={tw`flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-neutral-600 text-primary-600`}
                    >
                        {logo ? (
                            <img src={logo} alt={''} css={tw`h-7 w-7`} onError={() => setLogoFailed(true)} />
                        ) : (
                            <span css={tw`text-lg font-bold`}>{server.name.slice(0, 1).toUpperCase()}</span>
                        )}
                    </span>
                    <span
                        title={suspended ? 'Suspended' : state || 'Looking...'}
                        className={suspended ? 'bg-neutral-400' : DOT[state || 'offline']}
                        css={tw`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white`}
                    />
                </span>
                <div css={tw`min-w-0 flex-1`}>
                    <div css={tw`flex items-center gap-2 min-w-0`}>
                        <Link
                            to={`/server/${server.id}`}
                            css={tw`truncate text-sm font-semibold text-neutral-50 hover:text-primary-600`}
                        >
                            {server.name}
                        </Link>
                        <span css={tw`flex-shrink-0 text-2xs uppercase tracking-wide text-neutral-400`}>
                            {suspended ? 'suspended' : state || '...'}
                        </span>
                    </div>
                    <div css={tw`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1`}>
                        <label css={tw`flex items-center gap-1.5 text-2xs text-neutral-400`}>
                            Velocity name
                            <Input
                                type={'text'}
                                value={name}
                                placeholder={'name'}
                                aria-label={'Name in the proxy'}
                                css={tw`!w-28 !py-0.5 !px-2 !text-xs`}
                                onChange={(e) => onName(e.currentTarget.value.replace(/[^\w-]/g, ''))}
                            />
                        </label>
                        <span
                            className={hiddenClass}
                            title={onPrivate ? 'Players are sent over the private network' : 'Players are sent here'}
                            css={tw`inline-flex items-center gap-1 font-mono text-xs text-neutral-300`}
                        >
                            {onPrivate && <LockClosedIcon css={tw`h-3.5 w-3.5 text-primary-600`} />}
                            {address}
                        </span>
                        {onPrivate && <span css={tw`text-2xs font-semibold text-primary-600`}>private network</span>}
                        {!onPrivate && priv && proxyJoined && (
                            <button
                                type={'button'}
                                onClick={() => onAddress(priv)}
                                css={tw`text-2xs font-semibold text-primary-600 hover:underline`}
                            >
                                Use the private network
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <span
                title={players ? `${players.online} online` : 'Players online, when the server is running'}
                css={tw`inline-flex w-16 flex-shrink-0 items-center justify-center gap-1 rounded-full bg-neutral-600 px-2 py-1 text-xs font-semibold text-neutral-200`}
            >
                <UsersIcon css={tw`h-3.5 w-3.5 text-neutral-400`} />
                {players ? `${players.online}/${players.max || '?'}` : '-'}
            </span>
            <PowerActions server={server} status={state} busy={busy} error={error} onAction={power} />
            <button
                type={'button'}
                aria-label={'Edit the name and address by hand'}
                title={'Edit the name and address by hand'}
                onClick={onEdit}
                css={tw`p-2 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-600 transition-colors duration-150`}
            >
                <PencilIcon css={tw`w-4 h-4`} />
            </button>
        </>
    );
};
