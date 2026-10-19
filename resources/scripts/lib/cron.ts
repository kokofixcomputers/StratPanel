/**
 * Reads the five fields of a schedule (minute, hour, day of month, month, day of week) the way the panel runs them, and says in words
 * when that is: "Runs every 5 minutes", "Runs at 04:00 on Monday". Also gives the next times it would run, in the clock of the
 * panel. Only plain cron is understood (numbers, lists, ranges, steps, month and day names); anything else is left unexplained.
 */

export interface CronFields {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
}

type Token =
    | { type: 'any' }
    | { type: 'value'; value: number }
    | { type: 'range'; from: number; to: number; step: number }
    | { type: 'step'; from: number; step: number };

interface Parsed {
    tokens: Token[];
    values: Set<number>;
    // "*", or "*/n" that covers the whole span.
    every: number | null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type CronResult =
    | { state: 'ok'; text: string; fields: Resolved }
    | { state: 'invalid'; error: string }
    // Valid for the server maybe, but not something this reads (L, W, #, ?).
    | { state: 'unknown' };

interface Resolved {
    minute: Parsed;
    hour: Parsed;
    dayOfMonth: Parsed;
    month: Parsed;
    dayOfWeek: Parsed;
}

class Unreadable extends Error {}
class Invalid extends Error {}

const parseNumber = (text: string, names: string[] | null, offset: number): number => {
    if (/^\d+$/.test(text)) return parseInt(text, 10);
    if (names) {
        const at = names.indexOf(text.toUpperCase());
        if (at >= 0) return at + offset;
    }
    if (/[LW#?]/i.test(text)) throw new Unreadable();
    throw new Invalid(`"${text}" is not a number.`);
};

const parseField = (
    raw: string,
    label: string,
    min: number,
    max: number,
    names: string[] | null,
    offset: number,
    sevenIsSunday = false
): Parsed => {
    const text = raw.trim();
    if (text === '') throw new Invalid(`${label} is empty.`);
    const top = sevenIsSunday ? 7 : max;
    const tokens: Token[] = [];
    const values = new Set<number>();
    const add = (n: number) => values.add(sevenIsSunday && n === 7 ? 0 : n);
    const check = (n: number) => {
        if (n < min || n > top)
            throw new Invalid(
                `${label} must be between ${min} and ${max}${sevenIsSunday ? ' (0 or 7 is Sunday)' : ''}.`
            );

        return n;
    };
    const stepOf = (s: string) => {
        if (!/^\d+$/.test(s) || parseInt(s, 10) < 1)
            throw new Invalid(`The step after / in ${label.toLowerCase()} must be a number from 1.`);

        return parseInt(s, 10);
    };

    for (const part of text.split(',')) {
        if (part === '') throw new Invalid(`${label} has an empty entry between commas.`);
        const [range, step, extra] = part.split('/');
        if (extra !== undefined) throw new Invalid(`${label} has more than one / in "${part}".`);
        const size = step === undefined ? 1 : stepOf(step);
        if (range === '*') {
            tokens.push(step === undefined ? { type: 'any' } : { type: 'step', from: min, step: size });
            for (let n = min; n <= max; n += size) add(n);
        } else if (range.includes('-')) {
            const [a, b, more] = range.split('-');
            if (more !== undefined || a === '' || b === undefined || b === '')
                throw new Invalid(`"${range}" is not a range in ${label.toLowerCase()}.`);
            const from = check(parseNumber(a, names, offset));
            const to = check(parseNumber(b, names, offset));
            if (from > to) throw new Invalid(`The range ${range} in ${label.toLowerCase()} goes backwards.`);
            tokens.push({ type: 'range', from, to, step: size });
            for (let n = from; n <= to; n += size) add(n);
        } else {
            const from = check(parseNumber(range, names, offset));
            if (step === undefined) {
                tokens.push({ type: 'value', value: from });
                add(from);
            } else {
                tokens.push({ type: 'step', from, step: size });
                for (let n = from; n <= max; n += size) add(n);
            }
        }
    }
    const every =
        tokens.length === 1
            ? tokens[0].type === 'any'
                ? 1
                : tokens[0].type === 'step' && tokens[0].from === min
                ? tokens[0].step
                : null
            : null;

    return { tokens, values, every };
};

const list = (items: string[]): string =>
    items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const ordinal = (n: number): string => {
    const tail = n % 100;
    if (tail >= 11 && tail <= 13) return `${n}th`;

    return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (h: number, m: number) =>
    h === 0 && m === 0 ? 'midnight' : h === 12 && m === 0 ? 'noon' : `${pad(h)}:${pad(m)}`;

/** The values a field names as a sorted array. */
const sorted = (p: Parsed) => Array.from(p.values).sort((a, b) => a - b);

const isConsecutive = (v: number[]) => v.length > 2 && v.every((n, i) => i === 0 || n === v[i - 1] + 1);

const minutePart = (minute: Parsed): { text: string; recurring: boolean } | null => {
    // Returns null when the minute is a single value and the hour decides ("at 04:30").
    if (minute.every === 1) return { text: 'every minute', recurring: true };
    if (minute.every) return { text: `every ${minute.every} minutes`, recurring: true };
    const m = sorted(minute);
    if (m.length === 1) return null;
    if (isConsecutive(m)) return { text: `every minute from minute ${m[0]} to ${m[m.length - 1]}`, recurring: true };

    return { text: `at minutes ${list(m.map(String))}`, recurring: true };
};

const describeTime = (minute: Parsed, hour: Parsed): { text: string; recurring: boolean } => {
    const first = minutePart(minute);
    const m = sorted(minute);
    const h = sorted(hour);

    if (hour.every === 1) {
        if (first)
            return {
                text: minute.every ? first.text : `${first.text}, every hour`,
                recurring: true,
            };

        return { text: m[0] === 0 ? 'every hour, on the hour' : `every hour, at minute ${m[0]}`, recurring: true };
    }
    if (hour.every) {
        const gap = `every ${hour.every} hours`;
        if (first) return { text: `${first.text}, ${gap}`, recurring: true };

        return { text: m[0] === 0 ? `${gap}, on the hour` : `${gap}, at minute ${m[0]}`, recurring: true };
    }

    // A single minute at certain hours: the clock times.
    if (!first) {
        if (isConsecutive(h) && h.length > 3)
            return {
                text: `every hour from ${pad(h[0])}:${pad(m[0])} to ${pad(h[h.length - 1])}:${pad(m[0])}`,
                recurring: true,
            };

        return { text: `at ${list(h.map((x) => clock(x, m[0])))}`, recurring: false };
    }
    // Many minutes within some hours.
    const window = isConsecutive(h)
        ? `from ${pad(h[0])}:00 to ${pad(h[h.length - 1])}:59`
        : `during the hours ${list(h.map((x) => pad(x)))}`;

    return { text: `${first.text}, ${window}`, recurring: true };
};

const describeDays = (dom: Parsed, month: Parsed, dow: Parsed): string | null => {
    const parts: string[] = [];
    const domAny = dom.every === 1;
    const dowAny = dow.every === 1;

    const dayOfMonth = () => {
        if (dom.every) return `every ${dom.every} days of the month`;
        const d = sorted(dom);
        return d.length === 1 ? `day ${d[0]} of the month` : `the ${list(d.map(ordinal))} of the month`;
    };
    const dayOfWeek = () => {
        if (dow.every) return `every ${dow.every} days of the week`;
        const d = sorted(dow);
        const key = d.join(',');
        if (key === '1,2,3,4,5') return 'weekdays';
        if (key === '0,6') return 'weekends';
        if (d.length === 7) return 'every day';
        if (isConsecutive(d)) return `${DAY_NAMES[d[0]]} through ${DAY_NAMES[d[d.length - 1]]}`;

        return list(d.map((x) => DAY_NAMES[x]));
    };

    if (!domAny && !dowAny) parts.push(`on ${dayOfMonth()} or on ${dayOfWeek()}`);
    else if (!domAny) parts.push(`on ${dayOfMonth()}`);
    else if (!dowAny) parts.push(`on ${dayOfWeek()}`);

    if (month.every !== 1) {
        if (month.every) parts.push(`every ${month.every} months`);
        else {
            const m = sorted(month);
            parts.push(
                `in ${
                    isConsecutive(m)
                        ? `${MONTH_NAMES[m[0] - 1]} through ${MONTH_NAMES[m[m.length - 1] - 1]}`
                        : list(m.map((x) => MONTH_NAMES[x - 1]))
                }`
            );
        }
    }

    return parts.length ? parts.join(' ') : null;
};

/** What the five fields mean, in a sentence, or why they are not a schedule. */
export const describeCron = (cron: CronFields): CronResult => {
    try {
        const fields: Resolved = {
            minute: parseField(cron.minute, 'Minute', 0, 59, null, 0),
            hour: parseField(cron.hour, 'Hour', 0, 23, null, 0),
            dayOfMonth: parseField(cron.dayOfMonth, 'Day of month', 1, 31, null, 0),
            month: parseField(cron.month, 'Month', 1, 12, MONTHS, 1),
            dayOfWeek: parseField(cron.dayOfWeek, 'Day of week', 0, 6, DAYS, 0, true),
        };

        const time = describeTime(fields.minute, fields.hour);
        const days = describeDays(fields.dayOfMonth, fields.month, fields.dayOfWeek);
        // "every 5 minutes" stands alone, "at 04:00" needs to say which days.
        const text = days ? `${time.text} ${days}` : time.recurring ? time.text : `${time.text} every day`;

        return { state: 'ok', text: `Runs ${text}.`.replace('every day on', 'on'), fields };
    } catch (e) {
        if (e instanceof Invalid) return { state: 'invalid', error: e.message };
        if (e instanceof Unreadable) return { state: 'unknown' };
        throw e;
    }
};

export interface WallClock {
    year: number;
    month: number; // 1-12
    day: number;
    hour: number;
    minute: number;
}

/** The clock of a time zone right now (or at the given time), as a wall clock. */
export const wallClock = (zone: string, at: Date = new Date()): WallClock => {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
        }).formatToParts(at);
    } catch (e) {
        return wallClock('UTC', at);
    }
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
};

const dayMatches = (f: Resolved, year: number, month: number, day: number): boolean => {
    if (!f.month.values.has(month)) return false;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const domAny = f.dayOfMonth.every === 1;
    const dowAny = f.dayOfWeek.every === 1;
    const byDate = f.dayOfMonth.values.has(day);
    const byWeekday = f.dayOfWeek.values.has(weekday);

    // Like cron: when both are narrowed, either one is enough.
    if (!domAny && !dowAny) return byDate || byWeekday;
    if (!domAny) return byDate;
    if (!dowAny) return byWeekday;

    return true;
};

/** The next times the fields run after a moment, as wall clocks (the clock of whoever runs the schedule). */
export const nextRuns = (fields: Resolved, from: WallClock, count = 3): WallClock[] => {
    const runs: WallClock[] = [];
    const hours = sorted(fields.hour);
    const minutes = sorted(fields.minute);
    const day = new Date(Date.UTC(from.year, from.month - 1, from.day));

    // A leap day or a rare date can be years away: look five years ahead at most.
    for (let i = 0; i < 366 * 5 && runs.length < count; i++, day.setUTCDate(day.getUTCDate() + 1)) {
        const y = day.getUTCFullYear();
        const mo = day.getUTCMonth() + 1;
        const d = day.getUTCDate();
        if (!dayMatches(fields, y, mo, d)) continue;
        for (const h of hours) {
            for (const m of minutes) {
                const today = i === 0;
                if (today && (h < from.hour || (h === from.hour && m <= from.minute))) continue;
                if (runs.length < count) runs.push({ year: y, month: mo, day: d, hour: h, minute: m });
            }
        }
    }

    return runs;
};

export const formatWallClock = (w: WallClock): string => {
    const weekday = DAY_NAMES[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()].slice(0, 3);

    return `${weekday}, ${MONTH_NAMES[w.month - 1].slice(0, 3)} ${w.day} at ${pad(w.hour)}:${pad(w.minute)}`;
};

export type { Resolved as ResolvedCron };

/** Ready-made schedules, for a click. */
export const CRON_PRESETS: { label: string; cron: CronFields }[] = [
    { label: 'Every 5 minutes', cron: { minute: '*/5', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
    { label: 'Every 30 minutes', cron: { minute: '*/30', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
    { label: 'Every hour', cron: { minute: '0', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
    { label: 'Every 6 hours', cron: { minute: '0', hour: '*/6', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
    { label: 'Every day at 04:00', cron: { minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*' } },
    { label: 'Every Monday', cron: { minute: '0', hour: '0', dayOfMonth: '*', month: '*', dayOfWeek: '1' } },
    { label: 'First of the month', cron: { minute: '0', hour: '0', dayOfMonth: '1', month: '*', dayOfWeek: '*' } },
];
