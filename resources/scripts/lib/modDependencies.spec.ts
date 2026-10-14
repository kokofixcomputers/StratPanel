import { planDependencies } from './modDependencies';
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

const run = (main: ModrinthVersion, api: ReturnType<typeof fakeApi>, installed: string[] = []) =>
    planDependencies({ version: main, kind: 'mod', loader: 'fabric', gameVersion: '1.21.1', installed }, api as any);

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
