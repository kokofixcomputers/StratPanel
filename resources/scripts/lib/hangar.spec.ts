import {
    getProject,
    getProjects,
    getProjectVersions,
    getVersion,
    HANGAR_LOADERS,
    hgId,
    hgSlug,
    hgVersionId,
    isHangarId,
    parseVersionId,
    platformOf,
    searchProjects,
    sortParam,
    toProjectDetails,
    toVersion,
} from '@/lib/hangar';
import { hasKind, sourceOfId, fallbackKind, sortsFor } from '@/lib/contentSource';

// What Hangar sends (shortened): a project, a version hosted by Hangar and one hosted on GitHub.
const project = (slug = 'ViaVersion', extra: Record<string, unknown> = {}) => ({
    id: 5,
    name: slug,
    namespace: { owner: 'ViaVersion', slug },
    stats: { views: 10, downloads: 12345, recentViews: 1, recentDownloads: 2, stars: 77, watchers: 3 },
    category: 'admin_tools',
    description: 'Let newer clients join',
    lastUpdated: '2026-05-01T10:00:00Z',
    createdAt: '2023-01-01T10:00:00Z',
    publishedAt: '2023-01-02T10:00:00Z',
    avatarUrl: 'https://hangarcdn.papermc.io/avatars/project/5.webp?v=1',
    supportedPlatforms: { PAPER: ['1.20.6', '1.21.4'], VELOCITY: ['3.4'] },
    mainPageContent: '# ViaVersion\n\nHello',
    settings: {
        links: [
            {
                type: 'top',
                links: [
                    { name: 'Source', url: 'https://github.com/ViaVersion/ViaVersion' },
                    { name: 'Issues', url: 'javascript:alert(1)' },
                    { name: 'Discord', url: 'https://discord.gg/abc' },
                ],
            },
        ],
        license: { name: 'GPL', url: 'https://example.com/license', type: 'GPL' },
    },
    ...extra,
});

const hosted = (name = '5.12.0', extra: Record<string, unknown> = {}) => ({
    id: 100,
    projectId: 5,
    name,
    description: '## Changes\n- things',
    createdAt: '2026-05-02T10:00:00Z',
    stats: { totalDownloads: 900 },
    channel: { name: 'Release' },
    downloads: {
        PAPER: {
            fileInfo: { name: `ViaVersion-${name}.jar`, sizeBytes: 6500000, sha256Hash: 'abc' },
            externalUrl: null,
            downloadUrl: `https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/${name}/PAPER/ViaVersion-${name}.jar`,
        },
        VELOCITY: {
            fileInfo: { name: `ViaVersion-${name}.jar`, sizeBytes: 6500000, sha256Hash: 'abc' },
            externalUrl: null,
            downloadUrl: `https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/${name}/PAPER/ViaVersion-${name}.jar`,
        },
    },
    platformDependencies: { PAPER: ['1.20.6', '1.21.4'], VELOCITY: ['3.4'] },
    pluginDependencies: {
        PAPER: [
            { name: 'ViaBackwards', projectId: 12, required: false, externalUrl: null },
            { name: 'Vault', projectId: null, required: true, externalUrl: 'https://spigotmc.org/x' },
        ],
    },
    ...extra,
});

const github = (name = '2.22.0') => ({
    ...hosted(name),
    channel: { name: 'Snapshot' },
    downloads: {
        PAPER: {
            fileInfo: null,
            externalUrl: 'https://github.com/EssentialsX/Essentials/releases/tag/2.22.0',
            downloadUrl: null,
        },
    },
    platformDependencies: { PAPER: ['1.21.4'] },
    pluginDependencies: {},
});

