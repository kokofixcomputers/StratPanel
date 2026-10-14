/**
 * Mods and plugins often need other projects to run (Fabric API, a library plugin). Modrinth lists them on every
 * version, so installing something can install what it requires too.
 */
import {
    getProjects,
    getProjectVersions,
    getVersion,
    loadersFor,
    ModrinthProjectInfo,
    ModrinthVersion,
    ProjectKind,
} from '@/lib/minecraft';

export interface PlannedDependency {
    project: Pick<ModrinthProjectInfo, 'id' | 'slug' | 'title' | 'icon_url'>;
    version: ModrinthVersion;
}

export interface MissingDependency {
    projectId: string;
    title: string;
    reason: string;
}

export interface DependencyPlan {
    install: PlannedDependency[];
    missing: MissingDependency[];
}

interface Api {
    getVersion: typeof getVersion;
    getProjectVersions: typeof getProjectVersions;
    getProjects: typeof getProjects;
}

// A dependency can have dependencies of its own, but a chain this long is a sign of something odd.
const MAX_DEPTH = 5;
const MAX_TOTAL = 20;

/**
 * Works out what has to be installed along with a version: its required dependencies, and theirs in turn. Projects that
 * are already installed are left out, and a dependency without a version for this server is reported, not fatal.
 */
export const planDependencies = async (
    opts: {
        version: ModrinthVersion;
        kind: ProjectKind;
        loader?: string;
        gameVersion?: string;
        // Projects that are on the server already.
        installed: string[];
    },
    api: Api = { getVersion, getProjectVersions, getProjects }
): Promise<DependencyPlan> => {
    const seen = new Set<string>([opts.version.project_id, ...opts.installed]);
    const found: ModrinthVersion[] = [];
    const missing: { projectId: string; reason: string }[] = [];
    const loaders = loadersFor(opts.kind, opts.loader);

    const best = async (projectId: string, gameVersion: string | undefined) =>
        (
            await api.getProjectVersions(projectId, {
                loaders: loaders.length ? loaders : undefined,
                gameVersions: gameVersion ? [gameVersion] : undefined,
            })
        ).find((v) => v.files.length > 0);

    let level: ModrinthVersion[] = [opts.version];
    for (let depth = 0; depth < MAX_DEPTH && level.length && found.length < MAX_TOTAL; depth++) {
        const next: ModrinthVersion[] = [];

        for (const parent of level) {
            for (const dependency of (parent.dependencies || []).filter((d) => d.dependency_type === 'required')) {
                if (found.length >= MAX_TOTAL) break;

                try {
                    // A dependency names a project, a pinned version, or both. A pinned version tells the project too.
                    const pinned = dependency.version_id ? await api.getVersion(dependency.version_id) : null;
                    const projectId = dependency.project_id || pinned?.project_id;
                    if (!projectId || seen.has(projectId)) continue;
                    seen.add(projectId);

                    const chosen =
                        pinned && pinned.files.length
                            ? pinned
                            : (await best(projectId, opts.gameVersion)) ||
                              // Better the newest build than no dependency at all, the warning on the version still shows.
                              (opts.gameVersion ? await best(projectId, undefined) : undefined);

                    if (chosen) {
                        found.push(chosen);
                        next.push(chosen);
                    } else {
                        missing.push({ projectId, reason: 'No version of it works with this server.' });
                    }
                } catch (e) {
                    if (dependency.project_id) {
                        missing.push({
                            projectId: dependency.project_id,
                            reason: 'Modrinth could not be reached for it.',
                        });
                    }
                }
            }
        }

        level = next;
    }

    const ids = Array.from(new Set([...found.map((v) => v.project_id), ...missing.map((m) => m.projectId)]));
    const info = new Map((await api.getProjects(ids).catch(() => [])).map((p) => [p.id, p]));

    return {
        install: found.map((version) => {
            const project = info.get(version.project_id);

            return {
                version,
                project: project || {
                    id: version.project_id,
                    slug: version.project_id,
                    title: version.name,
                    icon_url: null,
                },
            };
        }),
        missing: missing.map((m) => ({ ...m, title: info.get(m.projectId)?.title || m.projectId })),
    };
};
