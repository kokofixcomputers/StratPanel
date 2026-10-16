import http from '@/api/http';
import {
    CfFile,
    CfMod,
    cfId,
    cfNumber,
    fingerprint,
    getProject,
    getProjectVersions,
    getVersion,
    directDownloadUrl,
    isCurseForgeId,
    kindOfClass,
    lookupFingerprints,
    searchProjects,
    toProjectDetails,
    toSearchHit,
    toVersion,
} from '@/lib/curseforge';

jest.mock('@/api/http', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    httpErrorToHuman: (e: any) => e?.response?.data?.errors?.[0]?.detail || e.message,
}));

const get = http.get as jest.Mock;
const post = http.post as jest.Mock;

const bytes = (text: string) => new TextEncoder().encode(text);

const file = (patch: Partial<CfFile> = {}): CfFile => ({
    id: 5001,
    modId: 77,
    displayName: 'Sodium 0.6.0',
    fileName: 'sodium-fabric-0.6.0.jar',
    releaseType: 1,
    fileDate: '2026-05-01T10:00:00Z',
    fileLength: 1234,
    downloadCount: 9,
    downloadUrl: 'https://edge.forgecdn.net/files/5001/0/sodium-fabric-0.6.0.jar',
    gameVersions: ['1.21.1', '1.21', 'Fabric', 'Client', 'Java 21'],
    dependencies: [],
    ...patch,
});

const mod = (patch: Partial<CfMod> = {}): CfMod => ({
    id: 77,
    name: 'Sodium',
    slug: 'sodium',
    summary: 'A rendering engine',
    classId: 6,
    downloadCount: 1500,
    thumbsUpCount: 42,
    categories: [{ id: 1, name: 'Performance', slug: 'performance' }],
    authors: [{ id: 1, name: 'jellysquid3' }],
    logo: {
        id: 1,
        modId: 77,
        title: '',
        description: '',
        thumbnailUrl: 'https://media.forgecdn.net/thumb.png',
        url: 'https://media.forgecdn.net/full.png',
    },
    screenshots: [
        {
            id: 2,
            modId: 77,
            title: 'In game',
            description: 'A screenshot',
            thumbnailUrl: 'https://media.forgecdn.net/s1t.png',
            url: 'https://media.forgecdn.net/s1.png',
        },
        { id: 3, modId: 77, title: '', description: '', thumbnailUrl: null, url: null },
    ],
    latestFiles: [file(), file({ id: 5002, gameVersions: ['1.20.1', 'Forge'] })],
    latestFilesIndexes: [{ gameVersion: '1.21.1', fileId: 5001, modLoader: 4 }],
    dateCreated: '2020-01-01T00:00:00Z',
    dateModified: '2026-05-01T10:00:00Z',
    links: {
        websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/sodium',
        sourceUrl: 'https://github.com/x/y',
        issuesUrl: null,
        wikiUrl: null,
    },
    allowModDistribution: true,
    ...patch,
});

beforeEach(() => {
    get.mockReset();
    post.mockReset();
});

describe('lib/curseforge ids', () => {
    it('keeps ids of CurseForge apart from Modrinth ids', () => {
        expect(cfId(238222)).toBe('cf:238222');
        expect(isCurseForgeId('cf:238222')).toBe(true);
        expect(isCurseForgeId('AANobbMI')).toBe(false);
        expect(isCurseForgeId(null)).toBe(false);
        expect(cfNumber('cf:238222')).toBe(238222);
        expect(cfNumber('AANobbMI')).toBeNaN();
    });
});

