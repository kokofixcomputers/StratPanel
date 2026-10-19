/**
 * CPU burst: a server that stays under its CPU limit saves up what it did not use and can spend it on a short spike above the limit.
 * Wings reads the kernel's counters for that (cpu.stat: how much burst was used since the container started) and sends them with
 * the stats; the server is bursting while that number grows. Wings that does not send it get a guess from the CPU usage being
 * above the limit. The state is kept here, so "active for 12s" means the time this page has seen it go on.
 */

export interface BurstState {
    // The counter of the last sample, null when there was none (or Wings does not send one).
    lastUsec: number | null;
    // When the burst that is going on began, and when it was last seen. Null while there is none.
    activeSince: number | null;
    lastActiveAt: number | null;
    // The last burst that ended.
    lastBurst: { endedAt: number; duration: number } | null;
}

export const initialBurst: BurstState = { lastUsec: null, activeSince: null, lastActiveAt: null, lastBurst: null };

/** How long without burst before it counts as over (a burst comes and goes in the space of a second). */
export const GRACE_MS = 3000;

export interface BurstSample {
    cpu: number;
    limit: number;
    // The counter from the stats, undefined when Wings does not send it.
    usec: number | undefined;
    now: number;
}

/** Whether this sample is a burst: the counter went up, or without a counter, the usage is above the limit. */
export const isBursting = (state: BurstState, sample: BurstSample): boolean => {
    if (sample.usec !== undefined) return state.lastUsec !== null && sample.usec > state.lastUsec;

    return sample.limit > 0 && sample.cpu > sample.limit * 1.02 + 0.5;
};

/** The state after one more sample of the stats. */
export const nextBurst = (state: BurstState, sample: BurstSample): BurstState => {
    const bursting = isBursting(state, sample);
    const lastUsec = sample.usec ?? null;

    if (bursting) {
        return { ...state, lastUsec, activeSince: state.activeSince ?? sample.now, lastActiveAt: sample.now };
    }
    if (state.activeSince !== null && state.lastActiveAt !== null && sample.now - state.lastActiveAt >= GRACE_MS) {
        return {
            lastUsec,
            activeSince: null,
            lastActiveAt: null,
            lastBurst: {
                endedAt: state.lastActiveAt,
                duration: Math.max(1000, state.lastActiveAt - state.activeSince),
            },
        };
    }

    return { ...state, lastUsec };
};

/** "5s", "2m 5s", "1h 3m". */
export const formatDuration = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000));
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}m ${total % 60}s`;

    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/** The lines of the tooltip of the bolt. */
export const describeBurst = (state: BurstState, now: number, limit: number, percent: number): string[] => {
    const top = Math.round(limit + (limit * percent) / 100);
    if (state.activeSince !== null) {
        return [
            `CPU burst active for ${formatDuration(now - state.activeSince)}`,
            `Spending saved CPU to go above the ${limit}% limit`,
        ];
    }
    const lines = ['CPU burst is ready', `Short spikes can go up to about ${top}% (the limit is ${limit}%)`];
    if (state.lastBurst) {
        lines.push(
            `Last burst ${formatDuration(now - state.lastBurst.endedAt)} ago, it lasted ${formatDuration(
                state.lastBurst.duration
            )}`
        );
    }

    return lines;
};
