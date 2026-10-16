import { browsesKind, hasKind, isSource, sortsFor, sourceLabel, sourceOfId } from '@/lib/contentSource';
import { readQuery } from '@/components/server/content/useContentQuery';

jest.mock('@/api/http', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    httpErrorToHuman: (e: any) => e.message,
}));

describe('lib/contentSource', () => {
    it('knows which site an id belongs to', () => {
        expect(sourceOfId('cf:238222')).toBe('curseforge');
        expect(sourceOfId('AANobbMI')).toBe('modrinth');
    });

    it('only accepts the sites it knows', () => {
        expect(isSource('modrinth')).toBe(true);
        expect(isSource('curseforge')).toBe(true);
        expect(isSource('spigotmc')).toBe(false);
        expect(isSource(null)).toBe(false);
        expect(sourceLabel('curseforge')).toBe('CurseForge');
    });

    it('has no modpacks on CurseForge, and everything on Modrinth', () => {
        expect(hasKind('curseforge', 'modpack')).toBe(false);
        (['mod', 'plugin', 'datapack', 'resourcepack', 'world'] as const).forEach((kind) =>
            expect(hasKind('curseforge', kind)).toBe(true)
        );
        (['mod', 'plugin', 'datapack', 'resourcepack', 'modpack', 'world'] as const).forEach((kind) =>
            expect(hasKind('modrinth', kind)).toBe(true)
        );
    });

    it('browses worlds only on CurseForge, on Modrinth they come from a link', () => {
        expect(browsesKind('curseforge', 'world')).toBe(true);
        expect(browsesKind('modrinth', 'world')).toBe(false);
        expect(browsesKind('modrinth', 'mod')).toBe(true);
    });

    it('sorts by what each site can', () => {
        expect(sortsFor('modrinth').map((s) => s.id)).toEqual([
            'relevance',
            'downloads',
            'follows',
            'updated',
            'newest',
        ]);
        expect(sortsFor('curseforge').map((s) => s.id)).toEqual([
            'relevance',
            'downloads',
            'rating',
            'updated',
            'newest',
        ]);
    });
});

describe('readQuery with a source', () => {
    it('is Modrinth unless the address says CurseForge', () => {
        expect(readQuery('', '').source).toBe('modrinth');
        expect(readQuery('?s=curseforge', '').source).toBe('curseforge');
        expect(readQuery('?s=other', '').source).toBe('modrinth');
    });

    it('shows mods instead of modpacks, which CurseForge does not have here', () => {
        expect(readQuery('?s=curseforge&t=modpack', '').kind).toBe('mod');
        expect(readQuery('?t=modpack', '').kind).toBe('modpack');
        expect(readQuery('?s=curseforge&t=world', '').kind).toBe('world');
    });

    it('ignores a sort the site does not have', () => {
        expect(readQuery('?o=follows', '').sort).toBe('follows');
        expect(readQuery('?s=curseforge&o=follows', '').sort).toBe('relevance');
        expect(readQuery('?s=curseforge&o=rating', '').sort).toBe('rating');
        expect(readQuery('?o=rating', '').sort).toBe('relevance');
    });
});