describe('fingerprint', () => {
    // Values from two separate implementations of MurmurHash2 with seed 1 (Python, and the murmurhash-js package).
    it.each([
        ['', 1540447798],
        ['a', 626045324],
        ['ab', 1692487918],
        ['abc', 1621425345],
        ['abcd', 3376380438],
        ['abcde', 3469237630],
        ['x'.repeat(1000), 27999438],
    ])('hashes %j', (text, expected) => {
        expect(fingerprint(bytes(text))).toBe(expected);
    });

    it('leaves out the tab, the line feeds and the space, as CurseForge does', () => {
        expect(fingerprint(bytes('a b\tc\r\nd\n'))).toBe(fingerprint(bytes('abcd')));
        expect(fingerprint(bytes('   '))).toBe(fingerprint(bytes('')));
        // Other bytes count, including ones that look like whitespace to a person.
        expect(fingerprint(new Uint8Array([97, 11, 98]))).not.toBe(fingerprint(bytes('ab')));
    });

    it('is the same for a buffer and for bytes, and always an unsigned 32 bit number', () => {
        const data = new Uint8Array(5000).map((_, i) => (i * 31 + 7) % 256);
        expect(fingerprint(data.buffer)).toBe(fingerprint(data));
        for (let n = 0; n < 40; n++) {
            const value = fingerprint(data.slice(0, n * 11));
            expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true);
        }
    });
});

describe('kindOfClass', () => {
    it('knows the kinds by the slug of the class, or by the usual number', () => {
        const classes = [{ id: 9999, name: 'Maps', slug: 'worlds', isClass: true }];
        expect(kindOfClass(9999, classes)).toBe('world');
        expect(kindOfClass(6)).toBe('mod');
        expect(kindOfClass(5)).toBe('plugin');
        expect(kindOfClass(17)).toBe('world');
        expect(kindOfClass(12)).toBe('resourcepack');
        expect(kindOfClass(6945)).toBe('datapack');
        expect(kindOfClass(4471)).toBe('modpack');
        expect(kindOfClass(4559)).toBeNull();
        expect(kindOfClass(null)).toBeNull();
    });
});

describe('toSearchHit', () => {
    it('looks like a Modrinth result with the id of CurseForge', () => {
        expect(toSearchHit(mod())).toEqual({
            project_id: 'cf:77',
            slug: '77',
            title: 'Sodium',
            description: 'A rendering engine',
            author: 'jellysquid3',
            downloads: 1500,
            icon_url: 'https://media.forgecdn.net/thumb.png',
            categories: ['performance'],
            follows: 42,
            date_modified: '2026-05-01T10:00:00Z',
        });
    });

    it('copes with a project that has nothing filled in', () => {
        const hit = toSearchHit(
            mod({ authors: [], logo: null, categories: undefined, thumbsUpCount: undefined, summary: '' })
        );
        expect(hit.author).toBe('Unknown');
        expect(hit.icon_url).toBeNull();
        expect(hit.categories).toEqual([]);
        expect(hit.follows).toBe(0);
    });
});

describe('toVersion', () => {
    it('keeps the Minecraft versions and the loader out of the tags, and has a file to install', () => {
        const version = toVersion(file());
        expect(version.id).toBe('cf:5001');
        expect(version.project_id).toBe('cf:77');
        expect(version.game_versions).toEqual(['1.21.1', '1.21']);
        expect(version.loaders).toEqual(['fabric']);
        expect(version.files).toEqual([
            {
                url: 'https://mediafilez.forgecdn.net/files/5001/0/sodium-fabric-0.6.0.jar',
                filename: 'sodium-fabric-0.6.0.jar',
                primary: true,
                size: 1234,
                hashes: undefined,
            },
        ]);
        expect(version.version_type).toBe('release');
        expect(version.restricted).toBe(false);
    });

    it('has no file for what the author keeps off other sites, and says so', () => {
        const version = toVersion(file({ downloadUrl: null }));
        expect(version.files).toEqual([]);
        expect(version.restricted).toBe(true);
    });

    it('turns the release type and the hash into what the pages know', () => {
        expect(toVersion(file({ releaseType: 2 })).version_type).toBe('beta');
        expect(toVersion(file({ releaseType: 3 })).version_type).toBe('alpha');
        expect(
            toVersion(
                file({
                    hashes: [
                        { value: 'abc', algo: 2 },
                        { value: 'def', algo: 1 },
                    ],
                })
            ).files[0].hashes
        ).toEqual({ sha1: 'def' });
    });

    it('reads the dependencies: required ones are installed, the others only noted', () => {
        const version = toVersion(
            file({
                dependencies: [
                    { modId: 1, relationType: 3 },
                    { modId: 2, relationType: 2 },
                    { modId: 3, relationType: 5 },
                    { modId: 4, relationType: 1 },
                    { modId: 5, relationType: 4 },
                ],
            })
        );
        expect(version.dependencies).toEqual([
            { project_id: 'cf:1', version_id: null, dependency_type: 'required' },
            { project_id: 'cf:2', version_id: null, dependency_type: 'optional' },
            { project_id: 'cf:3', version_id: null, dependency_type: 'incompatible' },
            { project_id: 'cf:4', version_id: null, dependency_type: 'embedded' },
        ]);
    });

    it('knows the server software a plugin is for', () => {
        expect(toVersion(file({ gameVersions: ['1.20.4', 'Paper', 'Spigot', 'Bukkit'] })).loaders).toEqual([
            'paper',
            'spigot',
            'bukkit',
        ]);
    });
});

