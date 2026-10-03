import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';
import { Server } from '@/api/server/getServer';
import getServerResourceUsage, { ServerPowerState, ServerStats } from '@/api/server/getServerResourceUsage';
import { bytesToString, ip, mbToBytes } from '@/lib/formatters';
import tw, { TwStyle } from 'twin.macro';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Spinner from '@/components/elements/Spinner';
import styled from 'styled-components/macro';

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

const Metric = ({ label, value, limit, alarm, ratio }: Record<string, any>) => (
    <div css={tw`w-32`}>
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

export default ({ server, className }: { server: Server; className?: string }) => {
    const interval = useRef<Timer>(null) as React.MutableRefObject<Timer>;
    const [isSuspended, setIsSuspended] = useState(server.status === 'suspended');
    const [stats, setStats] = useState<ServerStats | null>(null);

    const getStats = () =>
        getServerResourceUsage(server.uuid)
            .then((data) => setStats(data))
            .catch((error) => console.error(error));

    useEffect(() => {
        setIsSuspended(stats?.isSuspended || server.status === 'suspended');
    }, [stats?.isSuspended, server.status]);

    useEffect(() => {
        // Don't waste a HTTP request if there is nothing important to show to the user because
        // the server is suspended.
        if (isSuspended || server.isNodeUnderMaintenance) return;

        getStats().then(() => {
            interval.current = setInterval(() => getStats(), 30000);
        });

        return () => {
            interval.current && clearInterval(interval.current);
        };
    }, [isSuspended, server.isNodeUnderMaintenance]);

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

    const badge = (text: string, style: TwStyle) => (
        <span css={[tw`rounded-full px-3 py-1 text-xs font-medium border`, style]}>{text}</span>
    );

    return (
        <StatusIndicatorBox as={Link} to={`/server/${server.id}`} className={className} $status={stats?.status}>
            <div css={tw`flex items-center col-span-12 sm:col-span-6 lg:col-span-5 min-w-0`}>
                <div className={'icon mr-4 !w-12 !h-12 flex-shrink-0'}>
                    <FontAwesomeIcon icon={faServer} />
                </div>
                <div css={tw`min-w-0`}>
                    <p css={tw`text-base font-semibold text-neutral-50 truncate`}>{server.name}</p>
                    {address && <p css={tw`text-xs font-mono text-neutral-400 truncate mt-0.5`}>{address}</p>}
                    {!!server.description && (
                        <p css={tw`text-sm text-neutral-400 truncate mt-0.5`}>{server.description}</p>
                    )}
                </div>
            </div>
            <div css={tw`hidden sm:flex col-span-12 sm:col-span-6 lg:col-span-7 items-center justify-end gap-6 pr-4`}>
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
                        <Metric
                            label={'CPU'}
                            value={`${stats.cpuUsagePercent.toFixed(1)}%`}
                            limit={cpuLimit}
                            alarm={alarms.cpu}
                            ratio={percent(stats.cpuUsagePercent, server.limits.cpu)}
                        />
                        <Metric
                            label={'Memory'}
                            value={bytesToString(stats.memoryUsageInBytes)}
                            limit={memoryLimit}
                            alarm={alarms.memory}
                            ratio={percent(stats.memoryUsageInBytes, mbToBytes(server.limits.memory))}
                        />
                        <Metric
                            label={'Disk'}
                            value={bytesToString(stats.diskUsageInBytes)}
                            limit={diskLimit}
                            alarm={alarms.disk}
                            ratio={percent(stats.diskUsageInBytes, mbToBytes(server.limits.disk))}
                        />
                    </>
                )}
            </div>
            <div className={'status-bar'} />
        </StatusIndicatorBox>
    );
};
