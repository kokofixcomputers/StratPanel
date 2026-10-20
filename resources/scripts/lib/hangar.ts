/**
 * Hangar (hangar.papermc.io) for the Content pages: the plugin repository of PaperMC. It has plugins for Paper (and what runs
 * on it), Velocity and Waterfall, nothing else, and needs no key: the browser asks its API directly, like it asks Modrinth.
 *
 * What Hangar sends is turned into the shapes the pages already use for Modrinth (SearchHit, ProjectDetails, ModrinthVersion...),
 * so listing, the page of a project, installing, dependencies and updates work the same. Ids from Hangar start with "hg:"
 * ("hg:ViaVersion" is the project ViaVersion), so they can never be mistaken for another site's id in the address, in the records of
 * installed projects and in the dependency planner. The id of a version is the project and the name of the version: "hg:ViaVersion@5.1.0".
 */
import type { ModrinthDependency, ModrinthProjectInfo, ModrinthVersion } from '@/lib/minecraft';
import type {
    CategoryTag,
    LoaderTag,
    Member,
    ProjectDetails,
    SearchHit,
    SearchOptions,
    SortIndex,
} from '@/lib/modrinth';

const API = 'https://hangar.papermc.io/api/v1';
const SITE = 'https://hangar.papermc.io';

export const HG_PREFIX = 'hg:';

export const isHangarId = (id: string | null | undefined): boolean => !!id && id.startsWith(HG_PREFIX);

/** The slug (or number) of a project from its id. */
export const hgSlug = (id: string): string => (isHangarId(id) ? id.slice(HG_PREFIX.length) : id);

export const hgId = (slug: string | number): string => `${HG_PREFIX}${slug}`;

/** The id of a version: the project and the name of the version. */
export const hgVersionId = (slug: string, name: string): string => `${HG_PREFIX}${slug}@${name}`;

export const parseVersionId = (id: string): { project: string; name: string } | null => {
    if (!isHangarId(id)) return null;
    const rest = id.slice(HG_PREFIX.length);
    const at = rest.indexOf('@');

    return at > 0 && at < rest.length - 1 ? { project: rest.slice(0, at), name: rest.slice(at + 1) } : null;
};

const failure = () => new Error('Hangar could not be reached, please try again in a moment.');

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const response = await fetch(`${API}${path}`, { signal });
    if (response.status === 404) throw new Error('That project was not found on Hangar.');
    if (!response.ok) throw failure();

    return response.json();
};

// ---- platforms ---------------------------------------------------------------------------------------------------------

export type Platform = 'PAPER' | 'VELOCITY' | 'WATERFALL';

/**
 * What a platform of Hangar is for the loaders of this panel. A plugin for Paper is offered to the servers that are Paper or built on
 * it, and to Spigot and Bukkit ones too (most run there as well, a few use what only Paper has).
 */
const LOADERS_OF_PLATFORM: Record<Platform, string[]> = {
    PAPER: ['paper', 'purpur', 'folia', 'spigot', 'bukkit'],
    VELOCITY: ['velocity'],
    WATERFALL: ['waterfall', 'bungeecord'],
};

export const HANGAR_LOADERS = Object.values(LOADERS_OF_PLATFORM).flat();

/** The platform to ask Hangar for, for a loader: none for the loader of a different kind of server (Sponge, Fabric). */
export const platformOf = (loader: string | undefined): Platform | null => {
    if (!loader) return null;
    const found = (Object.keys(LOADERS_OF_PLATFORM) as Platform[]).find((p) => LOADERS_OF_PLATFORM[p].includes(loader));

    return found ?? null;
};

const toLoaders = (platforms: string[]): string[] =>
    Array.from(new Set(platforms.flatMap((p) => LOADERS_OF_PLATFORM[p as Platform] || [])));

// ---- search ------------------------------------------------------------------------------------------------------------

