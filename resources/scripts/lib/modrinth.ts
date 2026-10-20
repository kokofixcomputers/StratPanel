/**
 * What the Content pages need from Modrinth on top of lib/minecraft.ts: searching with filters, sorting and pages, the
 * full page of a project, and the lists of tags (categories, loaders, game versions) the filters are made from.
 */
import { MOD_LOADERS, ModrinthProject, PLUGIN_LOADERS, ProjectKind } from '@/lib/minecraft';

const API = 'https://api.modrinth.com/v2';

const failure = () => new Error('Modrinth could not be reached, please try again in a moment.');

const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${API}${path}`);
    if (response.status === 404) throw new Error('That project was not found on Modrinth.');
    if (!response.ok) throw failure();

    return response.json();
};

// ---- search ----------------------------------------------------------------------------------------------------------

export type SortIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated' | 'rating';

export const SORTS: { id: SortIndex; label: string }[] = [
    { id: 'relevance', label: 'Relevance' },
    { id: 'downloads', label: 'Downloads' },
    { id: 'follows', label: 'Follows' },
    { id: 'updated', label: 'Recently updated' },
    { id: 'newest', label: 'Newest' },
];

export interface SearchHit extends ModrinthProject {
    follows: number;
    // eslint-disable-next-line camelcase
    display_categories?: string[];
    // eslint-disable-next-line camelcase
    client_side?: string;
    // eslint-disable-next-line camelcase
    server_side?: string;
    // eslint-disable-next-line camelcase
    date_modified?: string;
    // eslint-disable-next-line camelcase
    featured_gallery?: string | null;
}

export interface SearchOptions {
    kind: ProjectKind;
    query: string;
    categories: string[];
    loader?: string;
    version?: string;
    // Leave out what only works on a player's computer.
    serverSide?: boolean;
    sort: SortIndex;
    page: number;
    pageSize: number;
}

export const searchProjects = async (
    opts: SearchOptions,
    signal?: AbortSignal
): Promise<{ hits: SearchHit[]; total: number }> => {
    const facets: string[][] = [[`project_type:${opts.kind}`]];
    if (opts.kind === 'plugin') {
        facets.push((opts.loader ? [opts.loader] : PLUGIN_LOADERS).map((l) => `categories:${l}`));
    } else if (opts.loader && opts.kind !== 'datapack' && opts.kind !== 'resourcepack') {
        facets.push([`categories:${opts.loader}`]);
    }
    opts.categories.forEach((category) => facets.push([`categories:${category}`]));
    if (opts.version) facets.push([`versions:${opts.version}`]);
    if (opts.serverSide) facets.push(['server_side:required', 'server_side:optional']);

    const params = new URLSearchParams({
        query: opts.query,
        limit: String(opts.pageSize),
        offset: String(Math.max(0, opts.page - 1) * opts.pageSize),
        index: opts.sort,
        facets: JSON.stringify(facets),
    });

    const response = await fetch(`${API}/search?${params.toString()}`, { signal });
    if (!response.ok) throw failure();
    const body = await response.json();

    return { hits: body.hits, total: body.total_hits };
};

// ---- one project -----------------------------------------------------------------------------------------------------

export interface GalleryImage {
    url: string;
    // eslint-disable-next-line camelcase
    raw_url?: string;
    featured: boolean;
    title: string | null;
    description: string | null;
    ordering: number;
}

export interface ProjectDetails {
    id: string;
    slug: string;
    title: string;
    description: string;
    // The long description, Markdown that may contain HTML.
    body: string;
    // eslint-disable-next-line camelcase
    project_type: string;
    categories: string[];
    // eslint-disable-next-line camelcase
    additional_categories: string[];
    loaders: string[];
    // eslint-disable-next-line camelcase
    game_versions: string[];
    downloads: number;
    followers: number;
    // eslint-disable-next-line camelcase
    icon_url: string | null;
    // eslint-disable-next-line camelcase
    client_side: string;
    // eslint-disable-next-line camelcase
    server_side: string;
    gallery: GalleryImage[];
    // eslint-disable-next-line camelcase
    source_url: string | null;
    // eslint-disable-next-line camelcase
    issues_url: string | null;
    // eslint-disable-next-line camelcase
    wiki_url: string | null;
    // eslint-disable-next-line camelcase
    discord_url: string | null;
    license: { id: string; name: string; url: string | null } | null;
    published: string;
    updated: string;
    team: string;
    // Set for a project that comes from CurseForge or Hangar instead of Modrinth.
    source?: 'curseforge' | 'hangar';
    // Its page on the site, and whether the author lets its files be downloaded from somewhere else.
    website_url?: string | null;
    distribution_allowed?: boolean;
}

export const getProject = (idOrSlug: string) => get<ProjectDetails>(`/project/${encodeURIComponent(idOrSlug)}`);

export interface Member {
    role: string;
    user: { username: string; avatar_url: string | null };
}

export const getMembers = (idOrSlug: string) => get<Member[]>(`/project/${encodeURIComponent(idOrSlug)}/members`);

/** The search result shape of a project, which is what the install dialogs work with. */
export const toProject = (project: ProjectDetails, author: string): ModrinthProject => ({
    project_id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    author,
    downloads: project.downloads,
    icon_url: project.icon_url,
    categories: project.categories,
});

// ---- tags ------------------------------------------------------------------------------------------------------------

export interface CategoryTag {
    name: string;
    // eslint-disable-next-line camelcase
    project_type: string;
    header: string;
    // Inline SVG markup, or the address of a picture (CurseForge's tags have one).
    icon: string;
    // The name to show when it is not the one made from the tag, CurseForge's slugs are not what people read.
    label?: string;
}

export interface LoaderTag {
    name: string;
    icon: string;
    // eslint-disable-next-line camelcase
    supported_project_types: string[];
}

export interface GameVersionTag {
    version: string;
    // eslint-disable-next-line camelcase
    version_type: 'release' | 'snapshot' | 'alpha' | 'beta';
    date: string;
    major: boolean;
}

// These lists change a few times a year, so they are asked for once per page load.
const once = <T>(load: () => Promise<T>): (() => Promise<T>) => {
    let promise: Promise<T> | null = null;

    return () => {
        if (!promise)
            promise = load().catch((e) => {
                promise = null;
                throw e;
            });

        return promise;
    };
};

export const getCategoryTags = once(() => get<CategoryTag[]>('/tag/category'));
export const getLoaderTags = once(() => get<LoaderTag[]>('/tag/loader'));
export const getGameVersionTags = once(() => get<GameVersionTag[]>('/tag/game_version'));

// What can be chosen as a loader or a platform. Modrinth knows many more (Rift, Geyser, Java agents...), none of them
// something a server of this panel runs. Proxies and Sponge are platforms of plugins.
const PLUGIN_PLATFORMS = [
    'paper',
    'spigot',
    'bukkit',
    'purpur',
    'folia',
    'sponge',
    'velocity',
    'bungeecord',
    'waterfall',
];

/** The loaders a filter can offer for a kind of project, in the order a server owner expects them. */
export const loadersOf = (tags: LoaderTag[], kind: ProjectKind): LoaderTag[] =>
    (kind === 'plugin' ? PLUGIN_PLATFORMS : MOD_LOADERS)
        .map((name) => tags.find((tag) => tag.name === name))
        .filter((tag): tag is LoaderTag => !!tag);

/** Names such as "game-mechanics" as words. */
export const prettyTag = (name: string): string =>
    name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\bNeoforge\b/, 'NeoForge')
        .replace(/\bBungeecord\b/, 'BungeeCord');
