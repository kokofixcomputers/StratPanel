import React, { useEffect, useState } from 'react';
import {
    ArchiveIcon,
    ChipIcon,
    CollectionIcon,
    DatabaseIcon,
    GlobeAltIcon,
    LightningBoltIcon,
    SaveIcon,
    SwitchHorizontalIcon,
} from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { bytesToString, mbToBytes } from '@/lib/formatters';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import RingGauge from '@/components/server/console/RingGauge';

const size = (bytes: number) => bytesToString(bytes).replace(/ Bytes$/, ' B');
const megabytes = (value: number) => (value ? size(mbToBytes(value)) : 'Unlimited');

const Tile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className={'flex items-center rounded-lg border border-neutral-500 bg-neutral-700/40 px-4 py-3'}>
        <span
            className={
                'mr-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
            }
        >
            {icon}
        </span>
        <div className={'min-w-0'}>
            <p className={'text-xs uppercase tracking-wide text-neutral-300'}>{label}</p>
            <p className={'truncate text-sm font-semibold text-neutral-50'}>{value}</p>
        </div>
    </div>
);

export default () => {
    const limits = ServerContext.useStoreState((state) => state.server.data!.limits);
    const featureLimits = ServerContext.useStoreState((state) => state.server.data!.featureLimits);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations.length);
    const connected = ServerContext.useStoreState((state) => state.socket.connected);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [used, setUsed] = useState<number | null>(null);

    useEffect(() => {
        if (connected && instance) instance.send(SocketRequest.SEND_STATS);
    }, [connected, instance]);

    useWebsocketEvent(SocketEvent.STATS, (data) => {
        try {
            setUsed(JSON.parse(data).disk_bytes);
        } catch (e) {
            // Ignore malformed frames.
        }
    });

    const total = mbToBytes(limits.disk);
    const percent = used !== null && total ? (used / total) * 100 : 0;
    const color = percent > 90 ? '#dc2626' : percent > 80 ? '#d97706' : undefined;

    return (
        <div className={'mb-6 rounded-xl border border-neutral-500 bg-white p-5 shadow-md md:mb-10'}>
            <p className={'mb-4 flex items-center text-sm font-semibold text-neutral-50'}>
                <ChipIcon className={'mr-2 h-5 w-5 text-primary-600'} />
                Server Limits
            </p>
            <div className={'flex flex-col gap-5 md:flex-row md:items-center'}>
                <div className={'flex items-center md:pr-6'}>
                    <RingGauge percent={percent} size={112} color={color} />
                    <div className={'ml-4'}>
                        <p className={'flex items-center text-xs uppercase tracking-wide text-neutral-300'}>
                            <SaveIcon className={'mr-1 h-4 w-4'} />
                            Disk space
                        </p>
                        <p className={'text-lg font-semibold text-neutral-50'}>
                            {used === null ? '—' : size(used)} used
                        </p>
                        <p className={'text-sm text-neutral-300'}>
                            {total
                                ? `${size(Math.max(total - (used || 0), 0))} available of ${size(total)}`
                                : 'Unlimited'}
                        </p>
                    </div>
                </div>
                <div className={'grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'}>
                    <Tile
                        icon={<CollectionIcon className={'h-5 w-5'} />}
                        label={'Memory'}
                        value={megabytes(limits.memory)}
                    />
                    <Tile
                        icon={<ChipIcon className={'h-5 w-5'} />}
                        label={'CPU'}
                        value={limits.cpu ? `${limits.cpu}%` : 'Unlimited'}
                    />
                    <Tile
                        icon={<SwitchHorizontalIcon className={'h-5 w-5'} />}
                        label={'Swap'}
                        value={limits.swap < 0 ? 'Unlimited' : limits.swap === 0 ? 'Disabled' : megabytes(limits.swap)}
                    />
                    <Tile
                        icon={<LightningBoltIcon className={'h-5 w-5'} />}
                        label={'Block IO weight'}
                        value={String(limits.io)}
                    />
                    <Tile
                        icon={<GlobeAltIcon className={'h-5 w-5'} />}
                        label={'Allocations'}
                        value={`${allocations} of ${featureLimits.allocations}`}
                    />
                    <Tile
                        icon={<DatabaseIcon className={'h-5 w-5'} />}
                        label={'Databases'}
                        value={String(featureLimits.databases)}
                    />
                    <Tile
                        icon={<ArchiveIcon className={'h-5 w-5'} />}
                        label={'Backups'}
                        value={String(featureLimits.backups)}
                    />
                </div>
            </div>
        </div>
    );
};
