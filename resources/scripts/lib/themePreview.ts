/**
 * The theme editor shows the real panel in a frame (`/?theme-preview=1`) and sends it the draft it is editing, so what the admin sees is
 * exactly what the pages will look like. This is the panel's side: inside such a frame it listens for the draft and applies it without
 * saving anything. Only messages from the editor page of the same origin are taken.
 */
import { applyTheme } from '@/lib/theme';
import { buildThemeCss, setPageThemeConfig, themeAttributes, withDefaults } from '@/lib/themeConfig';

export const PREVIEW_PARAM = 'theme-preview';
export const DRAFT_MESSAGE = 'stratosphere-theme-draft';
export const READY_MESSAGE = 'stratosphere-theme-ready';

const inPreviewFrame = (): boolean => {
    try {
        return window.self !== window.top && new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
    } catch (e) {
        return false;
    }
};

const apply = (draft: unknown, dark: unknown) => {
    const config = withDefaults(draft as any);

    let style = document.getElementById('stratosphere-custom-theme');
    if (!style) {
        style = document.createElement('style');
        style.id = 'stratosphere-custom-theme';
        document.head.appendChild(style);
    }
    style.textContent = buildThemeCss(config);

    const root = document.documentElement;
    Object.entries(themeAttributes(config)).forEach(([name, value]) => root.setAttribute(name, value));
    setPageThemeConfig(config);
    applyTheme(dark ? 'dark' : 'light');
};

/** Call once when the app starts, does nothing outside of the editor's frame. */
export const startThemePreview = (): void => {
    if (!inPreviewFrame()) return;

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin || event.source !== window.parent) return;
        if (event.data?.type !== DRAFT_MESSAGE) return;

        apply(event.data.config, event.data.dark);
    });

    window.parent.postMessage({ type: READY_MESSAGE }, window.location.origin);
};
