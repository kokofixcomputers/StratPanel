import { Theme } from '@/lib/theme';

/**
 * The colors the Tools tab hands to the embedded tools, so they use the panel's blue instead of their own violet. Keep the
 * scales in step with the palette (assets/css/palette.js). The keys are described in src/lib/theme.ts of mctoolsv3; "mode"
 * tells a tool which of the two this is.
 */
const light = {
    mode: 'light' as Theme,
    accent: '#1447e6',
    accentFg: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    panel: '#ffffff',
    border: '#e5e7eb',
    scale: {
        50: '#eff4ff',
        100: '#dbe6fe',
        200: '#bfd3fe',
        300: '#93b4fd',
        400: '#608bfa',
        500: '#2f62f0',
        600: '#1447e6',
        700: '#1138c2',
        800: '#122f9a',
        900: '#142a78',
    },
};

const dark = {
    mode: 'dark' as Theme,
    accent: '#3b69ef',
    accentFg: '#ffffff',
    text: '#f1f5f9',
    muted: '#a5b1c4',
    panel: '#141a23',
    border: '#283142',
    scale: {
        50: '#0f1c3a',
        100: '#142a5e',
        200: '#1c3d8c',
        300: '#3560cc',
        400: '#5b86f7',
        500: '#4a77f3',
        600: '#3b69ef',
        700: '#9db8ff',
        800: '#2a52cf',
        900: '#c6d6ff',
    },
};

export const toolsThemeFor = (theme: Theme) => (theme === 'dark' ? dark : light);
