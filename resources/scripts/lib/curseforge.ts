/**
 * CurseForge for the Content pages. The panel asks its own backend, which holds the API key and asks CurseForge (see
 * app/Http/Controllers/Api/Client/CurseForgeController.php), so nothing here needs a key.
 *
 * What CurseForge sends is turned into the shapes the pages already use for Modrinth (SearchHit, ProjectDetails,
 * ModrinthVersion...), so listing, the page of a project, the install dialog, dependencies and updates work the same for
 * both. Ids from CurseForge start with "cf:" (the project 238222 is "cf:238222") so they can never be mistaken for a
 * Modrinth id, in the address, in the records of installed projects and in the dependency planner.
 */
import http, { httpErrorToHuman } from '@/api/http';
import type { ProjectKind, ModrinthDependency, ModrinthProjectInfo, ModrinthVersion } from '@/lib/minecraft';
import type {
    CategoryTag,
    GalleryImage,
    GameVersionTag,
    LoaderTag,
    Member,
    ProjectDetails,
    SearchHit,
    SearchOptions,
    SortIndex,
} from '@/lib/modrinth';

export const CF_PREFIX = 'cf:';

export const isCurseForgeId = (id: string | null | undefined): boolean => !!id && id.startsWith(CF_PREFIX);

/** The number CurseForge knows a project or a file by, NaN when the id is not one of CurseForge's. */
export const cfNumber = (id: string): number => (isCurseForgeId(id) ? parseInt(id.slice(CF_PREFIX.length), 10) : NaN);

export const cfId = (id: number | string): string => `${CF_PREFIX}${id}`;

// ---- what CurseForge sends --------------------------------------------------------------------------------------------

interface CfAsset {
    id: number;
    modId: number;
    title: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    url: string | null;
}

export interface CfCategory {
    id: number;
    name: string;
    slug: string;
    iconUrl?: string;
    isClass?: boolean;
    classId?: number | null;
    parentCategoryId?: number | null;
    displayIndex?: number;
}

interface CfDependency {
    modId: number;
    relationType: number;
}

export interface CfFile {
    id: number;
    modId: number;
    displayName: string;
    fileName: string;
    releaseType: number;
    fileDate: string;
    fileLength?: number;
    downloadCount?: number;
    downloadUrl: string | null;
    gameVersions: string[];
    dependencies?: CfDependency[];
    hashes?: { value: string; algo: number }[];
    fileFingerprint?: number;
    isAvailable?: boolean;
}

export interface CfMod {
    id: number;
    name: string;
    slug: string;
    summary: string;
    classId?: number | null;
    links?: {
        websiteUrl?: string | null;
        wikiUrl?: string | null;
        issuesUrl?: string | null;
        sourceUrl?: string | null;
    };
    downloadCount: number;
    thumbsUpCount?: number;
    categories?: CfCategory[];
    authors?: { id: number; name: string; url?: string }[];
    logo?: CfAsset | null;
    screenshots?: CfAsset[];
    latestFiles?: CfFile[];
    latestFilesIndexes?: { gameVersion: string; fileId: number; modLoader?: number | null }[];
    dateCreated: string;
    dateModified: string;
    // False when the author does not let the files be downloaded anywhere but CurseForge.
    allowModDistribution?: boolean | null;
}

interface CfGameVersion {
    versionString: string;
    dateModified?: string;
}

// ---- asking the panel ------------------------------------------------------------------------------------------------

const API = '/api/client/curseforge';

const ask = async <T>(request: () => Promise<{ data: T }>): Promise<T> => {
    try {
        return (await request()).data;
    } catch (error) {
        throw new Error(httpErrorToHuman(error));
    }
};

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

/** Whether an admin has added an API key. Without one the panel does not offer CurseForge at all. */
export const isCurseForgeEnabled = once(() =>
    http
        .get(API)
        .then((response) => !!response.data?.enabled)
        .catch(() => false)
);

