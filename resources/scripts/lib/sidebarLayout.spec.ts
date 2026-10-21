import {
    explicitCategories,
    fillUrl,
    migrateServerSidebar,
    resolveSidebar,
    safeUrl,
    SIDEBAR_DEFAULTS,
    SidebarLayout,
} from '@/lib/sidebarLayout';

const empty: SidebarLayout = { categories: [], hidden: [], extra: [] };
const all = Object.keys(SIDEBAR_DEFAULTS.server.labels);

describe('sidebarLayout', () => {
    it('shows the default categories without a layout', () => {
        const groups = resolveSidebar('server', empty, all);
        expect(groups.map((g) => g.title)).toEqual(['Server', 'Minecraft', 'Manage', 'Configuration']);
        expect(groups[0].entries.map((e) => e.key)).toEqual(['/', '/players']);
    });

    it('leaves out items the person does not have, hidden ones, and categories that end up empty', () => {
        const groups = resolveSidebar('server', { ...empty, hidden: ['/files'] }, ['/', '/files', '/import']);
        expect(groups.map((g) => g.title)).toEqual(['Server', 'Manage']);
        expect(groups[1].entries.map((e) => e.key)).toEqual(['/import']);
    });

    it('follows categories of your own, in their order, with links in them', () => {
        const layout: SidebarLayout = {
            categories: [
                { id: 'infra', title: 'Infrastructure', items: ['/backups', 'extra:wiki', '/files'] },
                { id: 'misc', title: 'Misc', items: ['/'] },
            ],
            hidden: [],
            extra: [{ id: 'wiki', label: 'Wiki', url: 'https://wiki.example.com', newTab: true }],
        };
        const groups = resolveSidebar('server', layout, ['/', '/files', '/backups']);
        expect(groups.map((g) => g.title)).toEqual(['Infrastructure', 'Misc']);
        expect(groups[0].entries.map((e) => e.key)).toEqual(['/backups', 'extra:wiki', '/files']);
        expect(groups[0].entries[1].extra?.label).toBe('Wiki');
    });

    it('puts items the layout does not place under More, so a new page does not vanish', () => {
        const layout: SidebarLayout = { ...empty, categories: [{ id: 'a', title: 'A', items: ['/'] }] };
        const groups = resolveSidebar('server', layout, ['/', '/files', '/ext/thing']);
        expect(groups[1]).toMatchObject({ title: 'More' });
        expect(groups[1].entries.map((e) => e.key)).toEqual(['/files', '/ext/thing']);
    });

    it('has defaults for the account and the dashboard sidebar too', () => {
        expect(resolveSidebar('account', empty, ['/', '/api'])[0].entries.map((e) => e.key)).toEqual(['/', '/api']);
        expect(resolveSidebar('dashboard', empty, ['/', '/account'])[0].title).toBe('Panel');
        expect(explicitCategories('dashboard', empty)[0].items).toContain('/create');
    });

    it('turns the layout of before the three sidebars into categories', () => {
        const layout = migrateServerSidebar({
            order: ['/backups', 'extra:abc', '/files'],
            hidden: ['/import'],
            extra: [{ id: 'abc', label: 'Wiki', url: '/wiki', newTab: false, group: 'Manage' }],
        });
        const manage = layout.categories.find((c) => c.title === 'Manage')!;
        expect(manage.items.slice(0, 3)).toEqual(['/backups', 'extra:abc', '/files']);
        expect(layout.hidden).toEqual(['/import']);
        expect(layout.extra[0]).toEqual({ id: 'abc', label: 'Wiki', url: '/wiki', newTab: false });
    });

    it('fills in the server and refuses addresses that are not links', () => {
        expect(fillUrl('/server/{id}/x?u={uuid}', { id: 'a1', uuid: 'u-1' })).toBe('/server/a1/x?u=u-1');
        expect(safeUrl('https://example.com/a')).toBe(true);
        expect(safeUrl('/server/abc')).toBe(true);
        expect(safeUrl('//evil.example')).toBe(false);
        expect(safeUrl('javascript:alert(1)')).toBe(false);
        expect(safeUrl('/a b')).toBe(false);
    });
});
