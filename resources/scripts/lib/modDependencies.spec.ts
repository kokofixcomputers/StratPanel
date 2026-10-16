import { fileIsProject, isPresent, planDependencies, Presence } from './modDependencies';
import { ModrinthVersion } from './minecraft';

const version = (id: string, project: string, dependencies: ModrinthVersion['dependencies'] = []): ModrinthVersion => ({
    id,
    project_id: project,
    version_number: '1.0',
    name: `${project} ${id}`,
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    files: [{ url: `https://cdn/${id}.jar`, filename: `${id}.jar`, primary: true }],
    date_published: '2026-01-01',
    dependencies,
});

const required = (project: string, versionId: string | null = null) => ({
    project_id: project,
    version_id: versionId,
    dependency_type: 'required' as const,
});

const fakeApi = (projects: Record<string, ModrinthVersion[]>, versions: Record<string, ModrinthVersion> = {}) => ({
    getVersion: jest.fn(async (id: string) => versions[id]),
    getProjectVersions: jest.fn(async (id: string, opts: any = {}) =>
        (projects[id] || []).filter((v) => !opts.gameVersions || v.game_versions.includes(opts.gameVersions[0]))
    ),
    getProjects: jest.fn(async (ids: string[]) =>
        ids.map((id) => ({ id, slug: id, title: `Title ${id}`, icon_url: null, project_type: 'mod' }))
    ),
});

const run = (main: ModrinthVersion, api: ReturnType<typeof fakeApi>, installed: string[] = [], present?: Presence) =>
    planDependencies(
        { version: main, kind: 'mod', loader: 'fabric', gameVersion: '1.21.1', installed, present },
        api as any
    );

describe('planDependencies', () => {
    it('installs required dependencies and the ones they need', async () => {
        const api = fakeApi({
            A: [version('a1', 'A', [required('B')])],
            B: [version('b1', 'B', [required('C')])],
            C: [version('c1', 'C')],
        });
        const plan = await run(version('m1', 'M', [required('A')]), api);

        expect(plan.install.map((d) => d.project.id)).toEqual(['A', 'B', 'C']);
        expect(plan.install[0].project.title).toBe('Title A');
        expect(plan.missing).toEqual([]);
    });

    it('ignores optional, embedded and incompatible ones', async () => {
        const api = fakeApi({ A: [version('a1', 'A')] });
        const plan = await run(
            version('m1', 'M', [
                { project_id: 'A', version_id: null, dependency_type: 'optional' },
                { project_id: 'A', version_id: null, dependency_type: 'embedded' },
                { project_id: 'A', version_id: null, dependency_type: 'incompatible' },
            ]),
            api
        );

        expect(plan.install).toEqual([]);
    });

    it('skips what is installed already and never loops', async () => {
        const api = fakeApi({ A: [version('a1', 'A', [required('M')])], B: [version('b1', 'B')] });
        const plan = await run(version('m1', 'M', [required('A'), required('B')]), api, ['B']);

        expect(plan.install.map((d) => d.project.id)).toEqual(['A']);
    });

    it('uses a pinned version, which also names the project', async () => {
        const pinned = version('pinned', 'P');
        const api = fakeApi({}, { pinned });
        const plan = await run(
            version('m1', 'M', [{ project_id: null, version_id: 'pinned', dependency_type: 'required' }]),
            api
        );

        expect(plan.install.map((d) => d.version.id)).toEqual(['pinned']);
    });

    it('falls back to the newest build when none fits the server, and reports a dependency without any', async () => {
        const other = version('x1', 'X');
        other.game_versions = ['1.19.4'];
        const api = fakeApi({ X: [other] });
        const plan = await run(version('m1', 'M', [required('X'), required('GONE')]), api);

        expect(plan.install.map((d) => d.version.id)).toEqual(['x1']);
        expect(plan.missing).toEqual([
            { projectId: 'GONE', title: 'Title GONE', reason: 'No version of it works with this server.' },
        ]);
    });
});

