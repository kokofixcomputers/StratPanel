import { classify, colorize, nextChunk, stripAnsi } from './consoleChunks';

describe('console chunks', () => {
    it('detects warnings and errors', () => {
        expect(classify('[19:36:38] [main/WARN]: Warnings were found!').level).toBe('warn');
        expect(classify('[19:36:38 WARN]: Something happened').level).toBe('warn');
        expect(classify('[19:36:38] [Server thread/ERROR]: Oh no').level).toBe('error');
        expect(classify('[19:36:38] [Server thread/INFO]: Done (3.4s)!').level).toBeNull();
        expect(classify('WARNING: A terminally deprecated method').java).toBe(true);
    });

    it('does not treat a warning word in the message as a warning', () => {
        expect(classify('[19:36:38] [main/INFO]: player WARN said hi').level).toBeNull();
    });

    it('groups continuation lines with their warning', () => {
        let state = null as ReturnType<typeof nextChunk>['state'];
        const lines = [
            '[19:36:38] [main/WARN]: Warnings were found!',
            " - Mod 'Forge Config API Port' recommends any version of modmenu, which is missing!",
            '\t - You should install any version of modmenu for the optimal experience.',
            '[19:36:39] [main/INFO]: next',
        ];
        const results = lines.map((line) => {
            const result = nextChunk(state, line);
            state = result.state;

            return result;
        });

        expect(results.map((r) => [r.start, r.belongs])).toEqual([
            [true, true],
            [false, true],
            [false, true],
            [false, false],
        ]);
    });

    it('merges consecutive java warnings into one chunk', () => {
        let state = null as ReturnType<typeof nextChunk>['state'];
        const starts = [
            'WARNING: A terminally deprecated method in sun.misc.Unsafe has been called',
            'WARNING: sun.misc.Unsafe::objectFieldOffset has been called by org.joml.MemUtil',
            'WARNING: Please consider reporting this to the maintainers',
        ].map((line) => {
            const result = nextChunk(state, line);
            state = result.state;

            return result.start;
        });

        expect(starts).toEqual([true, false, false]);
    });

    it('colours lines and keeps the colour after embedded resets', () => {
        expect(colorize('a', 'warn')).toBe('\u001b[33ma\u001b[0m');
        expect(colorize('a\u001b[0mb', 'warn')).toBe('\u001b[33ma\u001b[0m\u001b[33mb\u001b[0m');
        expect(stripAnsi('\u001b[33mhi\u001b[0m')).toBe('hi');
    });
});
