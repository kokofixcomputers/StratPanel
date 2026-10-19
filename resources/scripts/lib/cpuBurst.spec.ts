import {
    BurstState,
    describeBurst,
    formatDuration,
    GRACE_MS,
    initialBurst,
    isBursting,
    nextBurst,
} from '@/lib/cpuBurst';

const sample = (now: number, usec: number | undefined, cpu = 50, limit = 100) => ({ now, usec, cpu, limit });

describe('with the counter of Wings', () => {
    it('is bursting while the counter grows, never on the first sample', () => {
        let s = nextBurst(initialBurst, sample(1000, 5000));
        expect(s.activeSince).toBeNull();
        expect(s.lastUsec).toBe(5000);

        s = nextBurst(s, sample(2000, 5000));
        expect(s.activeSince).toBeNull();

        s = nextBurst(s, sample(3000, 9000));
        expect(s.activeSince).toBe(3000);
        s = nextBurst(s, sample(4000, 15000));
        expect(s.activeSince).toBe(3000);
        expect(s.lastActiveAt).toBe(4000);
    });

    it('does not let go at once, a burst comes and goes', () => {
        let s: BurstState = nextBurst(nextBurst(initialBurst, sample(1000, 1)), sample(2000, 100));
        s = nextBurst(s, sample(3000, 100));
        s = nextBurst(s, sample(2000 + GRACE_MS - 1, 100));
        expect(s.activeSince).toBe(2000);
        // And it carries on as one burst when it comes back within that time.
        s = nextBurst(s, sample(2000 + GRACE_MS - 1 + 500, 400));
        expect(s.activeSince).toBe(2000);
    });

    it('ends after a quiet while and remembers how long it lasted', () => {
        let s: BurstState = nextBurst(nextBurst(initialBurst, sample(1000, 1)), sample(2000, 100));
        s = nextBurst(s, sample(12000, 200));
        s = nextBurst(s, sample(12000 + GRACE_MS, 200));
        expect(s.activeSince).toBeNull();
        expect(s.lastBurst).toEqual({ endedAt: 12000, duration: 10000 });
    });

    it('a counter that starts over (a restart) is not a burst', () => {
        let s: BurstState = nextBurst(nextBurst(initialBurst, sample(1000, 900000)), sample(2000, 900000));
        s = nextBurst(s, sample(3000, 10));
        expect(s.activeSince).toBeNull();
    });
});

describe('without the counter', () => {
    it('guesses from the usage being above the limit', () => {
        expect(isBursting(initialBurst, sample(1, undefined, 100, 100))).toBe(false);
        expect(isBursting(initialBurst, sample(1, undefined, 102, 100))).toBe(false);
        expect(isBursting(initialBurst, sample(1, undefined, 140, 100))).toBe(true);
        expect(isBursting(initialBurst, sample(1, undefined, 140, 0))).toBe(false);
    });
});

describe('the words', () => {
    it('formats durations', () => {
        expect(formatDuration(0)).toBe('0s');
        expect(formatDuration(5400)).toBe('5s');
        expect(formatDuration(125000)).toBe('2m 5s');
        expect(formatDuration(3780000)).toBe('1h 3m');
    });

    it('says how long a burst has gone on', () => {
        const active: BurstState = { ...initialBurst, activeSince: 1000, lastActiveAt: 13000 };
        expect(describeBurst(active, 13000, 100, 100)).toEqual([
            'CPU burst active for 12s',
            'Spending saved CPU to go above the 100% limit',
        ]);
    });

    it('says what is possible while it is not going on, and when it last was', () => {
        expect(describeBurst(initialBurst, 0, 200, 50)).toEqual([
            'CPU burst is ready',
            'Short spikes can go up to about 300% (the limit is 200%)',
        ]);
        const after: BurstState = { ...initialBurst, lastBurst: { endedAt: 1000, duration: 8000 } };
        expect(describeBurst(after, 181000, 100, 100)[2]).toBe('Last burst 3m 0s ago, it lasted 8s');
    });
});