describe('toProjectDetails', () => {
    it('collects what the page shows from the project and its files', () => {
        const details = toProjectDetails(mod(), '<p>Hello</p>', [
            { id: 6, name: 'Mods', slug: 'mc-mods', isClass: true },
        ]);
        expect(details.id).toBe('cf:77');
        expect(details.slug).toBe('77');
        expect(details.body).toBe('<p>Hello</p>');
        expect(details.project_type).toBe('mod');
        expect(details.loaders.sort()).toEqual(['fabric', 'forge']);
        expect(details.game_versions).toEqual(['1.21.1', '1.21', '1.20.1']);
        expect(details.followers).toBe(42);
        expect(details.source).toBe('curseforge');
        expect(details.website_url).toBe('https://www.curseforge.com/minecraft/mc-mods/sodium');
        expect(details.distribution_allowed).toBe(true);
        expect(details.source_url).toBe('https://github.com/x/y');
    });

    it('builds the gallery from the screenshots that have a picture', () => {
        const { gallery } = toProjectDetails(mod(), '');
        expect(gallery).toHaveLength(1);
        expect(gallery[0]).toEqual({
            url: 'https://media.forgecdn.net/s1t.png',
            raw_url: 'https://media.forgecdn.net/s1.png',
            featured: true,
            title: 'In game',
            description: 'A screenshot',
            ordering: 0,
        });
    });

    it('says when the author does not let the files be downloaded elsewhere', () => {
        expect(toProjectDetails(mod({ allowModDistribution: false }), '').distribution_allowed).toBe(false);
        expect(toProjectDetails(mod({ allowModDistribution: null }), '').distribution_allowed).toBe(true);
    });
});

