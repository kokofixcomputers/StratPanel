import { formatSize, originalPath, timeLeft } from '@/lib/trash';

describe('lib/trash', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const at = (ms: number) => new Date(now.getTime() + ms);
    const HOUR = 3600 * 1000;

    it('says how long is left', () => {
        expect(timeLeft(at(10 * 60 * 1000), now)).toBe('expires within the hour');
        expect(timeLeft(at(-HOUR), now)).toBe('expires within the hour');
        expect(timeLeft(at(HOUR + 1000), now)).toBe('1 hour left');
        expect(timeLeft(at(5 * HOUR + 1000), now)).toBe('5 hours left');
        expect(timeLeft(at(30 * 24 * HOUR), now)).toBe('30 days left');
        expect(timeLeft(at(25 * HOUR), now)).toBe('1 day left');
    });

    it('formats sizes', () => {
        expect(formatSize(null)).toBe('');
        expect(formatSize(0)).toBe('0 B');
        expect(formatSize(1023)).toBe('1023 B');
        expect(formatSize(1536)).toBe('1.5 KB');
        expect(formatSize(20 * 1024 * 1024)).toBe('20 MB');
        expect(formatSize(5 * 1024 ** 4)).toBe('5 TB');
    });

    it('shows where something was', () => {
        expect(originalPath('/', 'a.txt')).toBe('/a.txt');
        expect(originalPath('/world/', 'level.dat')).toBe('/world/level.dat');
        expect(originalPath('/world', 'level.dat')).toBe('/world/level.dat');
        expect(originalPath(null, 'Nightly')).toBe('Nightly');
    });
});
