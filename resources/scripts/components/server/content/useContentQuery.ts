import { useCallback } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { ProjectKind } from '@/lib/minecraft';
import { SortIndex } from '@/lib/modrinth';
import { hasKind, isSource, SourceId, sortsFor } from '@/lib/contentSource';

/** What the Content page can show: the Modrinth project types, plus worlds which come from a link or an upload. */
export type ContentKind = ProjectKind | 'world';

export const KINDS: { id: ContentKind; label: string; unit: string }[] = [
    { id: 'plugin', label: 'Plugins', unit: 'plugins' },
    { id: 'mod', label: 'Mods', unit: 'mods' },
    { id: 'datapack', label: 'Datapacks', unit: 'datapacks' },
    { id: 'resourcepack', label: 'Resource packs', unit: 'resource packs' },
    { id: 'modpack', label: 'Modpacks', unit: 'modpacks' },
    { id: 'world', label: 'Worlds', unit: 'worlds' },
];

export interface ContentQuery {
    // Where the projects come from.
    source: SourceId;
    kind: ContentKind;
    query: string;
    categories: string[];
    loader: string;
    // The Minecraft version results have to support, empty for any.
    version: string;
    // Leave out what only works on a player's computer.
    serverSide: boolean;
    sort: SortIndex;
    page: number;
    view: 'browse' | 'installed';
}

// Client side mods are of no use on a server, so they are hidden until the person asks for them.
const serverSideByDefault = (kind: ContentKind) => kind === 'mod' || kind === 'modpack';

/** Reads the filters from the address of the page. Without a version in it, the server's own version is used. */
export const readQuery = (search: string, detectedVersion: string): ContentQuery => {
    const params = new URLSearchParams(search);
    const source: SourceId = isSource(params.get('s')) ? (params.get('s') as SourceId) : 'modrinth';
    const asked = KINDS.find((k) => k.id === params.get('t'))?.id || 'plugin';
    // CurseForge has no modpacks here, what it does not have shows the nearest thing that it does.
    const kind: ContentKind = hasKind(source, asked) ? asked : 'mod';
    const version = params.get('v');
    const serverSide = params.get('e');
    const sort = params.get('o') as SortIndex;
    const page = parseInt(params.get('p') || '1', 10);

    return {
        source,
        kind,
        query: params.get('q') || '',
        categories: (params.get('c') || '').split(',').filter(Boolean),
        loader: params.get('l') || '',
        version: version === 'all' ? '' : version || detectedVersion,
        serverSide: serverSide === null ? serverSideByDefault(kind) : serverSide === '1',
        sort: sortsFor(source).some((s) => s.id === sort) ? sort : 'relevance',
        page: isNaN(page) || page < 1 ? 1 : page,
        view: params.get('view') === 'installed' ? 'installed' : 'browse',
    };
};

/**
 * The filters of the Content page live in the address, so the sidebar, the results and the project page all see the
 * same ones and going back from a project returns to what was being looked at.
 */
export default (detectedVersion: string) => {
    const location = useLocation();
    const history = useHistory();
    const query = readQuery(location.search, detectedVersion);

    const update = useCallback(
        (patch: Partial<ContentQuery>, mode: 'push' | 'replace' = 'replace') => {
            const params = new URLSearchParams(location.search);
            const kind = patch.kind ?? readQuery(location.search, detectedVersion).kind;

            const set = (key: string, value: string | null) =>
                value === null || value === '' ? params.delete(key) : params.set(key, value);

            if (patch.source !== undefined) {
                set('s', patch.source === 'modrinth' ? null : patch.source);
                // The categories, the loaders and the ways to sort are not the same on both sites.
                ['c', 'l', 'e', 'o'].forEach((key) => params.delete(key));
                if (!hasKind(patch.source, kind)) set('t', 'mod');
            }
            if (patch.kind !== undefined) {
                set('t', patch.kind === 'plugin' ? null : patch.kind);
                // Categories and loaders belong to a kind of project.
                params.delete('c');
                params.delete('l');
                params.delete('e');
            }
            if (patch.query !== undefined) set('q', patch.query.trim());
            if (patch.categories !== undefined) set('c', patch.categories.join(','));
            if (patch.loader !== undefined) set('l', patch.loader);
            if (patch.version !== undefined) {
                // Empty means any version, which has to be written down because no version means the server's one.
                set('v', patch.version === detectedVersion ? null : patch.version || 'all');
            }
            if (patch.serverSide !== undefined) {
                set('e', patch.serverSide === serverSideByDefault(kind) ? null : patch.serverSide ? '1' : '0');
            }
            if (patch.sort !== undefined) set('o', patch.sort === 'relevance' ? null : patch.sort);
            if (patch.view !== undefined) set('view', patch.view === 'browse' ? null : patch.view);

            // Another filter means another list of results, which starts at the first page.
            if (patch.page !== undefined) set('p', patch.page <= 1 ? null : String(patch.page));
            else params.delete('p');

            const next = params.toString();
            if (next === location.search.replace(/^\?/, '')) return;

            // A filter changed on the page of a project means the results of that filter, so it goes to the list.
            const pathname = location.pathname.replace(/\/project\/[^/]+\/?$/, '');
            const target = { pathname, search: next ? `?${next}` : '' };
            if (mode === 'push' || pathname !== location.pathname) history.push(target);
            else history.replace(target);
        },
        [location.search, location.pathname, detectedVersion, history]
    );

    return { query, update, search: location.search };
};
