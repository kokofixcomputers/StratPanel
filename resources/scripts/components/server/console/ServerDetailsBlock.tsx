import React, { useEffect, useMemo, useState } from 'react';
import { bytesToString, ip, mbToBytes } from '@/lib/formatters';
import { ServerContext } from '@/state/server';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import StatBlock from '@/components/server/console/StatBlock';
import Sensitive from '@/components/elements/Sensitive';
import Sparkline from '@/components/server/console/Sparkline';
import RingGauge from '@/components/server/console/RingGauge';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import usePerformancePolling from '@/plugins/usePerformancePolling';
import { useBridgeStatus } from '@/lib/bridge';
import { msptAlarm, tpsAlarm, usePerformance } from '@/lib/performance';
import { exactBytes, exactNumber } from '@/lib/statFormat';
import BurstBolt from '@/components/server/console/BurstBolt';
import { BurstState, initialBurst, nextBurst } from '@/lib/cpuBurst';

type Stats = Record<'memory' | 'cpu' | 'disk' | 'uptime' | 'rx' | 'tx', number>;

const HISTORY = 30;
const size = (bytes: number) => bytesToString(bytes).replace(/ Bytes$/, ' B');
const emptyHistory = () => Array(HISTORY).fill(0) as number[];
const push = (list: number[], value: number) => [...list.slice(1), value];

