const { scales, singles } = require('./resources/scripts/assets/css/palette');

// Every colour is a CSS variable with the three numbers of the colour (theme.css has the values of the light and the dark theme, see
// resources/scripts/assets/css/palette.js), so a change of theme re-colours the whole panel. Tailwind and twin.macro both call these
// with the variable of the opacity when a utility has one.
const variable =
    (name) =>
    ({ opacityValue, opacityVariable }) => {
        if (opacityValue !== undefined) return `rgb(var(${name}) / ${opacityValue})`;
        if (opacityVariable) return `rgb(var(${name}) / var(${opacityVariable}, 1))`;

        return `rgb(var(${name}))`;
    };

const scale = (name) =>
    Object.fromEntries(Object.keys(scales[name].light).map((shade) => [shade, variable(`--c-${name}-${shade}`)]));

// Cards are white (the light theme) or neutral-700 (the dark one) and the theme editor can make them see-through: --card-alpha is
// multiplied into these two colours, wherever they are used (utility classes and the css of styled components alike).
const surface =
    (name) =>
    ({ opacityValue, opacityVariable }) =>
        `rgb(var(${name}) / calc(${opacityValue ?? (opacityVariable ? `var(${opacityVariable}, 1)` : '1')} * var(--card-alpha, 1)))`;

const palette = Object.fromEntries(Object.keys(scales).map((name) => [name, scale(name)]));
palette.neutral = { ...palette.neutral, 700: surface('--c-neutral-700') };
const gray = palette.neutral;
const blue = palette.primary;

module.exports = {
    content: ['./resources/scripts/**/*.{js,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                // --font-sans is set by the theme editor (lib/themeConfig.ts) when an admin picked another font.
                sans: ['var(--font-sans, "Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif)'],
                header: ['var(--font-sans, "Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, sans-serif)'],
            },
            colors: {
                ...palette,
                black: variable('--c-black'),
                // Cards: white in the light theme, a dark surface in the dark one.
                white: surface('--c-white'),
                // White that stays white, for the text on a coloured button or over a picture.
                snow: '#ffffff',
                primary: blue,
                blue,
                gray,
            },
            // The corners and shadows can be changed in the theme editor, which sets these variables.
            borderRadius: {
                sm: 'var(--r-sm, 0.125rem)',
                DEFAULT: 'var(--r, 0.5rem)',
                md: 'var(--r-md, 0.625rem)',
                lg: 'var(--r-lg, 0.75rem)',
                xl: 'var(--r-xl, 1rem)',
                '2xl': 'var(--r-2xl, 1.25rem)',
            },
            boxShadow: {
                DEFAULT: 'var(--shadow, 0 1px 2px 0 rgb(15 23 42 / 0.04))',
                md: 'var(--shadow-md, 0 2px 6px -1px rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04))',
                lg: 'var(--shadow-lg, 0 10px 24px -6px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.05))',
                xl: 'var(--shadow-xl, 0 24px 48px -12px rgb(15 23 42 / 0.22))',
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
