import { consoleTheme, darkConsole, DEFAULT_CONSOLE, lightConsole } from '@/lib/consoleTheme';

describe('consoleTheme', () => {
    it('follows the theme, or is always dark', () => {
        expect(consoleTheme('light', { ...DEFAULT_CONSOLE, brightness: 100 })).toEqual(lightConsole);
        expect(consoleTheme('light', { ...DEFAULT_CONSOLE, style: 'dark', brightness: 100 })).toEqual(darkConsole);
    });

    it('dims the text toward the background and leaves the background alone', () => {
        const dim = consoleTheme('dark', { ...DEFAULT_CONSOLE, brightness: 60 });
        expect(dim.background).toBe(darkConsole.background);
        expect(dim.foreground).not.toBe(darkConsole.foreground);
        expect(parseInt(dim.foreground.slice(1, 3), 16)).toBeLessThan(parseInt(darkConsole.foreground.slice(1, 3), 16));
    });
});