const answer = (body: unknown, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

let calls: string[] = [];
const respond = (route: (url: string) => unknown) => {
    calls = [];
    (global as any).fetch = jest.fn((url: string) => {
        calls.push(url);
        const body = route(url);

        return body === undefined ? answer({}, 404) : answer(body);
    });
};

describe('ids', () => {
    it('tells the ids of Hangar apart', () => {
        expect(isHangarId('hg:ViaVersion')).toBe(true);
        expect(isHangarId('cf:123')).toBe(false);
        expect(isHangarId('AANobbMI')).toBe(false);
        expect(hgId('ViaVersion')).toBe('hg:ViaVersion');
        expect(hgSlug('hg:ViaVersion')).toBe('ViaVersion');
        expect(sourceOfId('hg:ViaVersion')).toBe('hangar');
        expect(sourceOfId('cf:1')).toBe('curseforge');
        expect(sourceOfId('P7dR8mSH')).toBe('modrinth');
    });

    it('keeps the project and the name in the id of a version', () => {
        expect(hgVersionId('ViaVersion', '5.12.0-SNAPSHOT+1107')).toBe('hg:ViaVersion@5.12.0-SNAPSHOT+1107');
        expect(parseVersionId('hg:ViaVersion@5.12.0-SNAPSHOT+1107')).toEqual({
            project: 'ViaVersion',
            name: '5.12.0-SNAPSHOT+1107',
        });
        expect(parseVersionId('hg:ViaVersion')).toBeNull();
        expect(parseVersionId('hg:@x')).toBeNull();
        expect(parseVersionId('abc')).toBeNull();
    });
});

describe('what it is for', () => {
    it('has plugins only', () => {
        expect(hasKind('hangar', 'plugin')).toBe(true);
        for (const kind of ['mod', 'datapack', 'resourcepack', 'modpack', 'world'] as const)
            expect(hasKind('hangar', kind)).toBe(false);
        expect(fallbackKind('hangar')).toBe('plugin');
        expect(fallbackKind('curseforge')).toBe('mod');
    });

    it('maps the loaders of the panel to its platforms', () => {
        expect(platformOf('paper')).toBe('PAPER');
        expect(platformOf('purpur')).toBe('PAPER');
        expect(platformOf('spigot')).toBe('PAPER');
        expect(platformOf('velocity')).toBe('VELOCITY');
        expect(platformOf('bungeecord')).toBe('WATERFALL');
        expect(platformOf('fabric')).toBeNull();
        expect(platformOf('sponge')).toBeNull();
        expect(platformOf(undefined)).toBeNull();
        expect(HANGAR_LOADERS).toEqual(expect.arrayContaining(['paper', 'velocity', 'waterfall']));
    });

    it('has the ways to sort that it can do', () => {
        expect(sortsFor('hangar').map((s) => s.id)).toEqual(['relevance', 'downloads', 'follows', 'updated', 'newest']);
        expect(sortParam('relevance', false)).toBe('-recent_downloads');
        expect(sortParam('relevance', true)).toBeNull();
        expect(sortParam('downloads', true)).toBe('-downloads');
        expect(sortParam('follows', false)).toBe('-stars');
        expect(sortParam('updated', false)).toBe('-updated');
        expect(sortParam('newest', false)).toBe('-newest');
    });
});

describe('searching', () => {
    const options = {
        kind: 'plugin' as const,
        query: '',
        categories: [],
        sort: 'relevance' as const,
        page: 1,
        pageSize: 20,
    };

    it('asks for the first page of what is popular now', async () => {
        respond(() => ({ pagination: { count: 4041 }, result: [project()] }));
        const result = await searchProjects(options);

        expect(calls[0]).toBe('https://hangar.papermc.io/api/v1/projects?limit=20&offset=0&sort=-recent_downloads');
        expect(result.total).toBe(4041);
        expect(result.hits[0]).toMatchObject({
            project_id: 'hg:ViaVersion',
            slug: 'ViaVersion',
            title: 'ViaVersion',
            author: 'ViaVersion',
            downloads: 12345,
            follows: 77,
            categories: ['admin_tools'],
            icon_url: 'https://hangarcdn.papermc.io/avatars/project/5.webp?v=1',
        });
    });

    it('sends the words, the page, the category and the platform', async () => {
        respond(() => ({ pagination: { count: 1 }, result: [] }));
        await searchProjects({
            ...options,
            query: ' shop ',
            page: 3,
            categories: ['economy', 'chat'],
            loader: 'velocity',
            sort: 'downloads',
            version: '1.21.4',
        });
        const url = new URL(calls[0]);

        expect(url.searchParams.get('q')).toBe('shop');
        expect(url.searchParams.get('offset')).toBe('40');
        expect(url.searchParams.get('category')).toBe('economy');
        expect(url.searchParams.get('platform')).toBe('VELOCITY');
        expect(url.searchParams.get('version')).toBe('1.21.4');
        expect(url.searchParams.get('sort')).toBe('-downloads');
    });

    it('asks for Paper when a version is wanted and no loader is chosen (Hangar needs a platform for a version)', async () => {
        respond(() => ({ pagination: { count: 0 }, result: [] }));
        await searchProjects({ ...options, version: '1.21.4' });
        const url = new URL(calls[0]);

        expect(url.searchParams.get('platform')).toBe('PAPER');
        expect(url.searchParams.get('version')).toBe('1.21.4');
    });

    it('does not send a version for a loader that is not one of Hangar (it would be an error)', async () => {
        respond(() => ({ pagination: { count: 0 }, result: [] }));
        await searchProjects({ ...options, loader: 'sponge' });
        expect(new URL(calls[0]).searchParams.has('platform')).toBe(false);
    });

    it('says when Hangar cannot be reached', async () => {
        (global as any).fetch = jest.fn(() => answer({}, 500));
        await expect(searchProjects(options)).rejects.toThrow('Hangar could not be reached');
    });
});

describe('a project', () => {
    it('becomes a project the pages know', () => {
        const d = toProjectDetails(project() as any);

        expect(d).toMatchObject({
            id: 'hg:ViaVersion',
            slug: 'ViaVersion',
            title: 'ViaVersion',
            body: '# ViaVersion\n\nHello',
            project_type: 'plugin',
            downloads: 12345,
            followers: 77,
            source: 'hangar',
            server_side: 'required',
            client_side: 'unsupported',
            gallery: [],
            website_url: 'https://hangar.papermc.io/ViaVersion/ViaVersion',
            distribution_allowed: true,
            published: '2023-01-02T10:00:00Z',
            updated: '2026-05-01T10:00:00Z',
        });
        expect(d.loaders).toEqual(expect.arrayContaining(['paper', 'purpur', 'velocity']));
        expect(d.game_versions).toEqual(['1.20.6', '1.21.4', '3.4']);
        expect(d.categories).toEqual(['admin_tools']);
        expect(d.license).toEqual({ id: 'GPL', name: 'GPL', url: 'https://example.com/license' });
    });

    it('only keeps links that are web addresses', () => {
        const d = toProjectDetails(project() as any);

        expect(d.source_url).toBe('https://github.com/ViaVersion/ViaVersion');
        expect(d.issues_url).toBeNull();
        expect(d.discord_url).toBe('https://discord.gg/abc');
    });

    it('is asked for by its slug, made safe for an address', async () => {
        respond(() => project('A/B'));
        await getProject('hg:A/B');

        expect(calls[0]).toBe('https://hangar.papermc.io/api/v1/projects/A%2FB');
    });

    it('says when it is not there', async () => {
        respond(() => undefined);
        await expect(getProject('hg:Nope')).rejects.toThrow('That project was not found on Hangar.');
    });
});

describe('versions', () => {
    it('is a file to install when Hangar hosts it', () => {
        const v = toVersion('ViaVersion', hosted() as any);

        expect(v).toMatchObject({
            id: 'hg:ViaVersion@5.12.0',
            project_id: 'hg:ViaVersion',
            version_number: '5.12.0',
            version_type: 'release',
            downloads: 900,
            restricted: false,
            external_url: null,
            changelog: '## Changes\n- things',
        });
        // One file, though two platforms share it.
        expect(v.files).toEqual([
            {
                url: 'https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.12.0/PAPER/ViaVersion-5.12.0.jar',
                filename: 'ViaVersion-5.12.0.jar',
                primary: true,
                size: 6500000,
            },
        ]);
        expect(v.loaders).toEqual(expect.arrayContaining(['paper', 'velocity']));
        expect(v.game_versions).toEqual(['1.20.6', '1.21.4', '3.4']);
    });

    it('is a link when the author hosts it elsewhere', () => {
        const v = toVersion('Essentials', github() as any);

        expect(v.files).toEqual([]);
        expect(v.restricted).toBe(true);
        expect(v.external_url).toBe('https://github.com/EssentialsX/Essentials/releases/tag/2.22.0');
        expect(v.version_type).toBe('beta');
    });

    it('never links to something that is not a web address', () => {
        const v = toVersion('x', {
            ...github(),
            downloads: { PAPER: { fileInfo: null, externalUrl: 'javascript:alert(1)', downloadUrl: null } },
        } as any);

        expect(v.restricted).toBe(true);
        expect(v.external_url).toBeNull();
    });

    it('does not install from an address that is not https', () => {
        const v = toVersion(
            'x',
            hosted('1', {
                downloads: { PAPER: { fileInfo: null, externalUrl: null, downloadUrl: 'http://evil.example/x.jar' } },
            }) as any
        );

        expect(v.files).toEqual([]);
    });

    it('follows the dependencies that are on Hangar, the ones that are required or not', () => {
        const v = toVersion('ViaVersion', hosted() as any);

        expect(v.dependencies).toEqual([
            { project_id: 'hg:12', version_id: null, file_name: 'ViaBackwards', dependency_type: 'optional' },
        ]);
    });

    it('lists versions page after page, newest first, and limits them to loaders and versions', async () => {
        const page = (from: number, count: number) =>
            Array.from({ length: count }, (_, i) =>
                hosted(`1.${from + i}.0`, {
                    createdAt: `2026-01-${String(10 + from + i).padStart(2, '0')}T00:00:00Z`,
                    platformDependencies: { PAPER: [from + i > 26 ? '1.21.4' : '1.20.6'] },
                    downloads: {
                        PAPER: {
                            fileInfo: { name: 'a.jar', sizeBytes: 1, sha256Hash: '' },
                            externalUrl: null,
                            downloadUrl: 'https://hangarcdn.papermc.io/a.jar',
                        },
                    },
                })
            );
        respond((url) => {
            const offset = Number(new URL(url).searchParams.get('offset'));

            return { pagination: { count: 30 }, result: offset === 0 ? page(0, 25) : page(25, 5) };
        });

        const all = await getProjectVersions('hg:ViaVersion');
        expect(all).toHaveLength(30);
        expect(calls).toHaveLength(2);
        expect(all[0].version_number).toBe('1.29.0');

        const newer = await getProjectVersions('hg:ViaVersion', { gameVersions: ['1.21.4'], loaders: ['paper'] });
        expect(newer.every((v) => v.game_versions.includes('1.21.4'))).toBe(true);
        expect(newer.map((v) => v.version_number)).toEqual(['1.29.0', '1.28.0', '1.27.0']);

        const proxy = await getProjectVersions('hg:ViaVersion', { loaders: ['velocity'] });
        expect(proxy).toHaveLength(0);
    });

    it('is asked for by project and name', async () => {
        respond(() => hosted('5.12.0+1'));
        const v = await getVersion('hg:ViaVersion@5.12.0+1');

        expect(calls[0]).toBe('https://hangar.papermc.io/api/v1/projects/ViaVersion/versions/5.12.0%2B1');
        expect(v.id).toBe('hg:ViaVersion@5.12.0+1');
        await expect(getVersion('hg:ViaVersion')).rejects.toThrow('not found');
    });
});

describe('several projects', () => {
    it('are named, the ones that are gone are left out', async () => {
        respond((url) =>
            url.endsWith('/projects/Gone') ? undefined : project(decodeURIComponent(url.split('/projects/')[1]))
        );
        const found = await getProjects(['hg:ViaVersion', 'hg:Gone', 'hg:ViaVersion', 'cf:1', 'abc']);

        expect(found.map((f) => f.id).sort()).toEqual(['hg:ViaVersion']);
        expect(found[0]).toMatchObject({ title: 'ViaVersion', project_type: 'plugin', slug: 'ViaVersion' });
        expect(calls).toHaveLength(2);
    });
});

describe('which version is offered first', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { preferredVersion } = require('@/lib/minecraft');
    const v = (id: string, project: string, type: 'release' | 'beta' | 'alpha', files = 1) => ({
        id,
        project_id: project,
        version_number: id,
        name: id,
        game_versions: [],
        loaders: [],
        files: Array.from({ length: files }, () => ({ url: 'https://x/a.jar', filename: 'a.jar', primary: true })),
        date_published: '2026-01-01',
        version_type: type,
    });

    it('is the newest release for a plugin of Hangar, builds in the snapshot channel are chosen on purpose', () => {
        const list = [
            v('snap2', 'hg:X', 'beta'),
            v('snap1', 'hg:X', 'beta'),
            v('rel', 'hg:X', 'release'),
            v('old', 'hg:X', 'release'),
        ];
        expect(preferredVersion(list).id).toBe('rel');
    });

    it('is the newest build when Hangar has nothing but snapshots', () => {
        expect(preferredVersion([v('snap2', 'hg:X', 'beta'), v('snap1', 'hg:X', 'beta')]).id).toBe('snap2');
    });

    it('leaves versions without a file out (the ones hosted elsewhere)', () => {
        expect(preferredVersion([v('hosted-elsewhere', 'hg:X', 'release', 0), v('rel', 'hg:X', 'release')]).id).toBe(
            'rel'
        );
        expect(preferredVersion([v('hosted-elsewhere', 'hg:X', 'release', 0)])).toBeUndefined();
        expect(preferredVersion([])).toBeUndefined();
    });

    it('is the newest for the other sites, as it always was', () => {
        expect(preferredVersion([v('beta', 'AANobbMI', 'beta'), v('rel', 'AANobbMI', 'release')]).id).toBe('beta');
        expect(preferredVersion([v('beta', 'cf:1', 'beta'), v('rel', 'cf:1', 'release')]).id).toBe('beta');
    });
});