/** What Hangar can sort by, as the pages name it. Without a search, what is being downloaded now is the best place to start. */
export const HG_SORTS: { id: SortIndex; label: string }[] = [
    { id: 'relevance', label: 'Popular now' },
    { id: 'downloads', label: 'Downloads' },
    { id: 'follows', label: 'Stars' },
    { id: 'updated', label: 'Recently updated' },
    { id: 'newest', label: 'Newest' },
];

export const sortParam = (sort: SortIndex, hasQuery: boolean): string | null => {
    switch (sort) {
        case 'downloads':
            return '-downloads';
        case 'follows':
        case 'rating':
            return '-stars';
        case 'updated':
            return '-updated';
        case 'newest':
            return '-newest';
        default:
            // With words to look for Hangar's own order is the best match.
            return hasQuery ? null : '-recent_downloads';
    }
};

export interface HgProject {
    id: number;
    name: string;
    namespace: { owner: string; slug: string };
    stats: { views: number; downloads: number; stars: number; watchers: number };
    category: string;
    description: string;
    lastUpdated: string;
    createdAt: string;
    publishedAt?: string;
    avatarUrl: string | null;
    supportedPlatforms?: Record<string, string[]>;
    mainPageContent?: string | null;
    memberNames?: string[];
    settings?: {
        links?: { type: string; links: { name: string; url: string }[] }[];
        license?: { name?: string | null; url?: string | null; type?: string | null };
        keywords?: string[];
    };
}

export const CATEGORIES: { name: string; label: string }[] = [
    { name: 'admin_tools', label: 'Admin tools' },
    { name: 'chat', label: 'Chat' },
    { name: 'dev_tools', label: 'Developer tools' },
    { name: 'economy', label: 'Economy' },
    { name: 'gameplay', label: 'Gameplay' },
    { name: 'games', label: 'Games' },
    { name: 'protection', label: 'Protection' },
    { name: 'role_playing', label: 'Role playing' },
    { name: 'world_management', label: 'World management' },
    { name: 'misc', label: 'Miscellaneous' },
];

export const categoryLabel = (name: string): string =>
    CATEGORIES.find((c) => c.name === name)?.label ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const getCategoryTags = async (): Promise<CategoryTag[]> =>
    CATEGORIES.map((c) => ({ name: c.name, project_type: 'plugin', header: 'categories', icon: '', label: c.label }));

export const toSearchHit = (p: HgProject): SearchHit => ({
    project_id: hgId(p.namespace.slug),
    slug: p.namespace.slug,
    title: p.name,
    description: p.description || '',
    author: p.namespace.owner,
    downloads: p.stats?.downloads ?? 0,
    icon_url: p.avatarUrl || null,
    categories: [p.category],
    follows: p.stats?.stars ?? 0,
    date_modified: p.lastUpdated,
});

export const searchProjects = async (
    opts: SearchOptions,
    signal?: AbortSignal
): Promise<{ hits: SearchHit[]; total: number }> => {
    const params = new URLSearchParams({
        limit: String(Math.min(opts.pageSize, 50)),
        offset: String(Math.max(0, opts.page - 1) * opts.pageSize),
    });
    const query = opts.query.trim();
    if (query) params.set('q', query);
    const sort = sortParam(opts.sort, !!query);
    if (sort) params.set('sort', sort);
    // A Minecraft version can only be asked for together with a platform, Paper is what almost every plugin is for.
    const platform = platformOf(opts.loader) ?? (opts.version ? 'PAPER' : null);
    if (platform) params.set('platform', platform);
    if (platform && opts.version) params.set('version', opts.version);
    // Hangar knows one category at a time.
    if (opts.categories[0]) params.set('category', opts.categories[0]);

    const body = await get<{ result: HgProject[]; pagination: { count: number } }>(`/projects?${params}`, signal);

    return { hits: body.result.map(toSearchHit), total: body.pagination.count };
};

// ---- one project -------------------------------------------------------------------------------------------------------

const linkOf = (project: HgProject, ...names: string[]): string | null => {
    for (const group of project.settings?.links || []) {
        const found = group.links.find((l) => names.includes(l.name.toLowerCase()));
        if (found) return found.url;
    }

    return null;
};

