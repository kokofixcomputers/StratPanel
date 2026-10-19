import { CronFields, CRON_PRESETS, describeCron, formatWallClock, nextRuns, wallClock } from '@/lib/cron';

const c = (minute: string, hour = '*', dayOfMonth = '*', month = '*', dayOfWeek = '*'): CronFields => ({
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
});
const say = (f: CronFields) => {
    const r = describeCron(f);

    return r.state === 'ok' ? r.text : r.state === 'invalid' ? `INVALID: ${r.error}` : 'UNKNOWN';
};

describe('describeCron', () => {
    it.each([
        [c('*'), 'Runs every minute.'],
        [c('*/5'), 'Runs every 5 minutes.'],
        [c('*/1'), 'Runs every minute.'],
        [c('0'), 'Runs every hour, on the hour.'],
        [c('30'), 'Runs every hour, at minute 30.'],
        [c('0,15,30,45'), 'Runs at minutes 0, 15, 30 and 45, every hour.'],
        [c('0', '*/6'), 'Runs every 6 hours, on the hour.'],
        [c('15', '*/2'), 'Runs every 2 hours, at minute 15.'],
        [c('0', '4'), 'Runs at 04:00 every day.'],
        [c('0', '0'), 'Runs at midnight every day.'],
        [c('0', '12'), 'Runs at noon every day.'],
        [c('30', '8,12,18'), 'Runs at 08:30, 12:30 and 18:30 every day.'],
        [c('0', '8-12'), 'Runs every hour from 08:00 to 12:00.'],
        [c('*/10', '8-12'), 'Runs every 10 minutes, from 08:00 to 12:59.'],
        [c('0', '0', '*', '*', 'MON'), 'Runs at midnight on Monday.'],
        [c('0', '4', '*', '*', '1-5'), 'Runs at 04:00 on weekdays.'],
        [c('0', '4', '*', '*', '0,6'), 'Runs at 04:00 on weekends.'],
        [c('0', '4', '*', '*', '7'), 'Runs at 04:00 on Sunday.'],
        [c('0', '4', '*', '*', 'MON,WED,FRI'), 'Runs at 04:00 on Monday, Wednesday and Friday.'],
        [c('0', '0', '1'), 'Runs at midnight on day 1 of the month.'],
        [c('0', '0', '1,15'), 'Runs at midnight on the 1st and 15th of the month.'],
        [c('0', '0', '*/2'), 'Runs at midnight on every 2 days of the month.'],
        [c('0', '0', '1', '6'), 'Runs at midnight on day 1 of the month in June.'],
        [c('0', '0', '*', 'JAN,JUL'), 'Runs at midnight in January and July.'],
        [c('*/5', '*', '*', '*', 'MON'), 'Runs every 5 minutes on Monday.'],
        [c('0', '0', '15', '*', 'MON'), 'Runs at midnight on day 15 of the month or on Monday.'],
    ])('says %j', (fields, text) => {
        expect(say(fields)).toBe(text);
    });

    it('says what is wrong', () => {
        expect(say(c('60'))).toBe('INVALID: Minute must be between 0 and 59.');
        expect(say(c('*', '24'))).toBe('INVALID: Hour must be between 0 and 23.');
        expect(say(c('*', '*', '0'))).toBe('INVALID: Day of month must be between 1 and 31.');
        expect(say(c('*', '*', '*', '13'))).toBe('INVALID: Month must be between 1 and 12.');
        expect(say(c('*', '*', '*', '*', '8'))).toBe(
            'INVALID: Day of week must be between 0 and 6 (0 or 7 is Sunday).'
        );
        expect(say(c('5-1'))).toContain('goes backwards');
        expect(say(c('*/0'))).toContain('step');
        expect(say(c('a'))).toContain('is not a number');
        expect(say(c(''))).toBe('INVALID: Minute is empty.');
        expect(say(c('1,,2'))).toContain('empty entry');
        expect(say(c('1/2/3'))).toContain('more than one /');
    });

    it('does not guess at what it cannot read', () => {
        expect(say(c('0', '0', 'L'))).toBe('UNKNOWN');
        expect(say(c('0', '0', '*', '*', '5#2'))).toBe('UNKNOWN');
    });

    it('describes every preset', () => {
        for (const p of CRON_PRESETS) expect(describeCron(p.cron).state).toBe('ok');
        expect(say(CRON_PRESETS[0].cron)).toBe('Runs every 5 minutes.');
    });
});

describe('nextRuns', () => {
    const at = { year: 2026, month: 10, day: 19, hour: 10, minute: 7 };
    const next = (f: CronFields, n = 3) => {
        const r = describeCron(f);
        if (r.state !== 'ok') throw new Error('not ok');

        return nextRuns(r.fields, at, n).map(formatWallClock);
    };

    it('lists the coming times', () => {
        expect(next(c('*/5'))).toEqual(['Mon, Oct 19 at 10:10', 'Mon, Oct 19 at 10:15', 'Mon, Oct 19 at 10:20']);
        expect(next(c('0', '4'))).toEqual(['Tue, Oct 20 at 04:00', 'Wed, Oct 21 at 04:00', 'Thu, Oct 22 at 04:00']);
        expect(next(c('30', '8,12'), 4)).toEqual([
            'Mon, Oct 19 at 12:30',
            'Tue, Oct 20 at 08:30',
            'Tue, Oct 20 at 12:30',
            'Wed, Oct 21 at 08:30',
        ]);
    });

    it('does not run again at the minute it is', () => {
        expect(next(c('7', '10'), 1)).toEqual(['Tue, Oct 20 at 10:07']);
    });

    it('follows the days of the week and of the month', () => {
        expect(next(c('0', '0', '*', '*', 'MON'), 2)).toEqual(['Mon, Oct 26 at 00:00', 'Mon, Nov 2 at 00:00']);
        expect(next(c('0', '0', '1'), 2)).toEqual(['Sun, Nov 1 at 00:00', 'Tue, Dec 1 at 00:00']);
        // Either the date or the weekday.
        expect(next(c('0', '0', '20', '*', 'FRI'), 3)).toEqual([
            'Tue, Oct 20 at 00:00',
            'Fri, Oct 23 at 00:00',
            'Fri, Oct 30 at 00:00',
        ]);
        expect(next(c('0', '0', '*', '2'), 1)).toEqual(['Mon, Feb 1 at 00:00']);
    });

    it('finds a leap day', () => {
        expect(next(c('0', '0', '29', '2'), 1)).toEqual(['Tue, Feb 29 at 00:00']);
    });

    it('gives nothing for a date that never comes', () => {
        const r = describeCron(c('0', '0', '31', '2'));
        if (r.state !== 'ok') throw new Error('not ok');
        expect(nextRuns(r.fields, at, 3)).toEqual([]);
    });
});

describe('wallClock', () => {
    it('reads the clock of a zone', () => {
        const t = new Date('2026-10-19T23:30:00Z');
        expect(wallClock('UTC', t)).toMatchObject({ day: 19, hour: 23, minute: 30 });
        expect(wallClock('Asia/Tokyo', t)).toMatchObject({ day: 20, hour: 8, minute: 30 });
        // A zone that does not exist falls back to UTC.
        expect(wallClock('Nowhere/Land', t)).toMatchObject({ hour: 23 });
    });
});
