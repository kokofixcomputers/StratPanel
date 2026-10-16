/**
 * Where the Content pages get their projects from: Modrinth, or CurseForge when an admin has added a key. The pages ask
 * here and get the same shapes either way, see lib/curseforge.ts for how CurseForge is made to look like Modrinth.
 */
import * as curseForge from '@/lib/curseforge';
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

export type SourceId = 'modrinth' | 'curseforge';

export const SOURCES: { id: SourceId; label: string }[] = [
    { id: 'modrinth', label: 'Modrinth' },
    { id: 'curseforge', label: 'CurseForge' },
];

export const sourceLabel = (id: SourceId): string => SOURCES.find((s) => s.id === id)!.label;

export const isSource = (value: string | null | undefined): value is SourceId => SOURCES.some((s) => s.id === value);

/** The source an id belongs to: ids from CurseForge start with "cf:". */
export const sourceOfId = (id: string): SourceId => (curseForge.isCurseForgeId(id) ? 'curseforge' : 'modrinth');

/** What each source can sort by. */
export const sortsFor = (source: SourceId): { id: SortIndex; label: string }[] =>
    source === 'curseforge' ? curseForge.CF_SORTS : modrinth.SORTS;

/** Whether the Content page offers a kind of project for a source. CurseForge modpacks are a different format. */
export const hasKind = (source: SourceId, kind: ProjectKind | 'world'): boolean =>
    source === 'curseforge' ? kind !== 'modpack' : true;

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
        : modrinth.searchProjects(opts, signal);

export interface FilterTags {
    categories: CategoryTag[];
    loaders: LoaderTag[];
    versions: GameVersionTag[];
}

export const loadTags = async (source: SourceId): Promise<FilterTags> => {
    const [categories, loaders, versions] = await Promise.all(
        source === 'curseforge'
            ? [curseForge.getCategoryTags(), curseForge.getLoaderTags(), curseForge.getGameVersionTags()]
            : [modrinth.getCategoryTags(), modrinth.getLoaderTags(), modrinth.getGameVersionTags()]
    );

    return { categories, loaders, versions } as FilterTags;
};

export const getProjectDetails = (source: SourceId, slug: string): Promise<ProjectDetails> =>
    source === 'curseforge' ? curseForge.getProject(slug) : modrinth.getProject(slug);

export const getProjectMembers = (source: SourceId, slug: string): Promise<Member[]> =>
    source === 'curseforge' ? curseForge.getMembers(slug) : modrinth.getMembers(slug);
