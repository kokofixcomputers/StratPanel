/**
 * Where the Content pages get their projects from: Modrinth, Hangar (plugins for Paper, Velocity and Waterfall), or CurseForge when an
 * admin has added a key. The pages ask here and get the same shapes from each, see lib/curseforge.ts and lib/hangar.ts for how they are
 * made to look like Modrinth.
 */
import * as curseForge from '@/lib/curseforge';
import * as hangar from '@/lib/hangar';
import * as modrinth from '@/lib/modrinth';
import { ProjectKind } from '@/lib/minecraft';
import {
    CategoryTag,
    GameVersionTag,
    LoaderTag,
    Member,
    ProjectDetails,
    SearchHit,
    SearchOptions,
    SortIndex,
} from '@/lib/modrinth';

export type SourceId = 'modrinth' | 'curseforge' | 'hangar';

export const SOURCES: { id: SourceId; label: string }[] = [
    { id: 'modrinth', label: 'Modrinth' },
    { id: 'hangar', label: 'Hangar' },
    { id: 'curseforge', label: 'CurseForge' },
];

export const sourceLabel = (id: SourceId): string => SOURCES.find((s) => s.id === id)!.label;

export const isSource = (value: string | null | undefined): value is SourceId => SOURCES.some((s) => s.id === value);

/** The source an id belongs to: ids from CurseForge start with "cf:", the ones from Hangar with "hg:". */
export const sourceOfId = (id: string): SourceId =>
    curseForge.isCurseForgeId(id) ? 'curseforge' : hangar.isHangarId(id) ? 'hangar' : 'modrinth';

/** What each source can sort by. */
export const sortsFor = (source: SourceId): { id: SortIndex; label: string }[] =>
    source === 'curseforge' ? curseForge.CF_SORTS : source === 'hangar' ? hangar.HG_SORTS : modrinth.SORTS;

/** Whether the Content page offers a kind of project for a source. CurseForge modpacks are a different format, Hangar only has plugins. */
export const hasKind = (source: SourceId, kind: ProjectKind | 'world'): boolean =>
    source === 'curseforge' ? kind !== 'modpack' : source === 'hangar' ? kind === 'plugin' : true;

/** Whether a loader of the address means something for a source (Hangar has no Fabric: that filter is left out there). */
export const loaderFits = (source: SourceId, loader: string): boolean =>
    source !== 'hangar' || !loader || hangar.HANGAR_LOADERS.includes(loader);

/** The kind to show when the one asked for is not there for a source: the nearest thing it has. */
export const fallbackKind = (source: SourceId): ProjectKind => (source === 'hangar' ? 'plugin' : 'mod');

/** Whether there are results to browse. Worlds are browsed on CurseForge, Modrinth has none (they come from a link). */
export const browsesKind = (source: SourceId, kind: ProjectKind | 'world'): boolean =>
    kind !== 'world' || source === 'curseforge';

export const searchContent = (
    source: SourceId,
    opts: SearchOptions & { kind: ProjectKind | 'world' },
    signal?: AbortSignal
): Promise<{ hits: SearchHit[]; total: number }> =>
    source === 'curseforge'
        ? curseForge.searchProjects(opts as SearchOptions, signal)
        : source === 'hangar'
        ? hangar.searchProjects(opts as SearchOptions, signal)
        : modrinth.searchProjects(opts, signal);

export interface FilterTags {
    categories: CategoryTag[];
    loaders: LoaderTag[];
    versions: GameVersionTag[];
}

export const loadTags = async (source: SourceId): Promise<FilterTags> => {
    if (source === 'hangar') {
        // Hangar has its own categories; the loaders it knows and the Minecraft versions are Modrinth's lists, which have the icons.
        const [categories, loaders, versions] = await Promise.all([
            hangar.getCategoryTags(),
            modrinth.getLoaderTags().catch(() => [] as LoaderTag[]),
            modrinth.getGameVersionTags().catch(() => [] as GameVersionTag[]),
        ]);

        return { categories, loaders: loaders.filter((l) => hangar.HANGAR_LOADERS.includes(l.name)), versions };
    }

    const [categories, loaders, versions] = await Promise.all(
        source === 'curseforge'
            ? [curseForge.getCategoryTags(), curseForge.getLoaderTags(), curseForge.getGameVersionTags()]
            : [modrinth.getCategoryTags(), modrinth.getLoaderTags(), modrinth.getGameVersionTags()]
    );

    return { categories, loaders, versions } as FilterTags;
};

export const getProjectDetails = (source: SourceId, slug: string): Promise<ProjectDetails> =>
    source === 'curseforge'
        ? curseForge.getProject(slug)
        : source === 'hangar'
        ? hangar.getProject(slug)
        : modrinth.getProject(slug);

export const getProjectMembers = (source: SourceId, slug: string): Promise<Member[]> =>
    source === 'curseforge'
        ? curseForge.getMembers(slug)
        : source === 'hangar'
        ? hangar.getMembers(slug)
        : modrinth.getMembers(slug);
