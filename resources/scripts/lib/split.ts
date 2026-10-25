/**
 * Splitting a server (see app/Services/Servers/ServerSplitService.php): the parts share one total, and the first server (the root)
 * keeps what the others do not have. Memory and disk are in MB, CPU is a percentage.
 */
import { Share, SplitPart } from '@/api/server/split';

export type Resource = keyof Share;

export const RESOURCES: Resource[] = ['memory', 'disk', 'cpu'];

export type Draft = Record<string, Share>;

export const toDraft = (parts: SplitPart[]): Draft =>
    parts.reduce((all, part) => ({ ...all, [part.uuid]: { memory: part.memory, disk: part.disk, cpu: part.cpu } }), {});

/**
 * Gives a part another amount of one resource, the root takes the difference. The amount is kept between the least a part can have
 * and what the root can spare.
 */
export const setShare = (
    draft: Draft,
    root: string,
    part: string,
    resource: Resource,
    value: number,
    minimum: Share
): Draft => {
    if (part === root) return draft;

    const spare = draft[root][resource] - minimum[resource];
    const next = Math.round(Math.min(Math.max(value, minimum[resource]), draft[part][resource] + spare));
    const change = next - draft[part][resource];

    return {
        ...draft,
        [part]: { ...draft[part], [resource]: next },
        [root]: { ...draft[root], [resource]: draft[root][resource] - change },
    };
};

/** The most a part can have of a resource, with the root keeping its least. */
export const mostFor = (draft: Draft, root: string, part: string, resource: Resource, minimum: Share): number =>
    draft[part][resource] + Math.max(0, draft[root][resource] - minimum[resource]);

export const isDirty = (draft: Draft, parts: SplitPart[]): boolean =>
    parts.some((part) => RESOURCES.some((resource) => draft[part.uuid]?.[resource] !== part[resource]));

const trimZero = (value: string): string => value.replace(/\.0$/, '');

export const formatAmount = (resource: Resource, value: number): string =>
    resource === 'cpu' ? `${value}%` : value >= 1024 ? `${trimZero((value / 1024).toFixed(1))} GB` : `${value} MB`;
