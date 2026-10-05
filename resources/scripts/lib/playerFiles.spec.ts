import { minecraftDate, UUID_PATTERN } from './playerFiles';

describe('player json files', () => {
    it('formats dates the way Minecraft does', () => {
        expect(minecraftDate(new Date(Date.UTC(2026, 9, 5, 7, 5, 9)))).toBe('2026-10-05 07:05:09 +0000');
    });

    it('recognises uuids with and without dashes', () => {
        expect(UUID_PATTERN.test('13bc7d5e-f906-41ff-a949-6c1eb677fe03')).toBe(true);
        expect(UUID_PATTERN.test('13bc7d5ef90641ffa9496c1eb677fe03')).toBe(true);
        expect(UUID_PATTERN.test('Steve')).toBe(false);
    });
});
