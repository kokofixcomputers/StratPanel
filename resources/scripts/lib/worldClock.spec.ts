import {
    clockOf,
    isDaytime,
    MAX_COAST_MS,
    nextSample,
    parseWorld,
    projectDay,
    projectTime,
    TICKS_PER_MS,
    weatherOf,
} from '@/lib/worldClock';
import { parsePerformance } from '@/lib/performance';

const world = (time: number, patch = {}) => ({ time, day: 1, raining: false, thundering: false, ...patch });

describe('parseWorld', () => {
    it('reads what the helper sends', () => {
        expect(parseWorld({ time: 13000, day: 12, raining: true, thundering: false })).toEqual({
            time: 13000,
            day: 12,
            raining: true,
            thundering: false,
        });
    });

    it('counts a storm as rain', () => {
        expect(parseWorld({ time: 0, day: 1, raining: false, thundering: true })?.raining).toBe(true);
    });

    it.each([
        null,
        undefined,
        'x',
        {},
        { time: -1, day: 1, raining: false, thundering: false },
        { time: 24000, day: 1, raining: false, thundering: false },
        { time: 1.5, day: 1, raining: false, thundering: false },
        { time: '5', day: 1, raining: false, thundering: false },
        { time: 5, day: 0, raining: false, thundering: false },
        { time: 5, day: 1, raining: 'yes', thundering: false },
        { time: 5, day: 1, raining: false },
    ])('refuses %j', (value) => expect(parseWorld(value)).toBeNull());

    it('comes with the performance message, or not at all', () => {
        const message = {
            event: 'performance',
            tps: [20, 20, 20],
            world: { time: 6000, day: 2, raining: false, thundering: false },
        };
        expect(parsePerformance(message)?.world).toEqual({ time: 6000, day: 2, raining: false, thundering: false });
        expect(parsePerformance({ event: 'performance', tps: [20, 20, 20] })?.world).toBeNull();
        expect(parsePerformance({ ...message, world: { time: 'x' } })?.world).toBeNull();
    });
});

describe('clockOf', () => {
    it.each([
        [0, '06:00'],
        [1000, '07:00'],
        [6000, '12:00'],
        [12000, '18:00'],
        [13000, '19:00'],
        [18000, '00:00'],
        [23999, '05:59'],
        [500, '06:30'],
        [6250, '12:15'],
    ])('tick %i is %s', (time, label) => expect(clockOf(time).label).toBe(label));

    it('stays in the day for a time that is out of it', () => {
        expect(clockOf(24000).label).toBe('06:00');
        expect(clockOf(-1000).label).toBe('05:00');
    });
});

describe('weatherOf', () => {
    it('is the sun by day and the moon by night', () => {
        expect(weatherOf(world(0))).toBe('clear-day');
        expect(weatherOf(world(6000))).toBe('clear-day');
        expect(weatherOf(world(12999))).toBe('clear-day');
        expect(weatherOf(world(13000))).toBe('clear-night');
        expect(weatherOf(world(18000))).toBe('clear-night');
        expect(weatherOf(world(22999))).toBe('clear-night');
        expect(weatherOf(world(23000))).toBe('clear-day');
    });

    it('has rain in the sun and in the dark', () => {
        expect(weatherOf(world(6000, { raining: true }))).toBe('rain-day');
        expect(weatherOf(world(18000, { raining: true }))).toBe('rain-night');
    });

    it('is a storm at any hour, thunder wins over rain', () => {
        expect(weatherOf(world(6000, { raining: true, thundering: true }))).toBe('thunder');
        expect(weatherOf(world(18000, { thundering: true }))).toBe('thunder');
    });

    it('knows when it is day', () => {
        expect(isDaytime(0)).toBe(true);
        expect(isDaytime(13000)).toBe(false);
        expect(isDaytime(23000)).toBe(true);
    });
});

describe('moving the clock on', () => {
    it('starts at normal speed and moves 20 ticks a second', () => {
        const sample = nextSample(null, { ...world(1000), day: 1 }, 10_000);
        expect(sample.rate).toBe(TICKS_PER_MS);
        expect(projectTime(sample, 10_000)).toBe(1000);
        expect(projectTime(sample, 11_000)).toBe(1020);
        expect(projectTime(sample, 15_000)).toBe(1100);
    });

    it('measures the speed from two answers, never faster than the game can go', () => {
        const first = nextSample(null, world(1000), 0);
        // 100 ticks in 5 seconds is the normal speed.
        expect(nextSample(first, world(1100), 5000).rate).toBeCloseTo(0.02);
        // A server that fell behind: 60 ticks in 5 seconds.
        expect(nextSample(first, world(1060), 5000).rate).toBeCloseTo(0.012);
        // 101 in 5 seconds is the jitter of the request, not a faster game.
        expect(nextSample(first, world(1101), 5000).rate).toBe(TICKS_PER_MS);
    });

    it('stands still in a world where the daylight cycle is off', () => {
        const first = nextSample(null, world(6000), 0);
        const second = nextSample(first, world(6000), 5000);
        expect(second.rate).toBe(0);
        expect(projectTime(second, 9000)).toBe(6000);
    });

    it('keeps the speed through a jump of the time, going forward or back', () => {
        const first = nextSample(nextSample(null, world(1000), 0), world(1100), 5000);
        expect(nextSample(first, world(13000), 10_000).rate).toBeCloseTo(0.02);
        expect(nextSample(first, world(200), 10_000).rate).toBeCloseTo(0.02);
    });

    it('measures across midnight, the day after the last tick', () => {
        const first = nextSample(null, { time: 23950, day: 3, raining: false, thundering: false }, 0);
        const second = nextSample(first, { time: 50, day: 4, raining: false, thundering: false }, 5000);
        expect(second.rate).toBeCloseTo(0.02);
    });

    it('ignores an answer that comes too soon after the last to say anything', () => {
        const first = nextSample(nextSample(null, world(1000), 0), world(1060), 5000);
        const soon = nextSample(first, world(1062), 5500);
        expect(soon.rate).toBe(first.rate);
    });

    it('goes on to the next day, and waits for an answer after a while', () => {
        const sample = nextSample(null, { time: 23990, day: 5, raining: false, thundering: false }, 0);
        // The time goes past the end of the day, the clock shows it from the start of the next.
        expect(projectTime(sample, 1000)).toBe(24010);
        expect(clockOf(projectTime(sample, 1000)).label).toBe('06:00');
        expect(projectDay(sample, 100)).toBe(5);
        expect(projectDay(sample, 1000)).toBe(6);
        // Nobody answered for a long time: the clock holds instead of running on for ever.
        expect(projectTime(sample, 10 * 60_000)).toBe(projectTime(sample, MAX_COAST_MS));
    });

    it('never goes backwards when the clock of the browser does', () => {
        const sample = nextSample(null, world(1000), 10_000);
        expect(projectTime(sample, 5_000)).toBe(1000);
    });
});
