import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@fortawesome/free-solid-svg-icons';
import { PlayIcon, RefreshIcon, StarIcon as StarSolid, StopIcon } from '@heroicons/react/solid';
import { CheckIcon, FolderAddIcon, FolderIcon, StarIcon } from '@heroicons/react/outline';
import classNames from 'classnames';
import { Link } from 'react-router-dom';
import { Server } from '@/api/server/getServer';
import { ServerPowerState, ServerStats } from '@/api/server/getServerResourceUsage';
import { bytesToString, ip, mbToBytes } from '@/lib/formatters';
import tw, { TwStyle } from 'twin.macro';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Spinner from '@/components/elements/Spinner';
import Sensitive from '@/components/elements/Sensitive';
import styled from 'styled-components/macro';
import useServerSoftware from '@/components/dashboard/useServerSoftware';
import { iconFor, SoftwareType } from '@/lib/mcjars';
import sendPowerAction, { PowerSignal } from '@/api/server/sendPowerAction';
import { httpErrorToHuman } from '@/api/http';
import { DashboardFolder } from '@/api/dashboardLayout';
import { useThemeConfig } from '@/lib/themeConfig';
import DropdownMenu, { DropdownButtonRow } from '@/components/elements/DropdownMenu';

// Determines if the current value is in an alarm threshold so we can show it in red rather
// than the more faded default style.
const isAlarmState = (current: number, limit: number): boolean => limit > 0 && current / (limit * 1024 * 1024) >= 0.9;

const StatusIndicatorBox = styled(GreyRowBox)<{ $status: ServerPowerState | undefined }>`
    ${tw`grid grid-cols-12 gap-4 relative`};

    & .status-bar {
        ${tw`w-1.5 bg-red-500 absolute right-0 z-20 rounded-full m-2 opacity-90 transition-all duration-150`};
        height: calc(100% - 1rem);

        ${({ $status }) =>
            !$status || $status === 'offline'
                ? tw`bg-red-500`
                : $status === 'running'
                ? tw`bg-green-500`
                : tw`bg-yellow-500`};
    }

    &:hover .status-bar {
        ${tw`opacity-100`};
    }
`;

const Metric = ({ label, value, limit, alarm, ratio, card }: Record<string, any>) => (
    <div css={card ? tw`min-w-0` : tw`w-32`}>
        <div css={tw`flex items-baseline justify-between`}>
            <span css={tw`text-2xs uppercase tracking-wide text-neutral-400`}>{label}</span>
            <span css={[tw`text-xs font-semibold`, alarm ? tw`text-red-600` : tw`text-neutral-100`]}>{value}</span>
        </div>
        <div css={tw`mt-1.5 h-1.5 rounded-full bg-neutral-600 overflow-hidden`}>
            <div
                css={[tw`h-full rounded-full transition-all duration-500`, alarm ? tw`bg-red-500` : tw`bg-primary-600`]}
                style={{ width: `${ratio}%` }}
            />
        </div>
        <p css={tw`mt-1 text-2xs text-neutral-400`}>of {limit}</p>
    </div>
);

type Timer = ReturnType<typeof setInterval>;

/**
 * Start, restart and stop of a server, small enough for a row of the list. Only the ones the user may use are shown. The row is a
 * link to the server, so a click on a button must not follow it.
 */
