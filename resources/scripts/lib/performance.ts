/**
 * TPS and MSPT of the server, from the "performance" message of the Stratosphere plugin (protocol 2):
 *   {"event":"performance","tps":[19.98,20,20],"mspt":{"avg":12.4,"min":3.1,"max":41},"supported":true}
 * tps is the average of the last 1, 5 and 15 minutes. mspt is over the last 100 ticks, only avg when the server cannot
 * give more. Only messages that passed the trust check of the bridge are handed to this.
 */
import { useEffect, useState } from 'react';
import { BridgeMessage } from '@/lib/bridge';
import { parseWorld, WorldNow } from '@/lib/worldClock';

export interface PerformanceNow {
    // Whether the server software can report TPS or MSPT at all (Folia cannot).
    supported: boolean;
    tps: number[] | null;
    mspt: { avg: number; min?: number; max?: number } | null;
    // The time and the weather, from a helper that knows them (protocol 8).
    world: WorldNow | null;
}

export interface PerformanceState extends PerformanceNow {
    tpsHistory: number[];
    msptHistory: number[];
    updatedAt: number;
}

export const HISTORY = 30;
/** How often the panel asks while somebody is looking at the console. */
export const POLL_MS = 5000;

const num = (value: unknown, max: number): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

/** The numbers of a message, nothing the plugin does not send is made up, and a number out of range is dropped. */
export const parsePerformance = (message: BridgeMessage): PerformanceNow | null => {
    if (message.event !== 'performance') return null;

    const tps = Array.isArray(message.tps) ? message.tps.slice(0, 3).map((v) => num(v, 20.5)) : [];
    const given = message.mspt && typeof message.mspt === 'object' ? (message.mspt as Record<string, unknown>) : {};
    const avg = num(given.avg, 100000);
    const min = num(given.min, 100000);
    const max = num(given.max, 100000);

    const validTps = tps.length > 0 && tps.every((v) => v !== null) ? (tps as number[]) : null;
    const mspt = avg === null ? null : { avg, ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };

    return {
        supported: message.supported !== false && (validTps !== null || mspt !== null),
        tps: validTps,
        mspt,
        world: parseWorld(message.world),
    };
};

export const pushHistory = (list: number[], value: number): number[] => [...list.slice(-(HISTORY - 1)), value];

// The vanilla budget of a tick is 50 ms, a server falling behind it loses TPS.
export const tpsAlarm = (tps: number): 'warning' | 'danger' | undefined =>
    tps < 15 ? 'danger' : tps < 18 ? 'warning' : undefined;
export const msptAlarm = (ms: number): 'warning' | 'danger' | undefined =>
    ms > 50 ? 'danger' : ms > 40 ? 'warning' : undefined;

const states = new Map<string, PerformanceState>();
const listeners = new Set<() => void>();

export const readPerformance = (server: string): PerformanceState | null => states.get(server) || null;

const notify = () => listeners.forEach((listener) => listener());

export const handlePerformanceMessage = (server: string, message: BridgeMessage) => {
    const now = parsePerformance(message);
    if (!now) return;

    const previous = states.get(server);
    states.set(server, {
        ...now,
        tpsHistory: now.tps ? pushHistory(previous?.tpsHistory || [], now.tps[0]) : previous?.tpsHistory || [],
        msptHistory: now.mspt ? pushHistory(previous?.msptHistory || [], now.mspt.avg) : previous?.msptHistory || [],
        updatedAt: Date.now(),
    });
    notify();
};

/** A server that is not running has no TPS. */
export const clearPerformance = (server: string) => {
    if (states.delete(server)) notify();
};

export const usePerformance = (server: string): PerformanceState | null => {
    const [state, setState] = useState(readPerformance(server));

    useEffect(() => {
        const update = () => setState(readPerformance(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return state;
};
