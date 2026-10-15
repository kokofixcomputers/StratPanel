import { minecraftDate, setWhitelisted, UUID_PATTERN } from './playerFiles';
import saveFileContents from '@/api/server/files/saveFileContents';
import { readJsonList } from '@/lib/minecraft';

jest.mock('@/api/server/files/saveFileContents', () => jest.fn(() => Promise.resolve()));
jest.mock('@/lib/minecraft', () => ({ readJsonList: jest.fn() }));

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

describe('setWhitelisted', () => {
    const saved = () => JSON.parse((saveFileContents as jest.Mock).mock.calls.pop()[2]);

    beforeEach(() => (saveFileContents as jest.Mock).mockClear());

    it('adds a player to whitelist.json, once', async () => {
        (readJsonList as jest.Mock).mockResolvedValue([{ uuid: 'b', name: 'Alex' }]);
        await setWhitelisted('server', { uuid: 'a', name: 'Steve' }, true);

        expect(saved()).toEqual([
            { uuid: 'b', name: 'Alex' },
            { uuid: 'a', name: 'Steve' },
        ]);

        (readJsonList as jest.Mock).mockResolvedValue([{ uuid: 'a', name: 'steve' }]);
        await setWhitelisted('server', { uuid: 'a', name: 'Steve' }, true);

        expect(saved()).toEqual([{ uuid: 'a', name: 'Steve' }]);
    });

    it('removes a player whatever the case of the name', async () => {
        (readJsonList as jest.Mock).mockResolvedValue([
            { uuid: 'a', name: 'Steve' },
            { uuid: 'b', name: 'Alex' },
        ]);
        await setWhitelisted('server', { uuid: 'a', name: 'STEVE' }, false);

        expect(saved()).toEqual([{ uuid: 'b', name: 'Alex' }]);
    });
});
