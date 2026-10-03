const colors = require('tailwindcss/colors');

// Light theme. The "gray" / "neutral" scales are surface-oriented: 50-400 are text tones (darkest to muted),
// 500 is a border / divider tone and 600-900 are progressively lighter surfaces.
const gray = {
    50: '#0f172a',
    100: '#1e293b',
    200: '#334155',
    300: '#475569',
    400: '#64748b',
    500: '#e5e7eb',
    600: '#f3f4f6',
    700: '#ffffff',
    800: '#f5f5f6',
    900: '#fafafa',
};

const blue = {
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
};

module.exports = {
    content: ['./resources/scripts/**/*.{js,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
                header: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
            },
            colors: {
                black: '#eef0f3',
                primary: blue,
                blue: blue,
                gray: gray,
                neutral: gray,
                cyan: colors.cyan,
            },
            borderRadius: {
                DEFAULT: '0.5rem',
                md: '0.625rem',
                lg: '0.75rem',
                xl: '1rem',
                '2xl': '1.25rem',
            },
            boxShadow: {
                DEFAULT: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
                md: '0 2px 6px -1px rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
                lg: '0 10px 24px -6px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.05)',
                xl: '0 24px 48px -12px rgb(15 23 42 / 0.22)',
            },
            fontSize: {
                '2xs': '0.6875rem',
            },
            transitionDuration: {
                250: '250ms',
            },
            borderColor: (theme) => ({
                default: theme('colors.neutral.500', 'currentColor'),
            }),
        },
    },
    plugins: [
        require('@tailwindcss/line-clamp'),
        require('@tailwindcss/forms')({
            strategy: 'class',
        }),
    ],
};
