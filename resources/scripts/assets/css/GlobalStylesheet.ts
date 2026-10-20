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
        letter-spacing: var(--tracking, -0.005em);
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
    [data-chrome='floating'] .app-nav {
        position: sticky;
        top: 0.75rem;
        z-index: 40;
    }
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

    /* Lines around the cards, the sidebar without a card, how the main buttons look (theme editor: data-borders, data-side-flat, data-btn-style). */
    [data-borders='none'] .border-neutral-500 {
        border-color: transparent;
    }
    [data-borders='strong'] .border-neutral-500 {
        border-color: rgb(var(--c-neutral-400) / 0.55);
    }
    [data-side-flat='true'] .server-sidebar {
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        backdrop-filter: none;
    }
    [data-btn-style='soft'] .btn-primary:not(.btn-flat) {
        background: rgb(var(--c-primary-50));
        color: rgb(var(--c-primary-700));
        border: 1px solid rgb(var(--c-primary-200));
        box-shadow: none;
    }
    [data-btn-style='soft'] .btn-primary:not(.btn-flat):hover:not(:disabled) {
        background: rgb(var(--c-primary-100));
    }
    [data-btn-style='outline'] .btn-primary:not(.btn-flat) {
        background: transparent;
        color: rgb(var(--c-primary-600));
        border: 1.5px solid rgb(var(--c-primary-600));
        box-shadow: none;
    }
    [data-btn-style='outline'] .btn-primary:not(.btn-flat):hover:not(:disabled) {
        background: rgb(var(--c-primary-50));
    }
    [data-btn-style='gradient'] .btn-primary:not(.btn-flat) {
        background: linear-gradient(180deg, rgb(var(--c-primary-500)), rgb(var(--c-primary-700)));
        border-color: rgb(var(--c-primary-700));
    }
    [data-btn-style='gradient'] .btn-primary:not(.btn-flat):hover:not(:disabled) {
        background: linear-gradient(180deg, rgb(var(--c-primary-600)), rgb(var(--c-primary-800)));
    }

    /* Movement (data-btn-hover, data-btn-press, data-card-hover, data-speed, data-page-anim, data-pulse). */
    .btn, .hover-card {
        transition: transform 150ms ease, box-shadow 150ms ease, background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }
    [data-btn-hover='lift'] .btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg, 0 10px 24px -6px rgb(15 23 42 / 0.2));
    }
    [data-btn-hover='scale'] .btn:hover:not(:disabled) {
        transform: scale(1.05);
    }
    [data-btn-hover='glow'] .btn:hover:not(:disabled) {
        box-shadow: 0 0 0 3px rgb(var(--c-neutral-400) / 0.25);
    }
    [data-btn-hover='glow'] .btn-primary:not(.btn-flat):hover:not(:disabled) {
        box-shadow: 0 0 0 3px rgb(var(--c-primary-600) / 0.25), 0 6px 22px rgb(var(--c-primary-600) / 0.5);
    }
    [data-btn-hover='shine'] .btn {
        position: relative;
        overflow: hidden;
    }
    [data-btn-hover='shine'] .btn::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 0.35) 50%, transparent 70%);
        transform: translateX(-120%);
        transition: transform 600ms ease;
        pointer-events: none;
    }
    [data-btn-hover='shine'] .btn:hover:not(:disabled)::after {
        transform: translateX(120%);
    }
    [data-btn-press='squish'] .btn:active:not(:disabled) {
        transform: scale(0.94);
    }
    [data-btn-press='sink'] .btn:active:not(:disabled) {
        transform: translateY(2px);
        box-shadow: none;
    }
    [data-card-hover='lift'] .hover-card:hover {
        transform: translateY(-3px);
        box-shadow: var(--shadow-lg, 0 10px 24px -6px rgb(15 23 42 / 0.2));
    }
    [data-card-hover='glow'] .hover-card:hover {
        border-color: rgb(var(--c-primary-600) / 0.6);
        box-shadow: 0 0 0 1px rgb(var(--c-primary-600) / 0.4), 0 8px 28px rgb(var(--c-primary-600) / 0.22);
    }
    [data-card-hover='border'] .hover-card:hover {
        border-color: rgb(var(--c-primary-600));
    }
    [data-speed='off'] *:not(.animate-spin), [data-speed='off'] *::before, [data-speed='off'] *::after {
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        animation-duration: 0s !important;
    }
    [data-speed='fast'] *:not(.animate-spin) {
        transition-duration: 75ms !important;
    }
    [data-speed='slow'] *:not(.animate-spin) {
        transition-duration: 350ms !important;
    }
    @media (prefers-reduced-motion: reduce) {
        html *:not(.animate-spin), html *::before, html *::after {
            transition-duration: 0s !important;
            animation-duration: 0s !important;
        }
    }
    @keyframes page-slide-in {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: none; }
    }
    [data-page-anim='slide'] section {
        animation: page-slide-in 280ms ease-out;
    }
    @keyframes status-pulse {
        0% { box-shadow: 0 0 0 0 rgb(34 197 94 / 0.55); }
        70% { box-shadow: 0 0 0 7px rgb(34 197 94 / 0); }
        100% { box-shadow: 0 0 0 0 rgb(34 197 94 / 0); }
    }
    [data-pulse='true'] .status-bar.running {
        animation: status-pulse 2s infinite;
    }

    /* How big a server of the dashboard is (data-row-size, the default is medium) and how its state is marked (data-row-status). */
    :is(html:not([data-row-size]), [data-row-size='medium']) .server-row {
        padding: 0.75rem 1rem;
        gap: 0.75rem;
    }
    :is(html:not([data-row-size]), [data-row-size='medium']) .server-row .row-icon {
        width: 2.75rem !important;
        height: 2.75rem !important;
        margin-right: 0.75rem !important;
    }
    [data-row-size='small'] .server-row {
        padding: 0.5rem 0.75rem;
        gap: 0.5rem;
    }
    [data-row-size='small'] .server-row .row-icon {
        width: 2.25rem !important;
        height: 2.25rem !important;
        margin-right: 0.6rem !important;
        padding: 0.5rem !important;
    }
    [data-row-size='small'] .server-row .metric-note,
    [data-row-size='small'] .server-row .row-desc {
        display: none;
    }
    [data-row-size='small'] .server-row .row-metrics {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    [data-row-status='dot'] .status-bar {
        width: 0.6rem !important;
        height: 0.6rem !important;
        top: 0.9rem;
        right: 0.9rem;
        margin: 0 !important;
    }
    [data-row-status='none'] .status-bar {
        display: none;
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
        ${tw`tracking-tight font-header text-neutral-50`};
        font-weight: var(--heading-weight, 600);
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
