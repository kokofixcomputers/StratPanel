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
    // What it needs that is on the server already, by name, so the dialog can say so.
    present: string[];
}

/** What is on the server: the projects the panel knows about, and the names of jars it does not (put there by hand). */
export interface Presence {
    projects: { projectId: string; title: string; slug: string }[];
    files: string[];
}

const alnum = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

// What a jar may say after the name of the project and still be that project: the loader, the game, a version number.
const AFTER_NAME =
    /^(?:(?:v|mc|build)?\d|fabric|forge|neoforge|quilt|minecraft|bukkit|paper|spigot|purpur|folia|universal|all)/;

/** The names a project can be called in a file name: its title, the title without a note in brackets, the note itself, its slug. */
const namesOf = (project: { title: string; slug: string }): string[] => {
    const names = new Set<string>();
    const bracket = /\(([^)]+)\)/.exec(project.title);
    names.add(project.title.replace(/\([^)]*\)/g, ''));
    if (bracket) names.add(bracket[1]);
    // The slug of a project of CurseForge is a number, which says nothing.
    if (!/^\d+$/.test(project.slug)) names.add(project.slug);

    return Array.from(names)
        .map((name) => name.trim())
        .filter((name) => alnum(name).length >= 3);
};

/**
 * Whether a jar is that project. The file has to begin with the name and then only say a version, a loader or the game:
 * "fabric-api-0.116.jar" is Fabric API, "fabric-api-extras.jar" is another mod.
 */
export const fileIsProject = (file: string, project: { title: string; slug: string }): boolean => {
    const name = file.toLowerCase().replace(/\.jar$/, '');

    return namesOf(project).some((candidate) => {
        const words = candidate
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);
        const match = new RegExp(`^${words.join('[-_. +]*')}`).exec(name);
        if (!match) return false;

        const rest = name
            .slice(match[0].length)
            .split(/[^a-z0-9]+/)
            .filter(Boolean)[0];

        return !rest || AFTER_NAME.test(rest);
    });
};

/**
 * Whether a project is on the server already. The same mod can be on Modrinth and on CurseForge with different ids, so a
 * name that is the same counts too, and so does a jar that is called after it.
 */
export const isPresent = (project: { id: string; title: string; slug: string }, presence?: Presence): boolean => {
    if (!presence) return false;

    const title = alnum(project.title);

    return (
        presence.projects.some(
            (known) =>
                known.projectId === project.id ||
                (title.length >= 3 && alnum(known.title) === title) ||
                (!/^\d+$/.test(project.slug) && project.slug !== '' && known.slug === project.slug)
        ) || presence.files.some((file) => fileIsProject(file, project))
    );
};

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
        // The same by name, and the jars that were put there by hand. Optional, the ids are the safe part.
        present?: Presence;
    },
    api: Api = { getVersion, getProjectVersions, getProjects }
): Promise<DependencyPlan> => {
    const seen = new Set<string>([opts.version.project_id, ...opts.installed]);
    const found: ModrinthVersion[] = [];
    const missing: { projectId: string; reason: string }[] = [];
    const present: string[] = [];
    const infos = new Map<string, ModrinthProjectInfo>();
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

                    // Is it there already, perhaps under another site's id or as a file nobody installed from here? Then it
                    // is left alone, and so is what it needs: that was installed with it, or is not ours to decide.
                    if (opts.present) {
                        const [info] = await api.getProjects([projectId]).catch(() => []);
                        if (info) infos.set(projectId, info);
                        if (info && isPresent(info, opts.present)) {
                            present.push(info.title);
                            continue;
                        }
                    }

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

    const ids = Array.from(new Set([...found.map((v) => v.project_id), ...missing.map((m) => m.projectId)])).filter(
        (id) => !infos.has(id)
    );
    const info = new Map<string, ModrinthProjectInfo>(infos);
    (ids.length ? await api.getProjects(ids).catch(() => []) : []).forEach((p) => info.set(p.id, p));

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
        present,
    };
};