describe('searching', () => {
    const categories = [
        { id: 6, name: 'Mods', slug: 'mc-mods', isClass: true },
        { id: 17, name: 'Worlds', slug: 'worlds', isClass: true },
        { id: 423, name: 'Performance', slug: 'performance', classId: 6 },
        { id: 900, name: 'Performance', slug: 'performance', classId: 17 },
    ];

    // The list of categories is asked for once for the whole page, the tests share it.
    const answer = (search: unknown) =>
        get.mockImplementation((url: string) =>
            Promise.resolve({ data: url.endsWith('/categories') ? { data: categories } : search })
        );

    it('asks for the class, the sorting, the page, the version, the loader and the category of the right class', async () => {
        answer({ data: [mod()], pagination: { totalCount: 321 } });

        const result = await searchProjects({
            kind: 'mod',
            query: ' sodium ',
            categories: ['performance'],
            loader: 'fabric',
            version: '1.21.1',
            sort: 'downloads',
            page: 3,
            pageSize: 20,
        });

        const call = get.mock.calls.find(([url]) => url.endsWith('/search'))!;
        expect(call[1].params).toEqual({
            classId: 6,
            sortField: 6,
            sortOrder: 'desc',
            index: 40,
            pageSize: 20,
            searchFilter: 'sodium',
            gameVersion: '1.21.1',
            modLoaderType: 4,
            categoryIds: '423',
        });
        expect(result.total).toBe(321);
        expect(result.hits[0].project_id).toBe('cf:77');
    });

    it('does not send a loader without a version, it filters the results itself', async () => {
        answer({
            data: [mod(), mod({ id: 78, latestFilesIndexes: [{ gameVersion: '1.20.1', fileId: 1, modLoader: 1 }] })],
            pagination: { totalCount: 2 },
        });

        const result = await searchProjects({
            kind: 'mod',
            query: '',
            categories: [],
            loader: 'fabric',
            sort: 'relevance',
            page: 1,
            pageSize: 20,
        });

        const params = get.mock.calls.find(([url]) => url.endsWith('/search'))![1].params;
        expect(params.modLoaderType).toBeUndefined();
        expect(params.gameVersion).toBeUndefined();
        expect(result.hits.map((h) => h.project_id)).toEqual(['cf:77']);
    });

    it('browses worlds in their own class, and never more than CurseForge answers', async () => {
        answer({ data: [], pagination: { totalCount: 50000 } });

        const result = await searchProjects({
            kind: 'world' as any,
            query: '',
            categories: ['performance'],
            sort: 'newest',
            page: 1,
            pageSize: 20,
        });

        const params = get.mock.calls.find(([url]) => url.endsWith('/search'))![1].params;
        expect(params.classId).toBe(17);
        expect(params.categoryIds).toBe('900');
        expect(params.sortField).toBe(11);
        expect(result.total).toBe(10000);
    });

    it('shows the message of the panel when CurseForge is not set up', async () => {
        get.mockImplementation((url: string) =>
            url.endsWith('/categories')
                ? Promise.resolve({ data: { data: categories } })
                : Promise.reject({
                      response: { data: { errors: [{ detail: 'CurseForge is not set up on this panel.' }] } },
                  })
        );

        await expect(
            searchProjects({ kind: 'mod', query: '', categories: [], sort: 'relevance', page: 1, pageSize: 20 })
        ).rejects.toThrow('CurseForge is not set up on this panel.');
    });
});

