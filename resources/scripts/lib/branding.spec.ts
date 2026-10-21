import { DEFAULT_LOGO, isSafeUrl, linksAt, logoUrl, parseBranding, visibleAnnouncements } from '@/lib/branding';

describe('link cards', () => {
    const card = (extra: object = {}) => ({
        id: 'abc123',
        title: 'Need a hand?',
        position: 'top',
        style: 'grid',
        enabled: true,
        links: [
            { label: 'Discord', url: 'https://discord.gg/x', icon: 'discord', new_tab: true },
            { label: 'Support', url: '/support', icon: 'support', new_tab: false },
            { label: 'Bad', url: 'javascript:alert(1)', icon: 'link', new_tab: true },
            { label: '', url: 'https://x.example', icon: 'link', new_tab: true },
        ],
        ...extra,
    });

    it('keeps the safe links with name and address, and the style, place and icons', () => {
        const [parsed] = parseBranding({ link_cards: [card()] }).linkCards;
        expect(parsed).toMatchObject({ title: 'Need a hand?', position: 'top', style: 'grid' });
        expect(parsed.links.map((l) => l.label)).toEqual(['Discord', 'Support']);
        expect(parsed.links[0]).toMatchObject({ icon: 'discord', newTab: true });
        expect(parsed.links[1].newTab).toBe(false);
    });

    it('falls back for an unknown style or position and leaves out cards that are off or empty', () => {
        const [parsed] = parseBranding({ link_cards: [card({ style: 'wild', position: 'middle' })] }).linkCards;
        expect(parsed).toMatchObject({ style: 'cards', position: 'bottom' });
        expect(parseBranding({ link_cards: [card({ enabled: false })] }).linkCards).toEqual([]);
        expect(parseBranding({ link_cards: [card({ links: [] })] }).linkCards).toEqual([]);
        expect(parseBranding({}).linkCards).toEqual([]);
    });
});

describe('console prompt', () => {
    it('is the default when none is set', () => {
        expect(parseBranding({}).consolePrompt).toBe('container@stratosphere~');
        expect(parseBranding({ console_prompt: '   ' }).consolePrompt).toBe('container@stratosphere~');
    });

    it('is the one an admin set', () => {
        expect(parseBranding({ console_prompt: ' koko@hosting~ ' }).consolePrompt).toBe('koko@hosting~');
    });
});

describe('parseBranding', () => {
    it('gives nothing for a page without branding', () => {
        expect(parseBranding(undefined)).toEqual({
            favicon: null,
            consolePrompt: 'container@stratosphere~',
            announcements: [],
            links: [],
            linkCards: [],
        });
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

describe('logoUrl', () => {
    it('is the favicon an admin uploaded, or the default one', () => {
        expect(logoUrl('/branding/favicon-1.png')).toBe('/branding/favicon-1.png');
        expect(logoUrl(null)).toBe(DEFAULT_LOGO);
        expect(logoUrl(undefined)).toBe(DEFAULT_LOGO);
        expect(logoUrl('')).toBe(DEFAULT_LOGO);
        expect(parseBranding({ favicon: '/branding/x.png' }).favicon).toBe('/branding/x.png');
    });
});