/** The lines of a tooltip. */
const Lines = ({ lines }: { lines: (string | null | false)[] }) => (
    <div className={'space-y-0.5'}>
        {lines.filter(Boolean).map((line, index) => (
            <div key={index} className={index === 0 ? '' : 'font-normal text-slate-300'}>
                {line}
            </div>
        ))}
    </div>
);

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
    const [burst, setBurst] = useState<BurstState>(initialBurst);

    const status = ServerContext.useStoreState((state) => state.status.value);
    const connected = ServerContext.useStoreState((state) => state.socket.connected);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const limits = ServerContext.useStoreState((state) => state.server.data!.limits);
    const cpuBurst = ServerContext.useStoreState((state) => state.server.data!.cpuBurst);
    const offline = status === 'offline' || status === null;
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const bridge = useBridgeStatus(uuid);
    const performance = usePerformance(uuid);
    usePerformancePolling();

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
            setBurst(initialBurst);
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

        // The counter of the kernel for burst (Wings sends it when it can read it) tells when the server bursts.
        if (cpuBurst?.enabled && limits.cpu > 0) {
            setBurst((b) =>
                nextBurst(b, {
                    cpu: stats.cpu_absolute,
                    limit: limits.cpu,
                    usec: typeof stats.cpu_burst?.microseconds === 'number' ? stats.cpu_burst.microseconds : undefined,
                    now: Date.now(),
                })
            );
        }

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

    // TPS and MSPT come from the plugin, so there is nothing to show without it, or on software that cannot tell.
    const showPerformance = !offline && bridge.state === 'connected' && performance?.supported !== false;
    const outdated = bridge.state === 'connected' && (bridge.protocol || 1) < 2;
    const bytesPerSecond = (value: number) => `${exactBytes(value)}/s`;
    const diskLimit = limits.disk ? mbToBytes(limits.disk) : 0;
    const memoryLimit = limits.memory ? mbToBytes(limits.memory) : 0;
    const lastRx = history.rx[history.rx.length - 1] || 0;
    const lastTx = history.tx[history.tx.length - 1] || 0;
    const tps = performance?.tps || null;
    const mspt = performance?.mspt || null;

    return (
        <div className={className}>
            <div className={'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'}>
                <StatBlock title={'Server IP'} copyOnClick={allocation} subtitle={'Connection address'} mono>
                    <Sensitive>{allocation}</Sensitive>
                </StatBlock>
                <StatBlock
                    title={'CPU Usage'}
                    adornment={
                        cpuBurst?.enabled &&
                        limits.cpu > 0 && <BurstBolt state={burst} limit={limits.cpu} percent={cpuBurst.percent} />
                    }
                    alarm={getAlarm(cpu, limits.cpu)}
                    subtitle={`of ${textLimits.cpu || 'unlimited'} limit`}
                    exact={
                        <Lines
                            lines={[
                                `${exactNumber(cpu, 2)}% of ${limits.cpu ? `${limits.cpu}%` : 'unlimited'}`,
                                limits.cpu ? `${exactNumber((cpu / limits.cpu) * 100, 2)}% of the limit` : null,
                                `about ${exactNumber(cpu / 100, 2)} ${cpu / 100 === 1 ? 'core' : 'cores'} busy`,
                            ]}
                        />
                    }
                    visual={
                        <Sparkline
                            values={history.cpu}
                            max={limits.cpu || undefined}
                            format={(v) => `${exactNumber(v, 2)}%`}
                        />
                    }
                >
                    {cpu.toFixed(1)}%
                </StatBlock>
                <StatBlock
                    title={'Memory Usage'}
                    alarm={getAlarm(memory / 1024, limits.memory * 1024)}
                    subtitle={`of ${textLimits.memory || 'unlimited'} limit`}
                    exact={
                        <Lines
                            lines={[
                                exactBytes(memory),
                                memoryLimit
                                    ? `${exactNumber((memory / memoryLimit) * 100, 2)}% of ${exactBytes(memoryLimit)}`
                                    : null,
                            ]}
                        />
                    }
                    visual={<Sparkline values={history.memory} max={memoryLimit || undefined} format={exactBytes} />}
                >
                    {size(memory)}
                </StatBlock>
                <StatBlock
                    title={'Disk Usage'}
                    alarm={getAlarm(stats.disk / 1024, limits.disk * 1024)}
                    subtitle={`of ${textLimits.disk || 'unlimited'} limit`}
                    exact={
                        <Lines
                            lines={[
                                exactBytes(stats.disk),
                                diskLimit ? `${exactNumber(diskPercent, 2)}% of ${exactBytes(diskLimit)}` : null,
                            ]}
                        />
                    }
                    visual={<RingGauge percent={diskPercent} />}
                >
                    {size(stats.disk)}
                </StatBlock>
                <StatBlock
                    title={'Incoming Traffic'}
                    subtitle={'Inbound (RX)'}
                    exact={
                        <Lines
                            lines={[
                                exactBytes(offline ? 0 : stats.rx),
                                'received since the server started',
                                `last second: ${bytesPerSecond(lastRx)}`,
                            ]}
                        />
                    }
                    visual={<Sparkline values={history.rx} format={bytesPerSecond} />}
                >
                    {size(offline ? 0 : stats.rx)}
                </StatBlock>
                <StatBlock
                    title={'Outgoing Traffic'}
                    subtitle={'Outbound (TX)'}
                    exact={
                        <Lines
                            lines={[
                                exactBytes(offline ? 0 : stats.tx),
                                'sent since the server started',
                                `last second: ${bytesPerSecond(lastTx)}`,
                            ]}
                        />
                    }
                    visual={<Sparkline values={history.tx} format={bytesPerSecond} />}
                >
                    {size(offline ? 0 : stats.tx)}
                </StatBlock>
            </div>
            {showPerformance && (
                <div className={'mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4'}>
                    <StatBlock
                        title={'TPS'}
                        alarm={tps ? tpsAlarm(tps[0]) : undefined}
                        subtitle={
                            outdated
                                ? 'Update the helper plugin to see this'
                                : tps
                                ? `1m ${tps[0].toFixed(1)} · 5m ${tps[1].toFixed(1)} · 15m ${tps[2].toFixed(1)}`
                                : 'Waiting for the plugin'
                        }
                        exact={
                            tps ? (
                                <Lines
                                    lines={[
                                        `${exactNumber(tps[0], 2)} TPS over the last minute`,
                                        `${exactNumber(tps[1], 2)} over 5 minutes`,
                                        `${exactNumber(tps[2], 2)} over 15 minutes`,
                                        'Ticks per second, 20 is perfect',
                                    ]}
                                />
                            ) : undefined
                        }
                        visual={
                            <Sparkline
                                values={performance?.tpsHistory || []}
                                max={20}
                                format={(v) => `${exactNumber(v, 2)} TPS`}
                                intervalSeconds={5}
                            />
                        }
                    >
                        {tps ? tps[0].toFixed(1) : '—'}
                    </StatBlock>
                    <StatBlock
                        title={'MSPT'}
                        alarm={mspt ? msptAlarm(mspt.avg) : undefined}
                        subtitle={
                            mspt
                                ? mspt.max !== undefined && mspt.min !== undefined
                                    ? `min ${mspt.min.toFixed(1)} · max ${mspt.max.toFixed(1)} ms, last 100 ticks`
                                    : 'Milliseconds per tick'
                                : outdated
                                ? 'Update the helper plugin to see this'
                                : 'Not reported by this server software'
                        }
                        exact={
                            mspt ? (
                                <Lines
                                    lines={[
                                        `${exactNumber(mspt.avg, 2)} ms per tick on average`,
                                        mspt.min !== undefined && `fastest tick ${exactNumber(mspt.min, 2)} ms`,
                                        mspt.max !== undefined && `slowest tick ${exactNumber(mspt.max, 2)} ms`,
                                        'A tick has 50 ms, above that the server falls behind',
                                    ]}
                                />
                            ) : undefined
                        }
                        visual={
                            <Sparkline
                                values={performance?.msptHistory || []}
                                max={50}
                                format={(v) => `${exactNumber(v, 2)} ms`}
                                intervalSeconds={5}
                            />
                        }
                    >
                        {mspt ? `${mspt.avg.toFixed(1)} ms` : '—'}
                    </StatBlock>
                </div>
            )}
        </div>
    );
};

export default ServerDetailsBlock;