describe('versions of a project', () => {
    const files = [
        file({ id: 1, fileDate: '2026-01-01T00:00:00Z', gameVersions: ['1.20.1', 'Forge'] }),
        file({ id: 2, fileDate: '2026-03-01T00:00:00Z', gameVersions: ['1.21.1', 'Fabric'] }),
        file({ id: 3, fileDate: '2026-02-01T00:00:00Z', gameVersions: ['1.21.1', 'NeoForge'] }),
        file({ id: 4, fileDate: '2026-04-01T00:00:00Z', gameVersions: ['1.21.1'] }),
        file({ id: 5, fileDate: '2026-05-01T00:00:00Z', gameVersions: ['1.21.1', 'Fabric'], isAvailable: false }),
    ];

    it('is newest first, limited to the loader and the version, and keeps files that name no loader', async () => {
        get.mockResolvedValue({ data: { data: files, pagination: { totalCount: 5 } } });

        const versions = await getProjectVersions('cf:77', { loaders: ['fabric'], gameVersions: ['1.21.1'] });

        expect(versions.map((v) => v.id)).toEqual(['cf:4', 'cf:2']);
        expect(get.mock.calls[0][1].params).toMatchObject({ gameVersion: '1.21.1', pageSize: 50, index: 0 });
    });

    it('asks for more pages while there are more files', async () => {
        const page = (from: number) =>
            Array.from({ length: 50 }, (_, i) =>
                file({ id: from + i, fileDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` })
            );
        get.mockResolvedValueOnce({ data: { data: page(1), pagination: { totalCount: 70 } } });
        get.mockResolvedValueOnce({ data: { data: page(100).slice(0, 20), pagination: { totalCount: 70 } } });

        const versions = await getProjectVersions('cf:77');

        expect(get).toHaveBeenCalledTimes(2);
        expect(get.mock.calls[1][1].params.index).toBe(50);
        expect(versions).toHaveLength(70);
    });

    it('is empty for an id that is not CurseForge', async () => {
        expect(await getProjectVersions('AANobbMI')).toEqual([]);
        expect(get).not.toHaveBeenCalled();
    });

    it('finds one file by its id through the bulk lookup, because it needs the project too', async () => {
        post.mockResolvedValue({ data: { data: [file({ id: 9, modId: 12 })] } });

        const version = await getVersion('cf:9');

        expect(post).toHaveBeenCalledWith('/api/client/curseforge/files', { ids: [9] });
        expect(version.project_id).toBe('cf:12');
        await expect(
            (async () => {
                post.mockResolvedValue({ data: { data: [] } });

                return getVersion('cf:10');
            })()
        ).rejects.toThrow('not found');
    });
});

describe('a project', () => {
    it('is read from the project and its description', async () => {
        get.mockImplementation((url: string) => {
            if (url.endsWith('/description')) return Promise.resolve({ data: { data: '<p>Long text</p>' } });
            if (url.endsWith('/categories'))
                return Promise.resolve({ data: { data: [{ id: 6, name: 'Mods', slug: 'mc-mods', isClass: true }] } });

            return Promise.resolve({ data: { data: mod() } });
        });

        const details = await getProject('77');
        expect(details.body).toBe('<p>Long text</p>');
        expect(details.project_type).toBe('mod');
    });

    it('still opens when the description is not available', async () => {
        get.mockImplementation((url: string) => {
            if (url.endsWith('/description')) return Promise.reject(new Error('nope'));
            if (url.endsWith('/categories')) return Promise.resolve({ data: { data: [] } });

            return Promise.resolve({ data: { data: mod() } });
        });

        expect((await getProject('77')).body).toBe('');
    });

    it('is not found for a slug that is not a number', async () => {
        await expect(getProject('sodium')).rejects.toThrow('not found');
    });
});

describe('recognising files', () => {
    it('finds the project of a file by its fingerprint', async () => {
        post.mockImplementation((url: string) =>
            url.endsWith('/fingerprints')
                ? Promise.resolve({
                      data: { data: { exactMatches: [{ id: 77, file: file({ fileFingerprint: 123456 }) }] } },
                  })
                : Promise.resolve({ data: { data: [mod()] } })
        );
        get.mockResolvedValue({ data: { data: [] } });

        const found = await lookupFingerprints([123456, 999]);

        expect(found[123456].project.title).toBe('Sodium');
        expect(found[123456].project.icon_url).toBe('https://media.forgecdn.net/thumb.png');
        expect(found[123456].version.id).toBe('cf:5001');
        expect(found[999]).toBeUndefined();
    });

    it('asks nothing for nothing', async () => {
        expect(await lookupFingerprints([])).toEqual({});
        expect(post).not.toHaveBeenCalled();
    });
});

describe('directDownloadUrl', () => {
    it('goes to the server that has the file, edge.forgecdn.net only redirects to it', () => {
        expect(directDownloadUrl('https://edge.forgecdn.net/files/9029/800/createaddition-1.7.2.jar')).toBe(
            'https://mediafilez.forgecdn.net/files/9029/800/createaddition-1.7.2.jar'
        );
        expect(directDownloadUrl('https://EDGE.forgecdn.net/files/1/2/a%20b%2B.jar')).toBe(
            'https://mediafilez.forgecdn.net/files/1/2/a%20b%2B.jar'
        );
    });

    it('leaves every other address alone', () => {
        [
            'https://mediafilez.forgecdn.net/files/1/2/a.jar',
            'https://example.com/edge.forgecdn.net/a.jar',
            'https://edge.forgecdn.net.evil.test/a.jar',
        ].forEach((url) => expect(directDownloadUrl(url)).toBe(url));
    });
});