/** The addresses to open: only web addresses, never what a plugin page makes of "javascript:". */
const web = (url: string | null): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

export const toProjectDetails = (p: HgProject): ProjectDetails => {
    const platforms = Object.keys(p.supportedPlatforms || {});
    const versions = Array.from(new Set(Object.values(p.supportedPlatforms || {}).flat()));
    const license = p.settings?.license;

    return {
        id: hgId(p.namespace.slug),
        slug: p.namespace.slug,
        title: p.name,
        description: p.description || '',
        body: p.mainPageContent || '',
        project_type: 'plugin',
        // The loaders are in `loaders`; as tags only what the plugin is about.
        categories: [p.category],
        additional_categories: [],
        loaders: toLoaders(platforms),
        game_versions: versions,
        downloads: p.stats?.downloads ?? 0,
        followers: p.stats?.stars ?? 0,
        icon_url: p.avatarUrl || null,
        client_side: 'unsupported',
        server_side: 'required',
        gallery: [],
        source_url: web(linkOf(p, 'source', 'github', 'source code')),
        issues_url: web(linkOf(p, 'issues', 'issue tracker', 'bugs')),
        wiki_url: web(linkOf(p, 'wiki', 'documentation', 'docs')),
        discord_url: web(linkOf(p, 'discord', 'support', 'community')),
        license: license?.name
            ? { id: license.type || license.name, name: license.name, url: web(license.url ?? null) }
            : null,
        published: p.publishedAt || p.createdAt,
        updated: p.lastUpdated,
        team: '',
        source: 'hangar',
        website_url: `${SITE}/${encodeURIComponent(p.namespace.owner)}/${encodeURIComponent(p.namespace.slug)}`,
        distribution_allowed: true,
    };
};

export const getProject = async (slug: string): Promise<ProjectDetails> =>
    toProjectDetails(await get<HgProject>(`/projects/${encodeURIComponent(hgSlug(slug))}`));

export const getMembers = async (slug: string): Promise<Member[]> => {
    const body = await get<{ result: { user: string; title: string }[] }>(
        `/projects/${encodeURIComponent(hgSlug(slug))}/members`
    );

    return (body.result || []).map((m) => ({
        role: m.title || 'Member',
        user: { username: m.user, avatar_url: null },
    }));
};

// ---- versions ----------------------------------------------------------------------------------------------------------

export interface HgDownload {
    fileInfo: { name: string; sizeBytes: number; sha256Hash: string } | null;
    externalUrl: string | null;
    downloadUrl: string | null;
}

export interface HgVersion {
    id: number;
    projectId: number;
    name: string;
    description: string | null;
    createdAt: string;
    stats: { totalDownloads: number };
    channel: { name: string };
    downloads: Record<string, HgDownload>;
    platformDependencies: Record<string, string[]>;
    pluginDependencies: Record<string, { name: string; projectId: number | null; required: boolean }[]>;
}

const TYPES: Record<string, 'release' | 'beta' | 'alpha'> = {
    release: 'release',
    beta: 'beta',
    snapshot: 'beta',
    alpha: 'alpha',
};

/**
 * A version of Hangar as a version of Modrinth. A file Hangar keeps itself has an address to download from; one the author hosts
 * elsewhere (GitHub, usually) has only a page, which is kept as `external_url` instead of being installed from here.
 */
