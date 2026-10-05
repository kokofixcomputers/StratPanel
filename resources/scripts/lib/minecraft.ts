/**
 * Helpers for the Minecraft specific screens: parsing "server.properties", looking up players and
 * talking to the Modrinth API.
 */
import getFileContents from '@/api/server/files/getFileContents';

export type PropertyType = 'boolean' | 'number' | 'text';

export interface PropertyLine {
    key: string;
    value: string;
}

export const parseProperties = (content: string): PropertyLine[] =>
    content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#') && line.includes('='))
        .map((line) => {
            const index = line.indexOf('=');

            return { key: line.slice(0, index).trim(), value: line.slice(index + 1) };
        });

/**
 * Writes the new values back into the original document so comments and the ordering of the file is
 * preserved. Keys that did not exist before are appended at the end.
 */
export const serializeProperties = (original: string, values: Record<string, string>): string => {
    const seen = new Set<string>();
    const lines = original.split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line;

        const key = trimmed.slice(0, trimmed.indexOf('=')).trim();
        if (!(key in values)) return line;

        seen.add(key);
        return `${key}=${values[key]}`;
    });

    // New keys go right after the last line of content, not after the blank line a trailing newline leaves.
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    Object.keys(values)
        .filter((key) => !seen.has(key))
        .forEach((key) => lines.push(`${key}=${values[key]}`));

    return lines.join('\n').replace(/\n*$/, '\n');
};

export const detectType = (value: string): PropertyType =>
    value === 'true' || value === 'false' ? 'boolean' : /^-?\d+$/.test(value.trim()) ? 'number' : 'text';

export const readOptionalFile = async (uuid: string, path: string): Promise<string | null> => {
    try {
        return await getFileContents(uuid, path);
    } catch (e) {
        return null;
    }
};

export const readJsonList = async <T>(uuid: string, path: string): Promise<T[]> => {
    const raw = await readOptionalFile(uuid, path);
    if (!raw || !raw.trim()) return [];

    try {
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

// ---- players -----------------------------------------------------------------------------------

export interface Player {
    uuid: string;
    name: string;
}

export const dashUuid = (raw: string): string =>
    raw.includes('-') ? raw : raw.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

export const headUrl = (uuid: string, size = 64): string =>
    `https://mc-heads.net/avatar/${uuid.replace(/-/g, '')}/${size}`;

export const lookupPlayer = async (name: string): Promise<Player> => {
    const response = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`);
    const body = await response.json();
    if (!response.ok || !body?.data?.player) {
        throw new Error(`Could not find a Minecraft player named "${name}".`);
    }

    return { uuid: dashUuid(body.data.player.id), name: body.data.player.username };
};

// ---- modrinth ----------------------------------------------------------------------------------

export type ProjectKind = 'mod' | 'plugin' | 'modpack';

export interface ModrinthProject {
    // eslint-disable-next-line camelcase
    project_id: string;
    slug: string;
    title: string;
    description: string;
    author: string;
    downloads: number;
    // eslint-disable-next-line camelcase
    icon_url: string | null;
    categories: string[];
}

export interface ModrinthSearchResult {
    hits: ModrinthProject[];
    // eslint-disable-next-line camelcase
    total_hits: number;
}

export const PLUGIN_LOADERS = ['paper', 'spigot', 'bukkit', 'purpur', 'folia'];
export const MOD_LOADERS = ['fabric', 'forge', 'neoforge', 'quilt'];

const API = 'https://api.modrinth.com/v2';

export const searchModrinth = async (opts: {
    kind: ProjectKind;
    query: string;
    loader?: string;
    version?: string;
    offset?: number;
}): Promise<ModrinthSearchResult> => {
    const facets: string[][] = [[`project_type:${opts.kind}`]];
    if (opts.kind === 'plugin') {
        facets.push((opts.loader ? [opts.loader] : PLUGIN_LOADERS).map((l) => `categories:${l}`));
    } else if (opts.loader) {
        facets.push([`categories:${opts.loader}`]);
    }
    if (opts.version) facets.push([`versions:${opts.version}`]);

    const params = new URLSearchParams({
        query: opts.query,
        limit: '20',
        offset: String(opts.offset || 0),
        index: opts.query ? 'relevance' : 'downloads',
        facets: JSON.stringify(facets),
    });

    const response = await fetch(`${API}/search?${params.toString()}`);
    if (!response.ok) throw new Error('Modrinth could not be reached, please try again in a moment.');

    return response.json();
};

export interface ModrinthFile {
    url: string;
    filename: string;
    primary: boolean;
    size?: number;
}

export interface ModrinthVersion {
    id: string;
    // eslint-disable-next-line camelcase
    project_id: string;
    // eslint-disable-next-line camelcase
    version_number: string;
    name: string;
    // eslint-disable-next-line camelcase
    game_versions: string[];
    loaders: string[];
    files: ModrinthFile[];
    // eslint-disable-next-line camelcase
    date_published: string;
}

const modrinthError = () => new Error('Modrinth could not be reached, please try again in a moment.');

/** All versions of a project, newest first, optionally limited to loaders and Minecraft versions. */
export const getProjectVersions = async (
    projectId: string,
    opts: { loaders?: string[]; gameVersions?: string[] } = {}
): Promise<ModrinthVersion[]> => {
    const params = new URLSearchParams();
    if (opts.loaders?.length) params.set('loaders', JSON.stringify(opts.loaders));
    if (opts.gameVersions?.length) params.set('game_versions', JSON.stringify(opts.gameVersions));

    const response = await fetch(`${API}/project/${projectId}/version?${params.toString()}`);
    if (!response.ok) throw modrinthError();

    return response.json();
};

export const loadersFor = (kind: ProjectKind, loader?: string): string[] =>
    loader ? [loader] : kind === 'plugin' ? PLUGIN_LOADERS : MOD_LOADERS;

export const primaryFile = (version: ModrinthVersion): ModrinthFile =>
    version.files.find((file) => file.primary) || version.files[0];

export const findDownload = async (opts: {
    projectId: string;
    kind: ProjectKind;
    loader?: string;
    version?: string;
}): Promise<{ file: ModrinthFile; versionNumber: string; versionId: string; loaders: string[] }> => {
    const versions = await getProjectVersions(opts.projectId, {
        loaders: loadersFor(opts.kind, opts.loader),
        gameVersions: opts.version ? [opts.version] : undefined,
    });
    const match = versions.find((version) => version.files.length > 0);
    if (!match) throw new Error('No compatible version was found for this server.');

    return {
        file: primaryFile(match),
        versionNumber: match.version_number,
        versionId: match.id,
        loaders: match.loaders,
    };
};

// ---- recognising files that are already on the server ----------------------------------------------------------

export const sha1Hex = async (data: ArrayBuffer): Promise<string> =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', data)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

/** Finds the Modrinth versions that belong to the given file hashes, keyed by hash. */
export const lookupHashes = async (hashes: string[]): Promise<Record<string, ModrinthVersion>> => {
    if (!hashes.length) return {};

    const response = await fetch(`${API}/version_files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes, algorithm: 'sha1' }),
    });
    if (!response.ok) throw modrinthError();

    return response.json();
};

export interface ModrinthProjectInfo {
    id: string;
    slug: string;
    title: string;
    // eslint-disable-next-line camelcase
    icon_url: string | null;
    // eslint-disable-next-line camelcase
    project_type: string;
}

export const getProjects = async (ids: string[]): Promise<ModrinthProjectInfo[]> => {
    if (!ids.length) return [];

    const response = await fetch(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
    if (!response.ok) throw modrinthError();

    return response.json();
};