describe('what is on the server already', () => {
    // A project as the other site knows it: the same mod, another id.
    const api = () => {
        const fake = fakeApi({
            A: [version('a1', 'A', [required('B')])],
            B: [version('b1', 'B')],
            C: [version('c1', 'C')],
        });
        fake.getProjects.mockImplementation(async (ids: string[]) =>
            ids.map((id) => ({
                id,
                slug: id === 'A' ? 'fabric-api' : id === 'C' ? '4242' : id.toLowerCase(),
                title: id === 'A' ? 'Fabric API' : id === 'C' ? 'Just Enough Items (JEI)' : `Title ${id}`,
                icon_url: null,
                project_type: 'mod',
            }))
        );

        return fake;
    };

    it('does not install again what is installed from the other site under another id', async () => {
        const fake = api();
        const plan = await run(version('m1', 'M', [required('A')]), fake, [], {
            projects: [{ projectId: 'cf:306612', title: 'Fabric API', slug: '306612' }],
            files: [],
        });

        expect(plan.install).toEqual([]);
        expect(plan.present).toEqual(['Fabric API']);
        // What it needs in turn is not looked at either, it came with it.
        expect(fake.getProjectVersions).not.toHaveBeenCalled();
    });

    it('does not install what is there as a jar nobody installed from here', async () => {
        const plan = await run(version('m1', 'M', [required('A'), required('C')]), api(), [], {
            projects: [],
            files: ['fabric-api-0.116.17+1.21.1.jar', 'jei-1.21.1-fabric-19.21.0.247.jar', 'readme.txt'],
        });

        expect(plan.install).toEqual([]);
        expect(plan.present).toEqual(['Fabric API', 'Just Enough Items (JEI)']);
    });

    it('still installs the rest', async () => {
        const plan = await run(version('m1', 'M', [required('A'), required('B')]), api(), [], {
            projects: [{ projectId: 'x', title: 'fabric api', slug: 'x' }],
            files: [],
        });

        expect(plan.install.map((d) => d.project.id)).toEqual(['B']);
        expect(plan.present).toEqual(['Fabric API']);
    });

    it('does not take another mod for it because the name starts the same', async () => {
        const plan = await run(version('m1', 'M', [required('A')]), api(), [], {
            projects: [],
            files: ['fabric-api-extras-1.0.jar', 'fabricapiextras.jar'],
        });

        expect(plan.install.map((d) => d.project.id)).toEqual(['A', 'B']);
        expect(plan.present).toEqual([]);
    });

    it('works as before when nothing is known about the server', async () => {
        const plan = await run(version('m1', 'M', [required('A')]), api());

        expect(plan.install.map((d) => d.project.id)).toEqual(['A', 'B']);
        expect(plan.present).toEqual([]);
    });

    it('carries on when the name of a dependency cannot be looked up', async () => {
        const fake = api();
        fake.getProjects.mockRejectedValue(new Error('offline'));
        const plan = await run(version('m1', 'M', [required('A')]), fake, [], { projects: [], files: [] });

        expect(plan.install.map((d) => d.project.id)).toEqual(['A', 'B']);
    });
});

describe('fileIsProject', () => {
    const fabricApi = { title: 'Fabric API', slug: 'fabric-api' };

    it.each([
        'fabric-api-0.116.17+1.21.1.jar',
        'Fabric-API-0.116.jar',
        'fabric_api_1.0.jar',
        'fabric-api.jar',
        'fabricapi-1.2.jar',
    ])('knows %s', (file) => expect(fileIsProject(file, fabricApi)).toBe(true));

    it.each(['fabric-api-extras-1.0.jar', 'fabric-apiary-1.jar', 'not-fabric-api-1.jar', 'sodium-fabric-0.5.jar'])(
        'does not take %s for it',
        (file) => expect(fileIsProject(file, fabricApi)).toBe(false)
    );

    it('knows a name in brackets, and a loader or the game after the name', () => {
        const jei = { title: 'Just Enough Items (JEI)', slug: '238222' };
        expect(fileIsProject('jei-1.21.1-neoforge-19.21.jar', jei)).toBe(true);
        expect(fileIsProject('JustEnoughItems-1.20.1-forge-15.jar', jei)).toBe(true);
        expect(fileIsProject('jei-extras-1.jar', jei)).toBe(false);
        expect(fileIsProject('create-1.21.1-6.0.4.jar', { title: 'Create', slug: 'create' })).toBe(true);
        expect(fileIsProject('createaddition-1.0.jar', { title: 'Create', slug: 'create' })).toBe(false);
    });

    it('ignores names that are too short to mean anything', () => {
        expect(fileIsProject('ab-1.0.jar', { title: 'AB', slug: 'ab' })).toBe(false);
    });
});

describe('isPresent', () => {
    it('is the same id, the same title, or the same slug, in any capitalisation', () => {
        const presence: Presence = {
            projects: [{ projectId: 'P1', title: 'Sodium Extra', slug: 'sodium-extra' }],
            files: [],
        };
        expect(isPresent({ id: 'P1', title: 'x', slug: 'x' }, presence)).toBe(true);
        expect(isPresent({ id: 'cf:9', title: 'SODIUM extra', slug: '9' }, presence)).toBe(true);
        expect(isPresent({ id: 'Q', title: 'Other', slug: 'sodium-extra' }, presence)).toBe(true);
        expect(isPresent({ id: 'Q', title: 'Sodium', slug: 'sodium' }, presence)).toBe(false);
        expect(isPresent({ id: 'Q', title: 'Sodium', slug: 'sodium' }, undefined)).toBe(false);
    });

    it('does not mix up projects because their slugs are both numbers', () => {
        const presence: Presence = { projects: [{ projectId: 'cf:1', title: 'One', slug: '1' }], files: [] };
        expect(isPresent({ id: 'cf:2', title: 'Two', slug: '1' }, presence)).toBe(false);
    });
});