const PowerActions = ({
    server,
    status,
    busy,
    error,
    onAction,
}: {
    server: Server;
    status: ServerPowerState | undefined;
    busy: PowerSignal | null;
    error: string | null;
    onAction: (signal: PowerSignal) => void;
}) => {
    const { start, stop, restart } = server.canControl;
    if (!start && !stop && !restart) return null;

    const button = (signal: PowerSignal, label: string, color: string, icon: React.ReactNode, disabled: boolean) => (
        <button
            type={'button'}
            title={label}
            aria-label={`${label} ${server.name}`}
            disabled={disabled || !!busy}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAction(signal);
            }}
            className={classNames(
                'flex h-9 w-9 items-center justify-center rounded-lg text-snow shadow transition-all duration-150 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-40',
                color
            )}
        >
            {busy === signal ? <Spinner size={'small'} /> : icon}
        </button>
    );

    return (
        <div css={tw`flex flex-shrink-0 flex-col items-end`} onClick={(e) => e.stopPropagation()}>
            <div css={tw`flex items-center gap-2`}>
                {start &&
                    button(
                        'start',
                        'Start',
                        'bg-green-600 hover:bg-green-700 focus-visible:ring-green-600/30',
                        <PlayIcon className={'h-5 w-5'} />,
                        status !== 'offline'
                    )}
                {restart &&
                    button(
                        'restart',
                        'Restart',
                        'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500/30',
                        <RefreshIcon className={'h-5 w-5'} />,
                        status !== 'running' && status !== 'starting'
                    )}
                {stop &&
                    button(
                        'stop',
                        status === 'stopping' ? 'Stopping' : 'Stop',
                        'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600/30',
                        <StopIcon className={'h-5 w-5'} />,
                        status !== 'running' && status !== 'starting'
                    )}
            </div>
            {error && <p css={tw`mt-1 max-w-[14rem] text-right text-2xs text-red-600`}>{error}</p>}
        </div>
    );
};

/** What a person can do with a server on the dashboard besides opening it: star it and put it in a folder. */
export interface RowOrganizer {
    starred: boolean;
    onToggleStar: () => void;
    folders: DashboardFolder[];
    folder: number | null;
    onMove: (folder: number | null) => void;
    onNewFolder: () => void;
}

const FolderMenu = ({ organizer, name }: { organizer: RowOrganizer; name: string }) => (
    <DropdownMenu
        renderToggle={(onClick) => (
            <button
                type={'button'}
                title={'Move to a folder'}
                aria-label={`Move ${name} to a folder`}
                className={classNames(
                    'rounded-md p-1 text-neutral-400 transition-opacity hover:text-neutral-50 focus-visible:opacity-100',
                    organizer.folder === null && 'opacity-0 group-hover:opacity-100'
                )}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick(e);
                }}
            >
                <FolderIcon className={'h-4 w-4'} />
            </button>
        )}
    >
        <div css={tw`p-1 w-56`}>
            {organizer.folders.map((f) => (
                <DropdownButtonRow key={f.id} type={'button'} onClick={() => organizer.onMove(f.id)}>
                    <FolderIcon css={tw`w-4 h-4 mr-2 flex-shrink-0`} />
                    <span css={tw`truncate flex-1 text-left`}>{f.name}</span>
                    {organizer.folder === f.id && <CheckIcon css={tw`w-4 h-4 ml-2 flex-shrink-0`} />}
                </DropdownButtonRow>
            ))}
            {organizer.folder !== null && (
                <DropdownButtonRow type={'button'} onClick={() => organizer.onMove(null)}>
                    Take out of the folder
                </DropdownButtonRow>
            )}
            <DropdownButtonRow type={'button'} onClick={organizer.onNewFolder}>
                <FolderAddIcon css={tw`w-4 h-4 mr-2 flex-shrink-0`} />
                New folder...
            </DropdownButtonRow>
        </div>
    </DropdownMenu>
);