// ---- kinds, classes and filters ---------------------------------------------------------------------------------------

const CLASS_SLUGS: Record<ProjectKind | 'world', string> = {
    mod: 'mc-mods',
    plugin: 'bukkit-plugins',
    datapack: 'data-packs',
    resourcepack: 'texture-packs',
    world: 'worlds',
    modpack: 'modpacks',
};

// If the list of categories cannot tell, these are the numbers CurseForge has used for years.
const CLASS_FALLBACK: Record<ProjectKind | 'world', number> = {
    mod: 6,
    plugin: 5,
    datapack: 6945,
    resourcepack: 12,
    world: 17,
    modpack: 4471,
};

/** What CurseForge calls a loader, by the names the pages use. Bukkit plugins have none. */
export const LOADER_TYPES: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

export const MOD_LOADER_ORDER = ['fabric', 'forge', 'neoforge', 'quilt'];

const LOADER_TAGS = [
    ...MOD_LOADER_ORDER,
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

export const getCategories = once(() =>
    ask<{ data: CfCategory[] }>(() => http.get(`${API}/categories`)).then((r) => r.data)
);

/** The id of the class (mods, plugins, worlds...) CurseForge files a kind of project under. */
export const classIdFor = async (kind: ProjectKind | 'world'): Promise<number> => {
    try {
        const found = (await getCategories()).find((c) => c.isClass && c.slug === CLASS_SLUGS[kind]);

        return found?.id ?? CLASS_FALLBACK[kind];
    } catch (e) {
        return CLASS_FALLBACK[kind];
    }
};

/** The kind of project a class is, null for the ones that cannot be installed on a server (customization...). */
export const kindOfClass = (
    classId: number | null | undefined,
    classes: CfCategory[] = []
): ProjectKind | 'world' | null => {
    const entries = Object.entries(CLASS_SLUGS) as [ProjectKind | 'world', string][];
    const bySlug = classes.find((c) => c.id === classId)?.slug;
    const found =
        entries.find(([, slug]) => slug === bySlug) || entries.find(([kind]) => CLASS_FALLBACK[kind] === classId);

    return found ? found[0] : null;
};

/**
 * The categories as the filter shows them. CurseForge has them in two levels: the ones under a class, and the ones under
 * those. The name is the slug, which reads well in the address and stays the same.
 */
export const getCategoryTags = once(async (): Promise<CategoryTag[]> => {
    const all = await getCategories();
    const classes = all.filter((c) => c.isClass);
    const byId = new Map(all.map((c) => [c.id, c]));

    return all
        .filter((c) => !c.isClass && c.classId)
        .sort((a, b) => (a.displayIndex ?? 0) - (b.displayIndex ?? 0) || a.name.localeCompare(b.name))
        .flatMap((category) => {
            const kind = kindOfClass(category.classId, classes);
            if (!kind) return [];

            const parent =
                category.parentCategoryId && category.parentCategoryId !== category.classId
                    ? byId.get(category.parentCategoryId)
                    : undefined;

            return [
                {
                    name: category.slug,
                    project_type: kind,
                    header: parent ? parent.name : 'Categories',
                    // The picture of the category, the tag icon shows an address as a picture.
                    icon: category.iconUrl || '',
                    label: category.name,
                } as CategoryTag,
            ];
        });
});

/** Mods have a loader to pick, everything else on CurseForge does not. */
export const getLoaderTags = async (): Promise<LoaderTag[]> =>
    MOD_LOADER_ORDER.map((name) => ({ name, icon: '', supported_project_types: ['mod'] }));

const RELEASE = /^\d+(\.\d+)+$/;

export const getGameVersionTags = once(async (): Promise<GameVersionTag[]> => {
    const { data } = await ask<{ data: CfGameVersion[] }>(() => http.get(`${API}/versions`));
    const seen = new Set<string>();

    return (data || []).flatMap((entry) => {
        if (!entry.versionString || seen.has(entry.versionString)) return [];
        seen.add(entry.versionString);

        return [
            {
                version: entry.versionString,
                version_type: RELEASE.test(entry.versionString) ? 'release' : 'snapshot',
                date: entry.dateModified || '',
                major: RELEASE.test(entry.versionString) && entry.versionString.split('.').length <= 2,
            } as GameVersionTag,
        ];
    });
});

/** Whether the newest files of a mod are for a loader, CurseForge lists them with the number of the loader. */
const hasLoader = (mod: CfMod, loader: string): boolean => {
    const wanted = LOADER_TYPES[loader];
    const indexes = mod.latestFilesIndexes || [];

    return !wanted || !indexes.length || indexes.some((index) => index.modLoader === wanted);
};

// ---- search -----------------------------------------------------------------------------------------------------------

// CurseForge's numbers for what to sort by: 2 is how popular a project is, 3 when it was updated, 6 the downloads, 11 when it
// was released and 12 the rating.
export const SORT_FIELDS: Record<string, number> = {
    relevance: 2,
    downloads: 6,
    updated: 3,
    newest: 11,
    rating: 12,
};

export const CF_SORTS: { id: SortIndex; label: string }[] = [
    { id: 'relevance', label: 'Popularity' },
    { id: 'downloads', label: 'Downloads' },
    { id: 'rating', label: 'Rating' },
    { id: 'updated', label: 'Recently updated' },
    { id: 'newest', label: 'Newest' },
];

// CurseForge answers no further than this many results of one search.
const MAX_RESULTS = 10000;

const iconOf = (mod: CfMod): string | null => mod.logo?.thumbnailUrl || mod.logo?.url || null;

const authorOf = (mod: CfMod): string => mod.authors?.[0]?.name || 'Unknown';

export const toSearchHit = (mod: CfMod): SearchHit => ({
    project_id: cfId(mod.id),
    slug: String(mod.id),
    title: mod.name,
    description: mod.summary || '',
    author: authorOf(mod),
    downloads: mod.downloadCount || 0,
    icon_url: iconOf(mod),
    categories: (mod.categories || []).map((c) => c.slug),
    follows: mod.thumbsUpCount || 0,
    date_modified: mod.dateModified,
});

export const searchProjects = async (
    opts: SearchOptions,
    signal?: AbortSignal
): Promise<{ hits: SearchHit[]; total: number }> => {
    const [classId, categories] = await Promise.all([
        classIdFor(opts.kind),
        opts.categories.length ? getCategories().catch(() => [] as CfCategory[]) : Promise.resolve([] as CfCategory[]),
    ]);
    const ids = opts.categories
        .map((slug) => categories.find((c) => c.slug === slug && c.classId === classId)?.id)
        .filter((id): id is number => !!id);

    const loader = opts.kind === 'mod' && opts.loader ? LOADER_TYPES[opts.loader] : undefined;
    const params: Record<string, string | number> = {
        classId,
        sortField: SORT_FIELDS[opts.sort] ?? SORT_FIELDS.relevance,
        // Names and authors read best from A to Z, everything else from the most to the least.
        sortOrder: 'desc',
        index: Math.max(0, opts.page - 1) * opts.pageSize,
        pageSize: opts.pageSize,
    };
    if (opts.query.trim()) params.searchFilter = opts.query.trim();
    if (opts.version) params.gameVersion = opts.version;
    if (loader && opts.version) params.modLoaderType = loader;
    if (ids.length) params.categoryIds = ids.join(',');

    const body = await ask<{ data: CfMod[]; pagination?: { totalCount?: number } }>(() =>
        http.get(`${API}/search`, { params, signal })
    );
    const hits = (body.data || []).map(toSearchHit);
    // Without a version a loader cannot be asked for, CurseForge wants both, so the results are cut down here.
    const filtered =
        loader && !opts.version ? hits.filter((_, i) => hasLoader(body.data[i], opts.loader as string)) : hits;

    return {
        hits: filtered,
        total: Math.min(body.pagination?.totalCount ?? filtered.length, MAX_RESULTS),
    };
};

// ---- one project -------------------------------------------------------------------------------------------------------

const loadersOfFile = (file: CfFile): string[] => {
    const tags = (file.gameVersions || []).map((v) => v.toLowerCase());

    return LOADER_TAGS.filter((name) => tags.includes(name));
};

const minecraftVersions = (versions: string[]): string[] => versions.filter((v) => RELEASE.test(v));

const compareVersions = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

export const toProjectDetails = (mod: CfMod, description: string, classes: CfCategory[] = []): ProjectDetails => {
    const files = mod.latestFiles || [];
    const versions = new Set<string>();
    const loaders = new Set<string>();
    files.forEach((file) => {
        minecraftVersions(file.gameVersions || []).forEach((v) => versions.add(v));
        loadersOfFile(file).forEach((l) => loaders.add(l));
    });
    (mod.latestFilesIndexes || []).forEach(
        (index) => RELEASE.test(index.gameVersion) && versions.add(index.gameVersion)
    );

    const screenshots = (mod.screenshots || []).filter((s) => s.url);
    const gallery: GalleryImage[] = screenshots.map((shot, order) => ({
        url: shot.thumbnailUrl || (shot.url as string),
        raw_url: shot.url as string,
        featured: order === 0,
        title: shot.title || null,
        description: shot.description || null,
        ordering: order,
    }));
    const kind = kindOfClass(mod.classId, classes);

    return {
        id: cfId(mod.id),
        slug: String(mod.id),
        title: mod.name,
        description: mod.summary || '',
        body: description,
        project_type: kind || 'mod',
        categories: (mod.categories || []).map((c) => c.slug),
        additional_categories: [],
        loaders: Array.from(loaders),
        game_versions: Array.from(versions).sort(compareVersions),
        downloads: mod.downloadCount || 0,
        followers: mod.thumbsUpCount || 0,
        icon_url: iconOf(mod),
        client_side: 'unknown',
        server_side: 'unknown',
        gallery,
        source_url: mod.links?.sourceUrl || null,
        issues_url: mod.links?.issuesUrl || null,
        wiki_url: mod.links?.wikiUrl || null,
        discord_url: null,
        license: null,
        published: mod.dateCreated,
        updated: mod.dateModified,
        team: '',
        source: 'curseforge',
        website_url: mod.links?.websiteUrl || null,
        distribution_allowed: mod.allowModDistribution !== false,
    };
};

export const getProject = async (slug: string): Promise<ProjectDetails> => {
    const id = parseInt(slug, 10);
    if (isNaN(id)) throw new Error('That project was not found on CurseForge.');

    const [mod, description, categories] = await Promise.all([
        ask<{ data: CfMod }>(() => http.get(`${API}/mods/${id}`)),
        // The long description is nice to have, the page works without it.
        ask<{ data: string }>(() => http.get(`${API}/mods/${id}/description`)).catch(() => ({ data: '' })),
        getCategories().catch(() => [] as CfCategory[]),
    ]);

    return toProjectDetails(
        mod.data,
        description.data || '',
        categories.filter((c) => c.isClass)
    );
};

export const getMembers = async (slug: string): Promise<Member[]> => {
    const id = parseInt(slug, 10);
    const mod = await ask<{ data: CfMod }>(() => http.get(`${API}/mods/${id}`));

    return (mod.data.authors || []).map((author, index) => ({
        role: index === 0 ? 'Owner' : 'Author',
        user: { username: author.name, avatar_url: null },
    }));
};

// ---- versions ----------------------------------------------------------------------------------------------------------

const RELEASE_TYPES: Record<number, 'release' | 'beta' | 'alpha'> = { 1: 'release', 2: 'beta', 3: 'alpha' };
const RELATIONS: Record<number, ModrinthDependency['dependency_type']> = {
    1: 'embedded',
    2: 'optional',
    3: 'required',
    5: 'incompatible',
    6: 'embedded',
};

/**
 * The address a file is downloaded from. The one the API gives (edge.forgecdn.net) only answers with a redirect to the real
 * server, and Wings treats any answer but a file as a failed download ("got bad response status from endpoint: 302").
 * The real server has the same path, so Wings is sent there.
 */
export const directDownloadUrl = (url: string): string =>
    url.replace(/^(https:\/\/)edge\.forgecdn\.net\//i, '$1mediafilez.forgecdn.net/');

export const toVersion = (file: CfFile): ModrinthVersion => {
    const sha1 = file.hashes?.find((h) => h.algo === 1)?.value;

    return {
        id: cfId(file.id),
        project_id: cfId(file.modId),
        version_number: file.displayName || file.fileName,
        name: file.displayName || file.fileName,
        game_versions: minecraftVersions(file.gameVersions || []).sort(compareVersions),
        loaders: loadersOfFile(file),
        // A file the author keeps off other sites has no address, it can only be downloaded from CurseForge.
        files: file.downloadUrl
            ? [
                  {
                      url: directDownloadUrl(file.downloadUrl),
                      filename: file.fileName,
                      primary: true,
                      size: file.fileLength,
                      hashes: sha1 ? { sha1 } : undefined,
                  },
              ]
            : [],
        date_published: file.fileDate,
        version_type: RELEASE_TYPES[file.releaseType] || 'release',
        downloads: file.downloadCount,
        dependencies: (file.dependencies || [])
            .filter((d) => RELATIONS[d.relationType])
            .map((d) => ({
                project_id: cfId(d.modId),
                version_id: null,
                dependency_type: RELATIONS[d.relationType],
            })),
        restricted: !file.downloadUrl,
    };
};

const PAGE = 50;
const MAX_PAGES = 3;

/**
 * The files of a project, newest first, limited the way the Modrinth version is: loaders (a file that names none is for
 * everything) and Minecraft versions. CurseForge filters on one version, the rest is done here.
 */
export const getProjectVersions = async (
    projectId: string,
    opts: { loaders?: string[]; gameVersions?: string[] } = {}
): Promise<ModrinthVersion[]> => {
    const id = cfNumber(projectId);
    if (isNaN(id)) return [];

    const files: CfFile[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const body = await ask<{ data: CfFile[]; pagination?: { totalCount?: number } }>(() =>
            http.get(`${API}/mods/${id}/files`, {
                params: {
                    pageSize: PAGE,
                    index: page * PAGE,
                    ...(opts.gameVersions?.length === 1 ? { gameVersion: opts.gameVersions[0] } : {}),
                },
            })
        );
        files.push(...(body.data || []));
        if ((body.data || []).length < PAGE || files.length >= (body.pagination?.totalCount ?? 0)) break;
    }

    const wanted = opts.loaders || [];

    return files
        .filter((file) => file.isAvailable !== false)
        .map(toVersion)
        .filter((version) => {
            if (opts.gameVersions?.length && !version.game_versions.some((v) => opts.gameVersions!.includes(v)))
                return false;
            if (wanted.length && version.loaders.length && !version.loaders.some((l) => wanted.includes(l)))
                return false;

            return true;
        })
        .sort((a, b) => b.date_published.localeCompare(a.date_published));
};

/** One file by the id of its version. CurseForge needs the project too, which the bulk lookup finds out. */
export const getVersion = async (versionId: string): Promise<ModrinthVersion> => {
    const id = cfNumber(versionId);
    const body = await ask<{ data: CfFile[] }>(() => http.post(`${API}/files`, { ids: [id] }));
    if (!body.data?.length) throw new Error('That version was not found on CurseForge.');

    return toVersion(body.data[0]);
};

/** The changelog of a file, as HTML. */
export const getChangelog = async (projectId: string, versionId: string): Promise<string> => {
    const body = await ask<{ data: string }>(() =>
        http.get(`${API}/mods/${cfNumber(projectId)}/files/${cfNumber(versionId)}/changelog`)
    );

    return body.data || '';
};

/** The name, picture and kind of several projects, which is what the dependency lists and the installed lists show. */
export const getProjects = async (ids: string[]): Promise<ModrinthProjectInfo[]> => {
    const numbers = Array.from(new Set(ids.map(cfNumber).filter((n) => !isNaN(n))));
    if (!numbers.length) return [];

    const classes = (await getCategories().catch(() => [] as CfCategory[])).filter((c) => c.isClass);
    const found: ModrinthProjectInfo[] = [];
    for (let i = 0; i < numbers.length; i += 50) {
        const body = await ask<{ data: CfMod[] }>(() => http.post(`${API}/mods`, { ids: numbers.slice(i, i + 50) }));
        (body.data || []).forEach((mod) =>
            found.push({
                id: cfId(mod.id),
                slug: String(mod.id),
                title: mod.name,
                icon_url: iconOf(mod),
                project_type: kindOfClass(mod.classId, classes) || 'mod',
            })
        );
    }

    return found;
};

// ---- recognising files by their fingerprint ----------------------------------------------------------------------------

const MURMUR = 0x5bd1e995;

/**
 * The fingerprint CurseForge gives a file: MurmurHash2 with seed 1 over the bytes of the file, leaving out the tab, the line
 * feeds and the space. That is how it finds the project a jar belongs to without anything but the file.
 */
export const fingerprint = (data: ArrayBuffer | Uint8Array): number => {
    const source = data instanceof Uint8Array ? data : new Uint8Array(data);
    const bytes = new Uint8Array(source.length);
    let length = 0;
    for (let i = 0; i < source.length; i++) {
        const byte = source[i];
        if (byte !== 9 && byte !== 10 && byte !== 13 && byte !== 32) bytes[length++] = byte;
    }

    let h = (1 ^ length) >>> 0;
    let i = 0;
    for (; length - i >= 4; i += 4) {
        let k = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
        k = Math.imul(k, MURMUR) >>> 0;
        k = (k ^ (k >>> 24)) >>> 0;
        k = Math.imul(k, MURMUR) >>> 0;
        h = Math.imul(h, MURMUR) >>> 0;
        h = (h ^ k) >>> 0;
    }

    const left = length - i;
    if (left >= 3) h = (h ^ (bytes[i + 2] << 16)) >>> 0;
    if (left >= 2) h = (h ^ (bytes[i + 1] << 8)) >>> 0;
    if (left >= 1) {
        h = (h ^ bytes[i]) >>> 0;
        h = Math.imul(h, MURMUR) >>> 0;
    }

    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, MURMUR) >>> 0;

    return (h ^ (h >>> 15)) >>> 0;
};

export interface FingerprintMatch {
    project: ModrinthProjectInfo;
    version: ModrinthVersion;
}

/** The projects that files belong to, by fingerprint. Files CurseForge does not know are left out. */
export const lookupFingerprints = async (fingerprints: number[]): Promise<Record<number, FingerprintMatch>> => {
    if (!fingerprints.length) return {};

    const body = await ask<{ data: { exactMatches?: { id: number; file: CfFile }[] } }>(() =>
        http.post(`${API}/fingerprints`, { fingerprints })
    );
    const matches = body.data?.exactMatches || [];
    const projects = new Map((await getProjects(matches.map((m) => cfId(m.id))).catch(() => [])).map((p) => [p.id, p]));

    const result: Record<number, FingerprintMatch> = {};
    matches.forEach((match) => {
        const project = projects.get(cfId(match.id));
        const print = match.file?.fileFingerprint;
        if (project && typeof print === 'number') result[print] = { project, version: toVersion(match.file) };
    });

    return result;
};
