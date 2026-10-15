/**
 * How a block that has no picture of its own as an item is drawn in the inventory: as the little 3D block the game shows,
 * or as a flat sprite for plants and torches. This only decides what to draw and with which textures, from the entry of the
 * block in blocks_models.json of the tools (the model of the block with its textures). lib/blockIcon.ts draws it.
 */

export interface ModelEntry {
    parent?: string;
    textures?: Record<string, string>;
    elements?: unknown[];
}

export type Shape = 'cube' | 'slab' | 'stairs' | 'flat';

export interface BlockPlan {
    shape: Shape;
    // The names of the texture files in blocks/, without the extension.
    top: string;
    // The face on the left of the block in the picture, the front of a furnace.
    left: string;
    right: string;
    // A picture drawn over the sides, grass on the edge of a grass block. Tinted.
    overlay?: string;
    // The colour textures are multiplied with, as the game does for grass and leaves (#rrggbb).
    tint: { top?: string; sides?: string; overlay?: string };
}

/** What the game uses for grass and foliage in a plains biome. */
export const GRASS = '#79c05a';
const FOLIAGE = '#77ab2f';

const textureName = (ref: string | undefined): string | undefined =>
    ref ? ref.replace(/^(?:minecraft:)?block\//, '').replace(/^minecraft:/, '') : undefined;

const FLAT_NAMES =
    /(^|_)(sapling|torch|rail|rails|ladder|vine|vines|fern|flower|tulip|mushroom|dandelion|poppy|allium|bluet|daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|dead_bush|short_grass|tall_grass|seagrass|sugar_cane|roots|sprouts|lever|tripwire_hook|redstone_torch|lantern)$|^(grass|fern|large_fern|dead_bush|bamboo|sugar_cane|lily_pad|cobweb|torch|redstone_torch|soul_torch|copper_torch|lever|tripwire_hook|nether_sprouts|crimson_roots|warped_roots|hanging_roots)$/;

const isFlat = (name: string, parent: string): boolean =>
    /(^|\/)(cross|tinted_cross|template_torch|template_wall_torch|crop|flower_pot_cross)$/.test(parent) ||
    parent.includes('rail') ||
    FLAT_NAMES.test(name);

const LEAVES: Record<string, string> = {
    birch_leaves: '#80a755',
    spruce_leaves: '#619961',
};

/** The colours the game tints the textures of a block with in the inventory, nothing for the many that have none. */
const tintFor = (name: string): BlockPlan['tint'] => {
    if (name === 'grass_block') return { top: GRASS, overlay: GRASS };
    if (name.endsWith('_leaves')) {
        if (/^(azalea|flowering_azalea|cherry|pale_oak)/.test(name)) return {};
        const colour = LEAVES[name] || FOLIAGE;

        return { top: colour, sides: colour };
    }
    if (['short_grass', 'grass', 'fern', 'large_fern', 'tall_grass', 'sugar_cane'].includes(name))
        return { top: GRASS };
    if (name === 'vine' || name === 'lily_pad') return { top: FOLIAGE };

    return {};
};

const first = (textures: Record<string, string>, keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = textureName(textures[key]);
        if (value) return value;
    }

    return undefined;
};

/**
 * How to draw a block, null when nothing about it says what it looks like. The entry is the one of the block in
 * blocks_models.json, undefined for a block that is not in it, then the texture with the name of the block is tried.
 */
export const planBlock = (name: string, entry: ModelEntry | undefined): BlockPlan | null => {
    const parent = (entry?.parent || '').replace(/^minecraft:/, '');
    const textures = entry?.textures || {};
    const tint = tintFor(name);

    if (isFlat(name, parent)) {
        const sprite =
            first(textures, ['torch', 'cross', 'plant', 'flower', 'texture', 'rail', 'all', 'wall', 'top', 'end']) ||
            name;

        return { shape: 'flat', top: sprite, left: sprite, right: sprite, tint };
    }

    const shape: Shape = parent.includes('stairs') ? 'stairs' : parent.includes('slab') ? 'slab' : 'cube';
    // A block with nothing but a particle (a chest) has no faces to show, its particle is the closest thing.
    const top = first(textures, ['top', 'end', 'up', 'all', 'texture', 'side', 'particle']);
    const right = first(textures, ['side', 'east', 'all', 'texture', 'west', 'north', 'front', 'particle']);
    const left = first(textures, ['front', 'south', 'side', 'all', 'texture', 'north', 'particle']);
    const overlay = textureName(textures.overlay);

    if (!top && !right && !left) return { shape, top: name, left: name, right: name, tint };

    return {
        shape,
        top: top || right || left!,
        left: left || right || top!,
        right: right || left || top!,
        ...(overlay ? { overlay } : {}),
        tint,
    };
};

/** The face tint as 0 to 255 numbers, null for none. */
export const parseHex = (colour: string | undefined): [number, number, number] | null => {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour || '');

    return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : null;
};