export default ({
    server,
    stats,
    onRefresh,
    organizer,
    players,
    className,
}: {
    server: Server;
    stats: ServerStats | undefined;
    // Who is online, when the server told.
    players?: { online: number; max: number };
    // Looks at the state of the server again, now.
    onRefresh: () => Promise<unknown>;
    organizer?: RowOrganizer;
    className?: string;
}) => {
    const card = useThemeConfig().layout === 'grid';
    const [busy, setBusy] = useState<PowerSignal | null>(null);
    const [powerError, setPowerError] = useState<string | null>(null);
    const watching = useRef<Timer | null>(null);
    const isSuspended = !!stats?.isSuspended || server.status === 'suspended';

    // The state of the server after a power action is looked at every 2 seconds for a while, instead of every 30.
    const watchAfterAction = () => {
        if (watching.current) clearInterval(watching.current);
        let looks = 0;
        watching.current = setInterval(() => {
            onRefresh();
            if (++looks >= 12 && watching.current) {
                clearInterval(watching.current);
                watching.current = null;
            }
        }, 2000);
    };

    useEffect(
        () => () => {
            if (watching.current) clearInterval(watching.current);
        },
        []
    );

    const power = (signal: PowerSignal) => {
        setPowerError(null);
        setBusy(signal);

        sendPowerAction(server.uuid, signal)
            .then(() => {
                onRefresh();
                watchAfterAction();
            })
            .catch((error) => {
                setPowerError(httpErrorToHuman(error));
                setTimeout(() => setPowerError(null), 6000);
            })
            .then(() => setBusy(null));
    };

    // A faint logo of the software behind the card, only for servers that can be reached.
    const software = useServerSoftware(server.uuid, !isSuspended && !server.isNodeUnderMaintenance && !server.status);
    const [logoFailed, setLogoFailed] = useState(false);
    const logo = software && software !== 'VANILLA' && !logoFailed ? iconFor(software as SoftwareType) : null;

    const alarms = { cpu: false, memory: false, disk: false };
    if (stats) {
        alarms.cpu = server.limits.cpu === 0 ? false : stats.cpuUsagePercent >= server.limits.cpu * 0.9;
        alarms.memory = isAlarmState(stats.memoryUsageInBytes, server.limits.memory);
        alarms.disk = server.limits.disk === 0 ? false : isAlarmState(stats.diskUsageInBytes, server.limits.disk);
    }

    const diskLimit = server.limits.disk !== 0 ? bytesToString(mbToBytes(server.limits.disk)) : 'Unlimited';
    const memoryLimit = server.limits.memory !== 0 ? bytesToString(mbToBytes(server.limits.memory)) : 'Unlimited';
    const cpuLimit = server.limits.cpu !== 0 ? server.limits.cpu + ' %' : 'Unlimited';

    const percent = (value: number, limit: number) => (limit > 0 ? Math.min(100, (value / limit) * 100) : 0);
    const address = server.allocations
        .filter((alloc) => alloc.isDefault)
        .map((allocation) => `${allocation.alias || ip(allocation.ip)}:${allocation.port}`)
        .join(', ');

    // Buttons only for a server that can be reached: not suspended, not on a node in maintenance, not installing or transferring.
    const controllable =
        !!stats && !isSuspended && !server.isNodeUnderMaintenance && !server.status && !server.isTransferring;
    const powerActions = controllable ? (
        <PowerActions server={server} status={stats?.status} busy={busy} error={powerError} onAction={power} />
    ) : null;

    const badge = (text: string, style: TwStyle) => (
        <span css={[tw`rounded-full px-3 py-1 text-xs font-medium border`, style]}>{text}</span>
    );

    return (
        <StatusIndicatorBox
            as={Link}
            to={`/server/${server.id}`}
            draggable={false}
            className={classNames('group', className)}
            $status={stats?.status}
            style={{ isolation: 'isolate', overflow: 'hidden' }}
        >
            {logo && (
                <img
                    src={logo}
                    alt={''}
                    aria-hidden
                    onError={() => setLogoFailed(true)}
                    style={{
                        position: 'absolute',
                        right: '46%',
                        top: '50%',
                        height: '170%',
                        transform: 'translateY(-50%)',
                        opacity: 0.08,
                        zIndex: -1,
                        pointerEvents: 'none',
                    }}
                />
            )}
            <div css={[tw`flex items-center col-span-12 min-w-0`, !card && tw`sm:col-span-6 lg:col-span-5`]}>
                <div className={'icon mr-4 !w-12 !h-12 flex-shrink-0'}>
                    <FontAwesomeIcon icon={faServer} />
                </div>
                <div css={tw`min-w-0`}>
                    <div css={tw`flex items-center gap-1 min-w-0`}>
                        <p css={tw`text-base font-semibold text-neutral-50 truncate`}>{server.name}</p>
                        {organizer && (
                            <>
                                <button
                                    type={'button'}
                                    title={organizer.starred ? 'Remove the star' : 'Star this server'}
                                    aria-label={`${organizer.starred ? 'Unstar' : 'Star'} ${server.name}`}
                                    aria-pressed={organizer.starred}
                                    className={classNames(
                                        'rounded-md p-1 transition-opacity focus-visible:opacity-100',
                                        organizer.starred
                                            ? 'text-amber-500'
                                            : 'text-neutral-400 opacity-0 hover:text-amber-500 group-hover:opacity-100'
                                    )}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        organizer.onToggleStar();
                                    }}
                                >
                                    {organizer.starred ? (
                                        <StarSolid className={'h-4 w-4'} />
                                    ) : (
                                        <StarIcon className={'h-4 w-4'} />
                                    )}
                                </button>
                                <FolderMenu organizer={organizer} name={server.name} />
                            </>
                        )}
                    </div>
                    {address && (
                        <p css={tw`text-xs font-mono text-neutral-400 truncate mt-0.5`}>
                            <Sensitive>{address}</Sensitive>
                        </p>
                    )}
                    {!!server.description && (
                        <p css={tw`text-sm text-neutral-400 truncate mt-0.5`}>{server.description}</p>
                    )}
                </div>
            </div>
            <div
                css={[
                    tw`hidden col-span-12`,
                    card
                        ? tw`grid grid-cols-2 gap-x-4 gap-y-3 pr-4`
                        : tw`sm:col-span-6 lg:col-span-7 justify-end gap-6 pr-4`,
                ]}
            >
                {!stats || isSuspended || server.isNodeUnderMaintenance ? (
                    isSuspended ? (
                        badge(
                            server.status === 'suspended' ? 'Suspended' : 'Connection Error',
                            tw`bg-red-50 text-red-700 border-red-200`
                        )
                    ) : server.isNodeUnderMaintenance ? (
                        badge('Under Maintenance', tw`bg-yellow-50 text-yellow-700 border-yellow-200`)
                    ) : server.isTransferring || server.status ? (
                        badge(
                            server.isTransferring
                                ? 'Transferring'
                                : server.status === 'installing'
                                ? 'Installing'
                                : server.status === 'restoring_backup'
                                ? 'Restoring Backup'
                                : 'Unavailable',
                            tw`bg-neutral-600 text-neutral-200 border-neutral-500`
                        )
                    ) : (
                        <Spinner size={'small'} isBlue />
                    )
                ) : (
                    <>
                        {!players && !card && <div css={tw`w-32 hidden lg:block`} aria-hidden />}
                        {players && (
                            <Metric
                                card={card}
                                label={'Players'}
                                value={`${players.online}/${players.max || '?'}`}
                                limit={players.online === 1 ? '1 player online' : `${players.online} online`}
                                alarm={players.max > 0 && players.online >= players.max}
                                ratio={percent(players.online, players.max)}
                            />
                        )}
                        <Metric
                            card={card}
                            label={'CPU'}
                            value={`${stats.cpuUsagePercent.toFixed(1)}%`}
                            limit={cpuLimit}
                            alarm={alarms.cpu}
                            ratio={percent(stats.cpuUsagePercent, server.limits.cpu)}
                        />
                        <Metric
                            card={card}
                            label={'Memory'}
                            value={bytesToString(stats.memoryUsageInBytes)}
                            limit={memoryLimit}
                            alarm={alarms.memory}
                            ratio={percent(stats.memoryUsageInBytes, mbToBytes(server.limits.memory))}
                        />
                        <Metric
                            card={card}
                            label={'Disk'}
                            value={bytesToString(stats.diskUsageInBytes)}
                            limit={diskLimit}
                            alarm={alarms.disk}
                            ratio={percent(stats.diskUsageInBytes, mbToBytes(server.limits.disk))}
                        />
                    </>
                )}
                {!card && powerActions}
            </div>
            {powerActions && (
                <div css={[tw`col-span-12 flex justify-end pr-4`, !card && tw`sm:hidden`]}>{powerActions}</div>
            )}
            <div className={'status-bar'} />
        </StatusIndicatorBox>
    );
};
