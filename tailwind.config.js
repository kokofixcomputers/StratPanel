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

const palette = Object.fromEntries(Object.keys(scales).map((name) => [name, scale(name)]));
const gray = palette.neutral;
const blue = palette.primary;

module.exports = {
    content: ['./resources/scripts/**/*.{js,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
                header: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
            },
            colors: {
                ...palette,
                black: variable('--c-black'),
                // Cards: white in the light theme, a dark surface in the dark one.
                white: variable('--c-white'),
                // White that stays white, for the text on a coloured button or over a picture.
                snow: '#ffffff',
                primary: blue,
                blue,
                gray,
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
