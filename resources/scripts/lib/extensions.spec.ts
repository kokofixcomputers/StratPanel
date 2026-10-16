/**
 * @jest-environment jsdom
 */
import React from 'react';
import { getServerPages, getSlot, loadExtensions, register, resetExtensions, SLOTS, subscribe } from '@/lib/extensions';

jest.mock('@/api/http', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const Card = () => null;
const Other = () => null;

beforeEach(() => {
    resetExtensions();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('register', () => {
    it('lets an extension add a component to a slot', () => {
        expect(register({ id: 'one', setup: (api) => api.slot('server.settings', Card) })).toBe(true);

        expect(getSlot('server.settings')).toEqual([{ extension: 'one', order: 10, component: Card }]);
        expect(getSlot('dashboard.top')).toEqual([]);
    });

    it('gives the extension React and the http client of the panel, and says which version of the API it is', () => {
        let seen: any;
        register({ id: 'one', setup: (api) => (seen = api) });

        expect(seen.id).toBe('one');
        expect(seen.api).toBe(1);
        expect(seen.React).toBe(React);
        expect(typeof seen.http.get).toBe('function');
    });

    it('puts the components in the order they ask for, and by extension name after that', () => {
        register({ id: 'b', setup: (api) => api.slot('dashboard.top', Card) });
        register({ id: 'a', setup: (api) => api.slot('dashboard.top', Other) });
        register({ id: 'z', setup: (api) => api.slot('dashboard.top', Card, { order: 1 }) });

        expect(getSlot('dashboard.top').map((e) => e.extension)).toEqual(['z', 'a', 'b']);
    });

    it('ignores a slot that does not exist and a component that is not one', () => {
        register({
            id: 'one',
            setup: (api) => {
                api.slot('nowhere', Card);
                api.slot('server.settings', 'text' as any);
                api.slot('server.settings', null as any);
            },
        });

        SLOTS.forEach((name) => expect(getSlot(name)).toEqual([]));
    });

    it('leaves out an extension whose setup throws, with everything it had added, and keeps the others', () => {
        register({ id: 'good', setup: (api) => api.slot('server.settings', Card) });

        const ok = register({
            id: 'bad',
            setup: (api) => {
                api.slot('server.settings', Other);
                api.serverPage({ path: 'x', label: 'X', component: Other });
                throw new Error('boom');
            },
        });

        expect(ok).toBe(false);
        expect(getSlot('server.settings').map((e) => e.extension)).toEqual(['good']);
        expect(getServerPages()).toEqual([]);
        expect(console.error).toHaveBeenCalled();
    });

    it('does not accept the same extension twice', () => {
        register({ id: 'one', setup: (api) => api.slot('server.settings', Card) });

        expect(register({ id: 'one', setup: (api) => api.slot('server.settings', Other) })).toBe(false);
        expect(getSlot('server.settings')).toHaveLength(1);
        // A second try that failed must not take the first one away.
        expect(getSlot('server.settings')[0].component).toBe(Card);
    });

    it.each([null, undefined, {}, { id: 5, setup: () => undefined }, { id: 'x' }, 'text'])(
        'refuses %j',
        (definition) => {
            expect(register(definition as any)).toBe(false);
        }
    );

    it('tells whoever listens when something was added', () => {
        const listener = jest.fn();
        const unsubscribe = subscribe(listener);
        register({ id: 'one', setup: (api) => api.slot('server.settings', Card) });
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        register({ id: 'two', setup: () => undefined });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('server pages', () => {
    it('are added with a path and a label, once', () => {
        register({
            id: 'one',
            setup: (api) => {
                api.serverPage({ path: 'hello', label: 'Hello', component: Card, permission: 'file.read' });
                api.serverPage({ path: 'hello', label: 'Hello again', component: Other });
            },
        });

        expect(getServerPages()).toEqual([{ extension: 'one', path: 'hello', label: 'Hello again', component: Other }]);
    });

    it.each([
        { path: '', label: 'X', component: Card },
        { path: '../up', label: 'X', component: Card },
        { path: 'a b', label: 'X', component: Card },
        { path: 'fine', label: '', component: Card },
        { path: 'fine', label: 'X' },
    ])('refuses %j', (page) => {
        register({ id: 'one', setup: (api) => api.serverPage(page as any) });

        expect(getServerPages()).toEqual([]);
    });
});

describe('loadExtensions', () => {
    const info = (patch = {}) => ({
        id: 'one',
        name: 'One',
        version: '1.0.0',
        scripts: ['/extensions/one/assets/index.js?v=1.0.0'],
        styles: ['/extensions/one/assets/style.css?v=1.0.0'],
        ...patch,
    });

    beforeEach(() => {
        document.head.innerHTML = '';
        delete (window as any).Stratosphere;
    });

    it('adds the scripts and styles of every extension and gives them the panel to talk to', () => {
        loadExtensions([info(), info({ id: 'two', scripts: ['/extensions/two/assets/a/b.js'], styles: [] })]);

        const scripts = Array.from(document.head.querySelectorAll('script')).map((s) => s.getAttribute('src'));
        expect(scripts).toEqual(['/extensions/one/assets/index.js?v=1.0.0', '/extensions/two/assets/a/b.js']);
        expect(document.head.querySelector('link[rel=stylesheet]')?.getAttribute('href')).toBe(
            '/extensions/one/assets/style.css?v=1.0.0'
        );
        expect((window as any).Stratosphere.register).toBe(register);
        expect((window as any).Stratosphere.api).toBe(1);
    });

    it('only loads addresses on the panel under /extensions/<id>/assets/, never other sites or paths', () => {
        loadExtensions([
            info({
                scripts: [
                    'https://evil.example/x.js',
                    '//evil.example/x.js',
                    '/extensions/one/assets/../../x.js',
                    '/api/client/account',
                    'javascript:alert(1)',
                    '/extensions/one/assets/ok.js',
                ],
                styles: ['https://evil.example/x.css'],
            }),
        ]);

        expect(Array.from(document.head.querySelectorAll('script')).map((s) => s.getAttribute('src'))).toEqual([
            '/extensions/one/assets/ok.js',
        ]);
        expect(document.head.querySelectorAll('link')).toHaveLength(0);
    });

    it('carries on when a script cannot be loaded', () => {
        loadExtensions([info(), info({ id: 'two', scripts: ['/extensions/two/assets/index.js'], styles: [] })]);

        const first = document.head.querySelector('script[data-extension=one]') as HTMLScriptElement;
        first.onerror?.(new Event('error'));

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('could not be loaded'), '');
        expect(document.head.querySelector('script[data-extension=two]')).not.toBeNull();
    });

    it('does nothing for no extensions, or for nonsense', () => {
        loadExtensions(undefined);
        loadExtensions('x' as any);
        loadExtensions([]);

        expect(document.head.children).toHaveLength(0);
    });

    it('keeps what is on window.Stratosphere if an earlier call put it there', () => {
        loadExtensions([]);
        const first = (window as any).Stratosphere;
        loadExtensions([info()]);

        expect((window as any).Stratosphere).toBe(first);
    });
});
