import { adminUrl, allowed, firstPage, PAGES } from '@/lib/adminNav';

const page = (key: string) => PAGES.find((p) => p.key === key)!;

describe('allowed', () => {
    it('lets root admins into everything, including what is for root admins only', () => {
        PAGES.forEach((p) => expect(allowed(p, [], true)).toBe(true));
    });

    it('opens a page for one of its permissions and for no other', () => {
        expect(allowed(page('roles'), ['roles.view'], false)).toBe(true);
        expect(allowed(page('roles'), ['users.view'], false)).toBe(false);
        expect(allowed(page('settings'), ['settings.mail.view'], false)).toBe(true);
    });

    it('keeps the pages of root admins from everybody else', () => {
        expect(allowed(page('api'), ['roles.view', 'users.view'], false)).toBe(false);
        expect(allowed(page('updates'), [], false)).toBe(false);
    });
});

describe('firstPage', () => {
    it('is the first page of the sidebar that may be opened', () => {
        expect(firstPage(['roles.view', 'locations.view'], false)?.key).toBe('locations');
        expect(firstPage(['overview.view'], false)?.key).toBe('overview');
        expect(firstPage([], false)).toBeUndefined();
    });
});

describe('adminUrl', () => {
    it('is under /admin', () => {
        expect(adminUrl()).toBe('/admin');
        expect(adminUrl('/roles')).toBe('/admin/roles');
    });
});
