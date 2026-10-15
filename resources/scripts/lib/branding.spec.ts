import { isSafeUrl, linksAt, parseBranding, visibleAnnouncements } from '@/lib/branding';

describe('parseBranding', () => {
    it('gives nothing for a page without branding', () => {
        expect(parseBranding(undefined)).toEqual({ favicon: null, announcements: [], links: [] });
        expect(parseBranding('x').links).toEqual([]);
    });

    it('reads announcements and links from what the server sends', () => {
        const branding = parseBranding({
            favicon: '/branding/favicon-1.png',
            announcements: [
                {
                    id: 'a1',
                    key: 'a1:ff',
                    title: 'Maintenance',
                    message: 'Tonight',
                    type: 'warning',
                    link_label: 'Details',
                    link_url: '/status',
                },
                { id: 'a2', message: '', type: 'info' },
                { id: 'a3', key: 'a3:00', message: 'Hi', type: 'weird', dismissible: false },
            ],
            links: [
                { label: 'Discord', url: 'https://discord.gg/x', location: 'navbar', new_tab: false },
                { label: '', url: '/x', location: 'footer' },
                { label: 'Rules', url: '/rules', location: 'nowhere' },
            ],
        });

        expect(branding.favicon).toBe('/branding/favicon-1.png');
        expect(branding.announcements).toHaveLength(2);
        expect(branding.announcements[0]).toMatchObject({ type: 'warning', linkLabel: 'Details', dismissible: true });
        expect(branding.announcements[1]).toMatchObject({ type: 'info', dismissible: false });
        expect(branding.links).toEqual([
            { label: 'Discord', url: 'https://discord.gg/x', location: 'navbar', newTab: false },
            { label: 'Rules', url: '/rules', location: 'footer', newTab: true },
        ]);
    });
});

describe('links', () => {
    it('only follows web addresses and pages of the panel', () => {
        expect(isSafeUrl('https://example.com/a')).toBe(true);
        expect(isSafeUrl('/account')).toBe(true);
        expect(isSafeUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeUrl('//evil.example')).toBe(false);
        expect(isSafeUrl('data:text/html,hi')).toBe(false);
    });

    it('picks the links of one place and drops unsafe ones', () => {
        const links = [
            { label: 'A', url: '/a', location: 'footer' as const, newTab: true },
            { label: 'B', url: 'javascript:1', location: 'footer' as const, newTab: true },
            { label: 'C', url: '/c', location: 'sidebar' as const, newTab: true },
        ];

        expect(linksAt(links, 'footer').map((l) => l.label)).toEqual(['A']);
        expect(linksAt(links, 'sidebar').map((l) => l.label)).toEqual(['C']);
    });
});

describe('visibleAnnouncements', () => {
    const base = { id: 'a', title: '', message: 'm', type: 'info' as const, linkLabel: '', linkUrl: '' };

    it('hides dismissed announcements, but an edited one (new key) returns', () => {
        const list = [
            { ...base, key: 'a:1', dismissible: true },
            { ...base, key: 'b:1', dismissible: true },
            { ...base, key: 'c:1', dismissible: false },
        ];

        expect(visibleAnnouncements(list, ['a:1', 'c:1']).map((a) => a.key)).toEqual(['b:1', 'c:1']);
        expect(visibleAnnouncements(list, ['a:old']).map((a) => a.key)).toEqual(['a:1', 'b:1', 'c:1']);
    });
});
