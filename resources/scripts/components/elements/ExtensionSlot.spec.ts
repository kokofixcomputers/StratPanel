/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ExtensionSlot from '@/components/elements/ExtensionSlot';
import { register, resetExtensions } from '@/lib/extensions';

const h = React.createElement;

jest.mock('@/api/http', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
    resetExtensions();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('ExtensionSlot', () => {
    it('shows nothing when no extension uses the slot', () => {
        const { container } = render(h(ExtensionSlot, { name: 'server.settings' }));

        expect(container).toBeEmptyDOMElement();
    });

    it('shows the components of the extensions with what the page gives them', () => {
        register({
            id: 'one',
            setup: (api) => api.slot('server.settings', ({ server }: any) => h('p', null, `Hello ${server.id}`)),
        });

        render(h(ExtensionSlot, { name: 'server.settings', server: { id: 'abc123' } }));

        expect(screen.getByText('Hello abc123')).toBeInTheDocument();
    });

    it('drops a component that crashes and shows the rest, and the page around it stays', () => {
        register({
            id: 'bad',
            setup: (api) =>
                api.slot('server.settings', () => {
                    throw new Error('crash');
                }),
        });
        register({ id: 'good', setup: (api) => api.slot('server.settings', () => h('p', null, 'still here')) });

        render(h('div', null, h('p', null, 'the page'), h(ExtensionSlot, { name: 'server.settings' })));

        expect(screen.getByText('the page')).toBeInTheDocument();
        expect(screen.getByText('still here')).toBeInTheDocument();
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bad crashed'), expect.anything());
    });

    it('shows what an extension adds after the page was drawn', () => {
        render(h(ExtensionSlot, { name: 'dashboard.top' }));
        expect(screen.queryByText('late')).not.toBeInTheDocument();

        act(() => {
            register({ id: 'late', setup: (api) => api.slot('dashboard.top', () => h('p', null, 'late')) });
        });

        expect(screen.getByText('late')).toBeInTheDocument();
    });
});
