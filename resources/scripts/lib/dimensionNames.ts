/**
 * What the Worlds page needs to know about dimensions without asking the server: what a folder is called for people, and
 * how seeds are written. A world of 26.x keeps every dimension in world/dimensions/<namespace>/<name>.
 */
import { getTag, NbtFile, withTag } from '@/lib/nbt';

export type DimensionKind = 'overworld' | 'nether' | 'end' | 'custom';

const KINDS: Record<string, { kind: DimensionKind; label: string }> = {
    'minecraft:overworld': { kind: 'overworld', label: 'Overworld' },
    'minecraft:the_nether': { kind: 'nether', label: 'The Nether' },
    'minecraft:the_end': { kind: 'end', label: 'The End' },
};

const titled = (text: string) =>
    text
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

/** "the_nether" of "minecraft" is The Nether, a dimension of a mod or datapack is written out from its folder name. */
export const dimensionInfo = (namespace: string, name: string): { kind: DimensionKind; label: string } =>
    KINDS[`${namespace}:${name}`] || {
        kind: 'custom',
        label: namespace === 'minecraft' ? titled(name) : `${titled(name)} (${namespace})`,
    };

/** A folder name is one path segment, so it can not be used to reach anything outside the world. */
export const isSafeSegment = (name: string): boolean => /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..';

// ---- seeds -----------------------------------------------------------------------------------------------------------

const INT64_MIN = BigInt('-9223372036854775808');
const INT64_MAX = BigInt('9223372036854775807');

/** Java's String.hashCode, which is how the game turns a seed that is not a number into one. */
export const javaHashCode = (text: string): number => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;

    return hash;
};

/** What was typed into a seed field, as the game reads it: a number as it is, anything else through hashCode. */
export const parseSeedInput = (text: string): bigint | null => {
    const value = text.trim();
    if (value === '') return null;
    if (/^-?\d+$/.test(value)) {
        const number = BigInt(value);

        // A number that does not fit is text to the game as well.
        if (number >= INT64_MIN && number <= INT64_MAX) return number;
    }

    return BigInt(javaHashCode(value));
};

/** The seed of a world_gen_settings.dat, null when the file has none. */
export const readSeed = (file: NbtFile): bigint | null => {
    const tag = getTag(file.root, 'data', 'seed');

    return tag && tag.t === 4 ? tag.v : null;
};

/** A copy of the file with another seed. Everything else in it stays as it was. */
export const withSeed = (file: NbtFile, seed: bigint): NbtFile => {
    if (!readSeed(file)) throw new Error('This file has no seed to change.');

    return { name: file.name, root: withTag(file.root, ['data', 'seed'], { t: 4, v: seed }) };
};
