/**
 * The theme editor shows the real panel in a frame (`/?theme-preview=1`) and sends it the draft it is editing, so what the admin sees is
 * exactly what the pages will look like. This is the panel's side: inside such a frame it listens for the draft and applies it without
 * saving anything. Only messages from the editor page of the same origin are taken.
 */
import { store } from '@/state';
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

/** The announcements and links the editor is working on, in place of the saved ones (they are printed into the page when it loads). */
const applyBranding = (draft: { announcements?: any[]; links?: any[]; linkCards?: any[] } | undefined) => {
    const settings = store.getState().settings.data;
    if (!draft || !settings) return;

    const branding = (settings.branding ?? {}) as Record<string, unknown>;
    store.getActions().settings.setSettings({
        ...settings,
        branding: {
            ...branding,
            ...(draft.announcements
                ? {
                      announcements: draft.announcements
                          .filter((a) => a.enabled && a.message?.trim())
                          // A key that is new every time so that one dismissed in the preview comes back with the next change.
                          .map((a, i) => ({
                              ...a,
                              key: `preview:${i}:${a.message.length}:${a.title?.length ?? 0}:${a.type}`,
                          })),
                  }
                : {}),
            ...(draft.links ? { links: draft.links.filter((l) => l.label?.trim() && l.url?.trim()) } : {}),
            ...(draft.linkCards ? { link_cards: draft.linkCards } : {}),
        },
    });
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
        applyBranding(event.data.branding);
    });

    window.parent.postMessage({ type: READY_MESSAGE }, window.location.origin);
};
