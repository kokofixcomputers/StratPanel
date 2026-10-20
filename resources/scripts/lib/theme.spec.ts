/**
 * @jest-environment jsdom
 */
import { applyTheme, currentTheme, readChoice, setThemeChoice, themeFor, THEME_EVENT, THEME_KEY } from '@/lib/theme';

const media = (dark: boolean) => {
    (window as any).matchMedia = (query: string) => ({
        matches: dark && query.includes('dark'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    });
};

describe('lib/theme', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.className = '';
        document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
        media(false);
    });

    it('is "system" until somebody chooses', () => {
        expect(readChoice()).toBe('system');
        window.localStorage.setItem(THEME_KEY, 'dark');
        expect(readChoice()).toBe('dark');
        window.localStorage.setItem(THEME_KEY, 'purple');
        expect(readChoice()).toBe('system');
    });

    it('shows what the device prefers for "system" and what was chosen otherwise', () => {
        media(true);
        expect(themeFor('system')).toBe('dark');
        expect(themeFor('light')).toBe('light');
        media(false);
        expect(themeFor('system')).toBe('light');
        expect(themeFor('dark')).toBe('dark');
    });

    it('puts the theme on the page and on the bar of the browser', () => {
        applyTheme('dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#141a23');
        expect(currentTheme()).toBe('dark');

        applyTheme('light');
        expect(document.documentElement).not.toHaveClass('dark');
        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#ffffff');
        expect(currentTheme()).toBe('light');
    });

    it('keeps a choice, shows it and tells the rest of the page', () => {
        const seen: string[] = [];
        window.addEventListener(THEME_EVENT, ((e: CustomEvent) => seen.push(e.detail)) as unknown as EventListener);

        setThemeChoice('dark');
        expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
        expect(currentTheme()).toBe('dark');

        setThemeChoice('system');
        // "system" is kept as well, otherwise it would turn into the mode the admin set as the default.
        expect(window.localStorage.getItem(THEME_KEY)).toBe('system');
        expect(currentTheme()).toBe('light');
        expect(seen).toEqual(['dark', 'system']);
    });

    it('still changes the page when the browser does not keep anything', () => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
            throw new Error('blocked');
        };
        try {
            expect(() => setThemeChoice('dark')).not.toThrow();
            expect(currentTheme()).toBe('dark');
        } finally {
            Storage.prototype.setItem = original;
        }
    });
});