export const toVersion = (slug: string, v: HgVersion): ModrinthVersion => {
    const platforms = Object.keys(v.downloads || {});
    const files: ModrinthVersion['files'] = [];
    let external: string | null = null;
    const seen = new Set<string>();
    platforms.forEach((platform) => {
        const d = v.downloads[platform];
        if (d.downloadUrl && /^https:\/\//.test(d.downloadUrl) && !seen.has(d.downloadUrl)) {
            seen.add(d.downloadUrl);
            files.push({
                url: d.downloadUrl,
                filename: d.fileInfo?.name || decodeURIComponent(d.downloadUrl.split('/').pop() || `${slug}.jar`),
                primary: files.length === 0,
                size: d.fileInfo?.sizeBytes,
            });
        } else if (d.externalUrl && !external) {
            external = d.externalUrl;
        }
    });

    const dependencies: ModrinthDependency[] = [];
    Object.values(v.pluginDependencies || {})
        .flat()
        .forEach((d) => {
            // Only the ones that are on Hangar can be followed, the rest are named in the changelog if at all.
            if (!d.projectId || dependencies.some((x) => x.project_id === hgId(d.projectId!))) return;
            dependencies.push({
                project_id: hgId(d.projectId),
                version_id: null,
                file_name: d.name,
                dependency_type: d.required ? 'required' : 'optional',
            });
        });

    return {
        id: hgVersionId(slug, v.name),
        project_id: hgId(slug),
        version_number: v.name,
        name: v.name,
        game_versions: Array.from(new Set(Object.values(v.platformDependencies || {}).flat())),
        loaders: toLoaders(platforms),
        files,
        date_published: v.createdAt,
        version_type: TYPES[(v.channel?.name || '').toLowerCase()] || 'release',
        changelog: v.description,
        downloads: v.stats?.totalDownloads,
        dependencies,
        restricted: files.length === 0,
        external_url: files.length === 0 ? web(external) : null,
    };
};

const PAGE = 25;
const MAX_PAGES = 6;

/**
 * The versions of a project, newest first, limited the way Modrinth's are: loaders and Minecraft versions (a version that names none is
 * for everything).
 */
export const getProjectVersions = async (
    projectId: string,
    opts: { loaders?: string[]; gameVersions?: string[] } = {}
): Promise<ModrinthVersion[]> => {
    const slug = hgSlug(projectId);
    const found: HgVersion[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const body = await get<{ result: HgVersion[]; pagination: { count: number } }>(
            `/projects/${encodeURIComponent(slug)}/versions?limit=${PAGE}&offset=${page * PAGE}`
        );
        found.push(...(body.result || []));
        if ((body.result || []).length < PAGE || found.length >= body.pagination.count) break;
    }

    const wanted = opts.loaders || [];

    return found
        .map((v) => toVersion(slug, v))
        .filter((version) => {
            if (opts.gameVersions?.length && !version.game_versions.some((g) => opts.gameVersions!.includes(g)))
                return false;
            if (wanted.length && version.loaders.length && !version.loaders.some((l) => wanted.includes(l)))
                return false;

            return true;
        })
        .sort((a, b) => b.date_published.localeCompare(a.date_published));
};

/** One version by its id. */
export const getVersion = async (versionId: string): Promise<ModrinthVersion> => {
    const parts = parseVersionId(versionId);
    if (!parts) throw new Error('That version was not found on Hangar.');
    const v = await get<HgVersion>(
        `/projects/${encodeURIComponent(parts.project)}/versions/${encodeURIComponent(parts.name)}`
    );

    return toVersion(parts.project, v);
};

/** The name, picture and kind of several projects, which is what the dependency lists and the installed lists show. */
export const getProjects = async (ids: string[]): Promise<ModrinthProjectInfo[]> => {
    const unique = Array.from(new Set(ids.filter(isHangarId)));
    const found: ModrinthProjectInfo[] = [];
    // A few at a time: Hangar has no call for several projects.
    for (let i = 0; i < unique.length; i += 5) {
        await Promise.all(
            unique.slice(i, i + 5).map(async (id) => {
                try {
                    const p = await get<HgProject>(`/projects/${encodeURIComponent(hgSlug(id))}`);
                    found.push({
                        id,
                        slug: p.namespace.slug,
                        title: p.name,
                        icon_url: p.avatarUrl || null,
                        project_type: 'plugin',
                    });
                } catch (e) {
                    // A project that is gone is just not named.
                }
            })
        );
    }

    return found;
};

export type { LoaderTag };
