/**
 * The colors the Tools tab hands to the embedded tools, so they use the panel's blue instead of their own violet. Keep the
 * scale in step with the "blue" scale in tailwind.config.js. The keys are described in src/lib/theme.ts of mctoolsv3.
 */
export const toolsTheme = {
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
