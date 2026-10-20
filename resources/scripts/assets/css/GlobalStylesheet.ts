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
        /* Everything is in rem, so this scales the whole panel (--font-scale of the theme editor, in percent). */
        font-size: calc(var(--font-scale, 100) * 1%);
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

    /* The blur behind see-through cards (--card-blur). The see-through part is in tailwind.config.js (--card-alpha). */
    html .bg-white, html .bg-neutral-700, .glass {
        backdrop-filter: blur(var(--card-blur, 0px));
    }

    /* What opens over the page (dialogs, menus) stays solid, text behind it would show through otherwise. */
    #modal-portal, [role='dialog'], [role='menu'], [role='listbox'] {
        --card-alpha: 1;
    }

    /* The bars at the top, attached to the edge (the default) or floating above the page, from the theme editor (data-chrome). */
    [data-chrome='floating'] .app-nav,
    [data-chrome='floating'] .app-subnav {
        width: auto;
        margin: 0.75rem 0.75rem 0;
        border: 1px solid rgb(var(--c-neutral-500));
        border-radius: var(--r-xl, 1rem);
        box-shadow: var(--shadow-md, 0 2px 6px -1px rgb(15 23 42 / 0.06));
    }

    /* How the page you are on is marked in the menus (data-nav): tint is the default look, solid fills it, line draws a line. */
    [data-nav='solid'] .nav-item.is-active,
    [data-nav='solid'] .nav-right a.active {
        background: rgb(var(--c-primary-600));
        color: #fff;
    }
    [data-nav='solid'] .app-subnav > div > a.active {
        background: rgb(var(--c-primary-600));
        color: #fff;
        box-shadow: none;
        border-radius: var(--r-lg, 0.75rem);
        margin: 0.4rem 0.1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
    }
    [data-nav='line'] .nav-item.is-active {
        background: transparent;
        color: rgb(var(--c-primary-700));
        border-radius: 0;
        box-shadow: inset 3px 0 rgb(var(--c-primary-600));
    }
    [data-nav='line'] .nav-right a.active {
        background: transparent;
        border-radius: 0;
        box-shadow: inset 0 -2px rgb(var(--c-primary-600));
    }
    [data-nav='tint'] .app-subnav > div > a.active {
        background: rgb(var(--c-primary-50));
        color: rgb(var(--c-primary-700));
        box-shadow: none;
        border-radius: var(--r-lg, 0.75rem);
        margin: 0.4rem 0.1rem;
        padding-top: 0.5rem;
        padding-bottom: 0.5rem;
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
