import { arrange, fillUrl, safeUrl } from '@/lib/sidebarLayout';

describe('sidebarLayout', () => {
    const entries = [{ key: '/files' }, { key: '/import' }, { key: '/backups' }, { key: 'extra:abc' }];

    it('keeps the default order without a list', () => {
        expect(arrange(entries, []).map((e) => e.key)).toEqual(['/files', '/import', '/backups', 'extra:abc']);
    });

    it('follows the list, and puts entries it does not know after the ones it does', () => {
        expect(arrange(entries, ['extra:abc', '/backups']).map((e) => e.key)).toEqual([
            'extra:abc',
            '/backups',
            '/files',
            '/import',
        ]);
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
