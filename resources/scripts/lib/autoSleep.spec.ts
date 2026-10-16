import { minutesLabel, minutesUntilSleep } from '@/lib/autoSleep';

describe('minutesLabel', () => {
    it.each([
        [1, '1 minute'],
        [5, '5 minutes'],
        [30, '30 minutes'],
        [60, '1 hour'],
        [120, '2 hours'],
        [240, '4 hours'],
        [90, '1 h 30 min'],
    ])('%i is %s', (minutes, label) => expect(minutesLabel(minutes)).toBe(label));
});

describe('minutesUntilSleep', () => {
    const now = new Date('2026-10-16T12:00:00Z').getTime();

    it('counts the minutes that are left, rounded up', () => {
        expect(minutesUntilSleep(new Date(now - 5 * 60000), 15, now)).toBe(10);
        expect(minutesUntilSleep(new Date(now - 5 * 60000 - 1000), 15, now)).toBe(10);
        expect(minutesUntilSleep(new Date(now - 14 * 60000 - 30000), 15, now)).toBe(1);
    });

    it('is 0 when it is due or late, never below', () => {
        expect(minutesUntilSleep(new Date(now - 15 * 60000), 15, now)).toBe(0);
        expect(minutesUntilSleep(new Date(now - 60 * 60000), 15, now)).toBe(0);
    });

    it('is null when nobody is counting', () => {
        expect(minutesUntilSleep(null, 15, now)).toBeNull();
    });
});
