/**
 * The browser part of extensions. An extension ships a script (web/index.js in its .stratext) that the panel loads after it has
 * started. The script finds `window.Stratosphere`, which is how it talks to the panel:
 *
 *   window.Stratosphere.register({
 *       id: 'my-extension',
 *       setup(api) {
 *           api.slot('server.settings', MyCard);                   // a card on the Settings page of a server
 *           api.serverPage({ path: 'hello', label: 'Hello', component: MyPage });   // a page in the server menu
 *       },
 *   });
 *
 * Everything an extension does is kept apart from the others: a script that fails to load, a setup that throws or a component that
 * crashes while it renders is dropped and logged, the panel and the other extensions carry on.
 */
import React from 'react';
import http from '@/api/http';

export const API_VERSION = 1;

/** The places an extension can put a component, and what the component is given. */
export const SLOTS = [
    // On the console page of a server, above the details. Props: { server }.
    'server.console',
    // On the Settings page of a server. Props: { server }.
    'server.settings',
    // On the dashboard, above the list of servers.
    'dashboard.top',
] as const;

export type SlotName = typeof SLOTS[number];

export interface ExtensionInfo {
    id: string;
    name: string;
    version: string;
    scripts: string[];
    styles: string[];
}

export interface SlotEntry {
    extension: string;
    order: number;
    component: React.ComponentType<any>;
}

export interface ServerPageDefinition {
    // The last part of the address: /server/<id>/ext/<extension>/<path>.
    path: string;
    label: string;
    component: React.ComponentType<any>;
    // The permission a person needs on the server to see it, none for everybody.
    permission?: string | string[] | null;
}

export interface ServerPage extends ServerPageDefinition {
    extension: string;
}

export interface ExtensionApiForSetup {
    id: string;
    api: number;
    React: typeof React;
    http: typeof http;
    slot: (name: string, component: React.ComponentType<any>, options?: { order?: number }) => void;
    serverPage: (page: ServerPageDefinition) => void;
}

export interface ExtensionDefinition {
    id: string;
    setup: (api: ExtensionApiForSetup) => void;
}

let slots: Record<string, SlotEntry[]> = {};
let pages: ServerPage[] = [];
const loaded: Record<string, 'loaded' | 'failed'> = {};
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const complain = (message: string, error?: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[extensions] ${message}`, error ?? '');
};

/** Forgets everything an extension added, used when its setup failed half way. */
const withdraw = (extension: string) => {
    slots = Object.fromEntries(
        Object.entries(slots).map(([name, entries]) => [name, entries.filter((e) => e.extension !== extension)])
    );
    pages = pages.filter((page) => page.extension !== extension);
};

const apiFor = (extension: string): ExtensionApiForSetup => ({
    id: extension,
    api: API_VERSION,
    React,
    http,
    slot: (name, component, options = {}) => {
        if (!(SLOTS as readonly string[]).includes(name)) {
            complain(`${extension} asked for a place that does not exist: ${name}`);
            return;
        }
        if (!component || (typeof component !== 'function' && typeof component !== 'object')) {
            complain(`${extension}: the component for ${name} is not a component`);
            return;
        }
        slots[name] = [...(slots[name] || []), { extension, order: options.order ?? 10, component }];
    },
    serverPage: (page) => {
        if (!/^[a-z0-9][a-z0-9\-_/]{0,60}$/i.test(page?.path || '') || !page.label || !page.component) {
            complain(`${extension} has a page that is not valid`);
            return;
        }
        pages = [...pages.filter((p) => !(p.extension === extension && p.path === page.path)), { ...page, extension }];
    },
});

/** What an extension's script calls to join the panel. */
export const register = (definition: ExtensionDefinition): boolean => {
    try {
        if (!definition || typeof definition.id !== 'string' || typeof definition.setup !== 'function') {
            throw new Error('register() needs an id and a setup function');
        }
        if (loaded[definition.id] === 'loaded') {
            complain(`${definition.id} registered twice, the second time is ignored`);
            return false;
        }

        definition.setup(apiFor(definition.id));
        loaded[definition.id] = 'loaded';
        notify();

        return true;
    } catch (error) {
        const id = typeof definition?.id === 'string' ? definition.id : 'an extension';
        withdraw(id);
        loaded[id] = 'failed';
        complain(`${id} could not be set up and was left out`, error);
        notify();

        return false;
    }
};

export const getSlot = (name: string): SlotEntry[] =>
    [...(slots[name] || [])].sort((a, b) => a.order - b.order || a.extension.localeCompare(b.extension));

export const getServerPages = (): ServerPage[] => pages;

export const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

/** Gives a component the current slots and pages, and renders again when an extension adds more (its script came in late). */
export const useExtensionRegistry = (): number => {
    const [version, setVersion] = React.useState(0);
    React.useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);

    return version;
};

const SAFE_URL = /^\/extensions\/[a-z0-9][a-z0-9-]*\/assets\/[A-Za-z0-9_.\-/]+(\?v=[A-Za-z0-9_.\-+%]+)?$/;

/** An address of a file of an extension on this panel, with no way up and out of its folder. */
export const isSafeAssetUrl = (url: unknown): url is string =>
    typeof url === 'string' && SAFE_URL.test(url) && !/(^|\/)\.\.?(\/|\?|$)/.test(url) && !url.includes('//', 1);

/** Adds the styles and scripts of the extensions that are on. A file that cannot be loaded is reported and skipped. */
export const loadExtensions = (extensions: ExtensionInfo[] | undefined, doc: Document = document): void => {
    if (!Array.isArray(extensions)) return;

    // The panel gives the scripts the one thing they need to find it.
    (window as any).Stratosphere = (window as any).Stratosphere || {
        api: API_VERSION,
        React,
        http,
        register,
    };

    extensions.forEach((extension) => {
        (extension.styles || []).filter(isSafeAssetUrl).forEach((href) => {
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.extension = extension.id;
            link.onerror = () => complain(`The style ${href} of ${extension.id} could not be loaded`);
            doc.head.appendChild(link);
        });

        (extension.scripts || []).filter(isSafeAssetUrl).forEach((src) => {
            const script = doc.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.extension = extension.id;
            script.onerror = () => {
                loaded[extension.id] = 'failed';
                complain(`The script ${src} of ${extension.id} could not be loaded, the panel carries on without it`);
            };
            doc.head.appendChild(script);
        });
    });
};

/** For the tests: forget everything. */
export const resetExtensions = () => {
    slots = {};
    pages = [];
    Object.keys(loaded).forEach((key) => delete loaded[key]);
    notify();
};
