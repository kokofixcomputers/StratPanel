/**
 * The colours of the panel, once for the light theme and once for the dark one. Every colour is a CSS variable (see theme.css, which
 * tools/build-theme.js writes from this file) that holds the three numbers of the colour, so a switch of the theme changes all of them
 * at once and Tailwind can still put an opacity on top of them.
 *
 * The "neutral" scale is made of surfaces and text: 50 to 400 are text (darkest to the most muted), 500 is a border and 600 to 900 are
 * surfaces. Dark inverts that: light text, dark surfaces. "white" is the colour of cards (not of text on a coloured button, which is
 * "snow" and does not change).
 */
const colors = require('tailwindcss/colors');

const hex = (value) => {
    const n = parseInt(value.replace('#', ''), 16);

    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// What the dark theme sits on, a tint of every colour is mixed into it.
const GROUND = '#0c1017';

const mix = (a, b, amount) => {
    const x = hex(a);
    const y = hex(b);

    return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)));
};

const neutral = {
    light: {
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
    },
    dark: {
        50: '#f1f5f9',
        100: '#e2e8f0',
        200: '#cbd5e1',
        300: '#a5b1c4',
        400: '#7d8ba1',
        500: '#283142',
        600: '#1c2330',
        700: '#141a23',
        800: GROUND,
        900: '#080b10',
    },
};

const primary = {
    light: {
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
    // 600 is the colour of buttons and links, light enough to be read on the dark surfaces and still carrying white text. 700 is
    // the text on a tinted background (a chip), 800 is what a button turns into when the mouse is over it.
    dark: {
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

/** A scale of the Tailwind palette for the dark theme: tints become dark tints, the text shades become light. */
const status = (name) => {
    const light = colors[name];
    const dark = {
        50: mix(light[500], GROUND, 0.14),
        100: mix(light[500], GROUND, 0.22),
        200: mix(light[500], GROUND, 0.34),
        300: mix(light[500], GROUND, 0.52),
        400: light[400],
        500: light[500],
        // A little lighter, text in this colour has to be read on a dark surface.
        600: mix('#ffffff', light[600], 0.1),
        700: light[300],
        800: light[200],
        900: light[100],
    };
    const pick = (scale) =>
        Object.fromEntries(Object.entries(scale).filter(([shade]) => Number(shade) >= 50 && Number(shade) <= 900));

    return { light: pick(light), dark: pick(dark) };
};

const scales = {
    neutral,
    primary,
    red: status('red'),
    green: status('green'),
    yellow: status('yellow'),
    amber: status('amber'),
    purple: status('purple'),
    indigo: status('indigo'),
    sky: status('sky'),
    cyan: status('cyan'),
};

// Colours that are one value.
const singles = {
    // Cards and everything that is "white" in the light theme.
    white: { light: '#ffffff', dark: neutral.dark[700] },
    // The old name of the lightest tone, used for overlays.
    black: { light: '#eef0f3', dark: '#05070a' },
};

module.exports = { scales, singles };
