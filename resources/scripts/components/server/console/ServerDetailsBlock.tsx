import React, { useEffect, useMemo, useState } from 'react';
import { bytesToString, ip, mbToBytes } from '@/lib/formatters';
import { ServerContext } from '@/state/server';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import StatBlock from '@/components/server/console/StatBlock';
import Sparkline from '@/components/server/console/Sparkline';
import RingGauge from '@/components/server/console/RingGauge';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import classNames from 'classnames';

type Stats = Record<'memory' | 'cpu' | 'disk' | 'uptime' | 'rx' | 'tx', number>;

const HISTORY = 30;
const size = (bytes: number) => bytesToString(bytes).replace(/ Bytes$/, ' B');
const emptyHistory = () => Array(HISTORY).fill(0) as number[];
const push = (list: number[], value: number) => [...list.slice(1), value];

const getAlarm = (value: number, max: number | null): 'warning' | 'danger' | undefined => {
    const delta = !max ? 0 : value / max;

    return delta > 0.9 ? 'danger' : delta > 0.8 ? 'warning' : undefined;
};

const ServerDetailsBlock = ({ className }: { className?: string }) => {
    const [stats, setStats] = useState<Stats>({ memory: 0, cpu: 0, disk: 0, uptime: 0, tx: 0, rx: 0 });
    const [history, setHistory] = useState({
        cpu: emptyHistory(),
        memory: emptyHistory(),
        rx: emptyHistory(),
        tx: emptyHistory(),
    });
    const previous = React.useRef({ rx: -1, tx: -1 });

    const status = ServerContext.useStoreState((state) => state.status.value);
    const connected = ServerContext.useStoreState((state) => state.socket.connected);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const limits = ServerContext.useStoreState((state) => state.server.data!.limits);
    const offline = status === 'offline' || status === null;

    const textLimits = useMemo(
        () => ({
            cpu: limits?.cpu ? `${limits.cpu}%` : null,
            memory: limits?.memory ? bytesToString(mbToBytes(limits.memory)) : null,
            disk: limits?.disk ? bytesToString(mbToBytes(limits.disk)) : null,
        }),
        [limits]
    );

    const allocation = ServerContext.useStoreState((state) => {
        const match = state.server.data!.allocations.find((allocation) => allocation.isDefault);

        return !match ? 'n/a' : `${match.alias || ip(match.ip)}:${match.port}`;
    });

    useEffect(() => {
        if (!connected || !instance) {
            return;
        }

        instance.send(SocketRequest.SEND_STATS);
    }, [instance, connected]);

    useEffect(() => {
        if (offline) {
            previous.current = { rx: -1, tx: -1 };
            setHistory({ cpu: emptyHistory(), memory: emptyHistory(), rx: emptyHistory(), tx: emptyHistory() });
        }
    }, [offline]);

    useWebsocketEvent(SocketEvent.STATS, (data) => {
        let stats: any = {};
        try {
            stats = JSON.parse(data);
        } catch (e) {
            return;
        }

        setStats({
            memory: stats.memory_bytes,
            cpu: stats.cpu_absolute,
            disk: stats.disk_bytes,
            tx: stats.network.tx_bytes,
            rx: stats.network.rx_bytes,
            uptime: stats.uptime || 0,
        });

        setHistory((h) => ({
            cpu: push(h.cpu, stats.cpu_absolute),
            memory: push(h.memory, stats.memory_bytes),
            rx: push(h.rx, previous.current.rx < 0 ? 0 : Math.max(0, stats.network.rx_bytes - previous.current.rx)),
            tx: push(h.tx, previous.current.tx < 0 ? 0 : Math.max(0, stats.network.tx_bytes - previous.current.tx)),
        }));
        previous.current = { rx: stats.network.rx_bytes, tx: stats.network.tx_bytes };
    });

    const diskPercent = limits.disk ? (stats.disk / mbToBytes(limits.disk)) * 100 : 0;
    const cpu = offline ? 0 : stats.cpu;
    const memory = offline ? 0 : stats.memory;

    return (
        <div className={classNames('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
            <StatBlock title={'Server IP'} copyOnClick={allocation} subtitle={'Connection address'} mono>
                {allocation}
            </StatBlock>
            <StatBlock
                title={'CPU Usage'}
                alarm={getAlarm(cpu, limits.cpu)}
                subtitle={`of ${textLimits.cpu || 'unlimited'} limit`}
                visual={<Sparkline values={history.cpu} max={limits.cpu || undefined} />}
            >
                {cpu.toFixed(1)}%
            </StatBlock>
            <StatBlock
                title={'Memory Usage'}
                alarm={getAlarm(memory / 1024, limits.memory * 1024)}
                subtitle={`of ${textLimits.memory || 'unlimited'} limit`}
                visual={
                    <Sparkline values={history.memory} max={limits.memory ? mbToBytes(limits.memory) : undefined} />
                }
            >
                {size(memory)}
            </StatBlock>
            <StatBlock
                title={'Disk Usage'}
                alarm={getAlarm(stats.disk / 1024, limits.disk * 1024)}
                subtitle={`of ${textLimits.disk || 'unlimited'} limit`}
                visual={<RingGauge percent={diskPercent} />}
            >
                {size(stats.disk)}
            </StatBlock>
            <StatBlock title={'Incoming Traffic'} subtitle={'Inbound (RX)'} visual={<Sparkline values={history.rx} />}>
                {size(offline ? 0 : stats.rx)}
            </StatBlock>
            <StatBlock title={'Outgoing Traffic'} subtitle={'Outbound (TX)'} visual={<Sparkline values={history.tx} />}>
                {size(offline ? 0 : stats.tx)}
            </StatBlock>
        </div>
    );
};

export default ServerDetailsBlock;
