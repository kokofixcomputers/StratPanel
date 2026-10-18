/**
 * The light and the dark theme. The choice is "system" (follow the device), "light" or "dark", kept in the browser. The theme is a class
 * on <html> ("dark"): the colours are CSS variables (assets/css/theme.css) that the class changes, so most of the panel needs nothing
 * more. The page sets the class before it is drawn (views/templates/wrapper.blade.php has the same few lines) so there is no flash of
 * the wrong theme.
 */
import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'stratosphere:theme';
export const THEME_EVENT = 'stratosphere:themechange';

// The colour of the browser's own bar, from theme-color in the head.
const BAR: Record<Theme, string> = { light: '#ffffff', dark: '#141a23' };

const isChoice = (value: unknown): value is ThemeChoice => value === 'system' || value === 'light' || value === 'dark';

/** What the person chose, "system" when they never did (or the browser does not keep it). */
export const readChoice = (): ThemeChoice => {
    try {
        const value = window.localStorage.getItem(THEME_KEY);

        return isChoice(value) ? value : 'system';
    } catch (e) {
        return 'system';
    }
};

const prefersDark = (): boolean => {
    try {
        return !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
        return false;
    }
};

/** The theme that is shown for a choice. */
export const themeFor = (choice: ThemeChoice): Theme =>
    choice === 'system' ? (prefersDark() ? 'dark' : 'light') : choice;

/** Puts the theme on the page: the class on <html>, and the colour of the bar of the browser. */
export const applyTheme = (theme: Theme): void => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;

    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute('content', BAR[theme]);
};

/** The theme the page is showing now. */
export const currentTheme = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** Remembers a choice and shows it. */
export const setThemeChoice = (choice: ThemeChoice): void => {
    try {
        if (choice === 'system') window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, choice);
    } catch (e) {
        // The theme still changes for this page, it is only not remembered.
    }

    applyTheme(themeFor(choice));
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }));
};

/** Shows the saved choice, and follows the device when it is "system" (night falls, the person switches their phone). */
export const startTheme = (): void => {
    applyTheme(themeFor(readChoice()));

    try {
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const follow = () => {
            if (readChoice() === 'system') {
                applyTheme(themeFor('system'));
                window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: 'system' }));
            }
        };
        if (query.addEventListener) query.addEventListener('change', follow);
        else query.addListener(follow);
    } catch (e) {
        // No media queries: the saved choice is all there is.
    }

    // Another tab of the panel changed it.
    window.addEventListener('storage', (event) => {
        if (event.key === THEME_KEY || event.key === null) {
            applyTheme(themeFor(readChoice()));
            window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: readChoice() }));
        }
    });
};

/** The choice and the theme that is shown, and a way to change the choice. Re-renders when either changes, in any part of the panel. */
export const useTheme = (): { choice: ThemeChoice; theme: Theme; setChoice: (choice: ThemeChoice) => void } => {
    const [choice, setChoice] = useState<ThemeChoice>(readChoice);
    const [theme, setTheme] = useState<Theme>(currentTheme);

    useEffect(() => {
        const update = () => {
            setChoice(readChoice());
            setTheme(currentTheme());
        };
        window.addEventListener(THEME_EVENT, update);
        update();

        return () => window.removeEventListener(THEME_EVENT, update);
    }, []);

    return { choice, theme, setChoice: setThemeChoice };
};
