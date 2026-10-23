import { BUILD_CAP, capped, filterBuilds, filterVersions } from '@/lib/versionSearch';
import { Build, VersionInfo } from '@/lib/mcjars';

const version = (id: string): VersionInfo => ({
    id,
    type: 'RELEASE',
    supported: true,
    java: 21,
    builds: 1,
    latest: {} as Build,
});
const build = (id: number, name: string, projectVersionId: string | null = null): Build => ({
    id,
    name,
    versionId: '1.21',
    projectVersionId,
    buildNumber: id,
    experimental: false,
    installation: [],
    changes: [],
    created: null,
});

describe('filterVersions', () => {
    const list = ['1.21.4', '1.21.1', '1.21', '1.20.6', '1.2.5'].map(version);

    it('keeps everything without a search', () => {
        expect(filterVersions(list, '')).toBe(list);
        expect(filterVersions(list, '   ')).toBe(list);
    });

    it('finds what has the search in its name and keeps the order', () => {
        expect(filterVersions(list, '1.21').map((v) => v.id)).toEqual(['1.21.4', '1.21.1', '1.21']);
        expect(filterVersions(list, '.20').map((v) => v.id)).toEqual(['1.20.6']);
        expect(filterVersions(list, 'nothing')).toEqual([]);
    });
});

describe('filterBuilds', () => {
    const builds = [build(130, 'Paper-130'), build(129, 'Paper-129'), build(7, 'abc', '1.21-7')];

    it('finds a build by its number, with or without a #', () => {
        expect(filterBuilds(builds, '129').map((b) => b.id)).toEqual([129]);
        expect(filterBuilds(builds, '#130').map((b) => b.id)).toEqual([130]);
    });

    it('finds a build by its label', () => {
        expect(filterBuilds(builds, '1.21-7').map((b) => b.id)).toEqual([7]);
    });
});

describe('capped', () => {
    const list = Array.from({ length: 40 }, (_, i) => i);

    it('draws the first ones, or all of them', () => {
        expect(capped(list, BUILD_CAP, false)).toHaveLength(BUILD_CAP);
        expect(capped(list, BUILD_CAP, true)).toHaveLength(40);
    });
});
