/**
 * The time of day and the weather of the world, from the "world" entry of the "performance" message of the Stratosphere
 * helper (protocol 8):
 *   {"event":"performance", ..., "world":{"time":13000,"day":12,"raining":true,"thundering":false}}
 * time is in ticks since sunrise, 24000 make a day. The panel asks every few seconds, in between the clock is moved on by the
 * panel itself at the speed the game was seen to run at.
 */
export interface WorldNow {
    // Ticks into the day: 0 is sunrise (6:00), 6000 noon, 12000 sunset (18:00), 18000 midnight.
    time: number;
    // The first day is 1.
    day: number;
    raining: boolean;
    thundering: boolean;
}

export type Weather = 'clear-day' | 'clear-night' | 'rain-day' | 'rain-night' | 'thunder';

export const DAY_TICKS = 24000;
/** A game runs at 20 ticks per second. */
export const TICKS_PER_MS = 0.02;

/** From 19:00 until 5:00 it is night, which is when the game spawns monsters in the open. */
const NIGHT_START = 13000;
const NIGHT_END = 23000;

/** The world of a message, null when anything in it is not what the helper sends. */
export const parseWorld = (value: unknown): WorldNow | null => {
    if (!value || typeof value !== 'object') return null;
    const { time, day, raining, thundering } = value as Record<string, unknown>;
    if (typeof time !== 'number' || !Number.isInteger(time) || time < 0 || time >= DAY_TICKS) return null;
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 1e9) return null;
    if (typeof raining !== 'boolean' || typeof thundering !== 'boolean') return null;

    return { time, day, raining: raining || thundering, thundering };
};

export const isDaytime = (time: number): boolean => time < NIGHT_START || time >= NIGHT_END;

/** Which of the five pictures goes with the weather and the time. A storm is a storm by day and by night. */
export const weatherOf = (world: Pick<WorldNow, 'time' | 'raining' | 'thundering'>): Weather => {
    if (world.thundering) return 'thunder';
    const day = isDaytime(world.time);
    if (world.raining) return day ? 'rain-day' : 'rain-night';

    return day ? 'clear-day' : 'clear-night';
};

export const WEATHER_LABELS: Record<Weather, string> = {
    'clear-day': 'Clear',
    'clear-night': 'Clear night',
    'rain-day': 'Raining',
    'rain-night': 'Raining at night',
    thunder: 'Thunderstorm',
};

/** The clock of the game: tick 0 is 6:00, 1000 ticks are an hour. */
export const clockOf = (time: number): { hours: number; minutes: number; label: string } => {
    const safe = ((Math.floor(time) % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
    const hours = (Math.floor(safe / 1000) + 6) % 24;
    const minutes = Math.floor(((safe % 1000) * 60) / 1000);

    return { hours, minutes, label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
};

// ---- moving the clock on between two answers --------------------------------------------------------------------------

export interface ClockSample {
    world: WorldNow;
    // When the answer came, in milliseconds.
    at: number;
    // Ticks per millisecond the game was seen to run at, 0.02 is the normal speed and 0 is a world whose time stands still.
    rate: number;
}

// Another answer this soon after the last tells little about the speed, the time between them is too short to measure.
const MIN_WINDOW_MS = 2000;
// How long the clock is moved on without a new answer, then it waits for one.
export const MAX_COAST_MS = 20000;

const absolute = (world: WorldNow) => (world.day - 1) * DAY_TICKS + world.time;

/**
 * The sample for a new answer. The speed is worked out from how far the time came since the last one, kept between 0 (the
 * daylight cycle is off) and the normal speed. A jump (/time set, sleeping through the night) says nothing about the speed
 * and keeps the one before.
 */
export const nextSample = (previous: ClockSample | null, world: WorldNow, at: number): ClockSample => {
    const normal = previous?.rate ?? TICKS_PER_MS;
    if (!previous || at - previous.at < MIN_WINDOW_MS) return { world, at, rate: normal };

    const observed = (absolute(world) - absolute(previous.world)) / (at - previous.at);
    // Much faster than a game can run, or backwards: the time was changed.
    if (observed < 0 || observed > TICKS_PER_MS * 1.5) return { world, at, rate: normal };

    return { world, at, rate: Math.min(observed, TICKS_PER_MS) };
};

/** The time of the world now, moved on from the last answer. */
export const projectTime = (sample: ClockSample, now: number): number => {
    const elapsed = Math.min(Math.max(now - sample.at, 0), MAX_COAST_MS);

    return Math.floor(sample.world.time + sample.rate * elapsed);
};

/** The day now, the clock passing midnight (the end of the day, 6:00) starts the next one. */
export const projectDay = (sample: ClockSample, now: number): number => {
    const elapsed = Math.min(Math.max(now - sample.at, 0), MAX_COAST_MS);

    return sample.world.day + Math.floor((sample.world.time + sample.rate * elapsed) / DAY_TICKS);
};
