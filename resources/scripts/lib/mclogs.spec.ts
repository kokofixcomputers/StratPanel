import { trimLog, uploadLog } from './mclogs';

describe('mclo.gs upload', () => {
    afterEach(() => {
        delete (global as any).fetch;
    });

    it('keeps the end of a log that is too large', () => {
        const big = 'a'.repeat(10 * 1024 * 1024) + 'END';
        const trimmed = trimLog(big);
        expect(trimmed.length).toBeLessThan(big.length);
        expect(trimmed.endsWith('END')).toBe(true);
        expect(trimLog('short')).toBe('short');
    });

    it('posts the content form encoded and returns the link', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                id: 'abc',
                url: 'https://mclo.gs/abc',
                raw: 'https://api.mclo.gs/1/raw/abc',
            }),
        });
        (global as any).fetch = fetchMock;

        await expect(uploadLog('hello')).resolves.toEqual({
            id: 'abc',
            url: 'https://mclo.gs/abc',
            raw: 'https://api.mclo.gs/1/raw/abc',
        });
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.mclo.gs/1/log');
        expect(String(fetchMock.mock.calls[0][1].body)).toBe('content=hello');
    });

    it('surfaces the error message of the API', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: false, error: 'Content is empty.' }),
        });

        await expect(uploadLog('')).rejects.toThrow('Content is empty.');
    });
});
