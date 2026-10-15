import { agoLabel, exactBytes, exactNumber, indexAt } from '@/lib/statFormat';

describe('exactBytes', () => {
    it('writes every digit', () => {
        expect(exactBytes(6442450944)).toBe('6,442,450,944 bytes');
        expect(exactBytes(1)).toBe('1 byte');
        expect(exactBytes(0)).toBe('0 bytes');
        expect(exactBytes(1023.6)).toBe('1,024 bytes');
    });
});

describe('exactNumber', () => {
    it('keeps the digits asked for', () => {
        expect(exactNumber(12.3, 2)).toBe('12.30');
        expect(exactNumber(1234.5678, 2)).toBe('1,234.57');
        expect(exactNumber(0, 1)).toBe('0.0');
    });
});

describe('agoLabel', () => {
    it('counts back from the newest point', () => {
        expect(agoLabel(29, 30, 1)).toBe('now');
        expect(agoLabel(24, 30, 1)).toBe('5 s ago');
        expect(agoLabel(0, 30, 5)).toBe('2 min ago');
        expect(agoLabel(25, 30, 5)).toBe('20 s ago');
    });
});

describe('indexAt', () => {
    it('maps the pointer to the nearest point and stays inside the list', () => {
        expect(indexAt(0, 100, 30)).toBe(0);
        expect(indexAt(100, 100, 30)).toBe(29);
        expect(indexAt(50, 100, 3)).toBe(1);
        expect(indexAt(-20, 100, 30)).toBe(0);
        expect(indexAt(500, 100, 30)).toBe(29);
        expect(indexAt(10, 0, 30)).toBe(0);
        expect(indexAt(10, 100, 1)).toBe(0);
    });
});
