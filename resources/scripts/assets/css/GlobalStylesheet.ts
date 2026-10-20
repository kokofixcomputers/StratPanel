import tw from 'twin.macro';
import { createGlobalStyle } from 'styled-components/macro';
// @ts-expect-error untyped font file
import font from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';

export default createGlobalStyle`
    @font-face {
        font-family: 'Inter Variable';
        font-style: normal;
        font-display: swap;
        font-weight: 100 900;
        src: url(${font}) format('woff2-variations');
        unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
    }

    html {
        -webkit-font-smoothing: antialiased;
    }

    body {
        ${tw`font-sans bg-neutral-800 text-neutral-200`};
        letter-spacing: -0.005em;
    }

    /* The picture behind the panel from the theme editor (--bg-image), blurred and dimmed with the colour of the page. */
    body::before, body::after {
        content: '';
        position: fixed;
        inset: 0;
        z-index: -1;
        pointer-events: none;
    }
    body::before {
        background: var(--bg-image, none) center / cover no-repeat;
        filter: blur(var(--bg-blur, 0px));
        transform: scale(1.05);
    }
    body::after {
        background: rgb(var(--c-neutral-800) / var(--bg-dim, 0));
    }

    /* See-through cards (--card-alpha), with what is behind them blurred. */
    html .bg-white, html .bg-neutral-700 {
        --tw-bg-opacity: var(--card-alpha, 1);
        backdrop-filter: blur(var(--card-blur, 0px));
    }

    /* The servers of the dashboard: one under the other, or side by side. */
    .server-list {
        display: grid;
        grid-template-columns: repeat(var(--server-columns, 1), minmax(0, 1fr));
        gap: var(--server-gap, 0.75rem);
    }
    @media (max-width: 767px) {
        .server-list {
            grid-template-columns: minmax(0, 1fr);
        }
    }

    h1, h2, h3, h4, h5, h6 {
        ${tw`font-semibold tracking-tight font-header text-neutral-50`};
    }

    p {
        ${tw`text-neutral-300 leading-snug font-sans`};
    }

    a {
        ${tw`text-primary-600`};
    }

    code, kbd, samp {
        ${tw`font-mono`};
    }

    form {
        ${tw`m-0`};
    }

    textarea, select, input, button, button:focus, button:focus-visible {
        ${tw`outline-none`};
    }

    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button {
        -webkit-appearance: none !important;
        margin: 0;
    }

    input[type=number] {
        -moz-appearance: textfield !important;
    }

    ::selection {
        background: rgb(var(--c-primary-500) / 0.28);
    }

    /* Scroll Bar Style */
    ::-webkit-scrollbar {
        background: none;
        width: 14px;
        height: 14px;
    }

    ::-webkit-scrollbar-thumb {
        border: solid 4px transparent;
        border-radius: 9999px;
        background-clip: content-box;
        background-color: rgb(var(--c-neutral-400) / 0.35);
    }

    ::-webkit-scrollbar-thumb:hover {
        background-color: rgb(var(--c-neutral-400) / 0.65);
    }

    ::-webkit-scrollbar-corner {
        background: transparent;
    }
`;
