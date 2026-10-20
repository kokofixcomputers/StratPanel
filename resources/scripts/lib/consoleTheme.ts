/**
 * The colours of the console (the terminal of the server page). They follow the light or dark theme, or the console is always dark, and the
 * text can be dimmed, both are set in the theme editor (lib/themeConfig.ts, "console").
 */
import { mix } from '@/lib/colorMath';

export type ConsoleStyle = 'match' | 'dark';

export interface ConsoleOptions {
    style: ConsoleStyle;
    // How bright the text is, in percent of the full colour. Below 100 every colour moves toward the background.
    brightness: number;
    fontSize: number;
}

export const DEFAULT_CONSOLE: ConsoleOptions = { style: 'match', brightness: 85, fontSize: 12 };

export const lightConsole = {
    background: '#ffffff',
    foreground: '#1f2937',
    cursor: 'transparent',
    black: '#1f2937',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#d97706',
    blue: '#1447e6',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#6b7280',
    brightBlack: '#9ca3af',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#111827',
    selection: 'rgba(20, 71, 230, 0.2)',
};

// The same colours for a dark surface (the background is the one of the cards): black text is light, the others are lighter so they can be
// read on it.
export const darkConsole = {
    background: '#141a23',
    foreground: '#e2e8f0',
    cursor: 'transparent',
    black: '#94a3b8',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#fbbf24',
    blue: '#7aa2ff',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#cbd5e1',
    brightBlack: '#64748b',
    brightRed: '#fca5a5',
    brightGreen: '#86efac',
    brightYellow: '#fcd34d',
    brightBlue: '#9db8ff',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
    selection: 'rgba(91, 134, 247, 0.35)',
};

const KEEP = new Set(['background', 'cursor', 'selection']);

/** The colours for a console: the theme it follows, with the text dimmed. */
export const consoleTheme = (mode: 'light' | 'dark', options: ConsoleOptions): Record<string, string> => {
    const base = options.style === 'dark' || mode === 'dark' ? darkConsole : lightConsole;
    const amount = Math.max(0.3, Math.min(1, options.brightness / 100));
    if (amount >= 1) return base;

    return Object.fromEntries(
        Object.entries(base).map(([name, color]) => [
            name,
            KEEP.has(name) ? color : mix(color, base.background, amount),
        ])
    );
};
