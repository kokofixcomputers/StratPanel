/**
 * The type of a world is the level-type of server.properties and, for Superflat, the layers in generator-settings. It
 * only matters when a world is generated, an existing world keeps the type it was made with.
 */
export type WorldType = 'normal' | 'flat' | 'large_biomes' | 'amplified';

export const WORLD_TYPES: { id: WorldType; label: string; description: string }[] = [
    { id: 'normal', label: 'Default', description: 'The normal world with hills, caves and oceans.' },
    { id: 'flat', label: 'Superflat', description: 'A flat world made of layers, good for building.' },
    { id: 'large_biomes', label: 'Large Biomes', description: 'Like the default, with biomes that are much bigger.' },
    {
        id: 'amplified',
        label: 'Amplified',
        description: 'Extreme mountains and a very tall world. Needs a strong server.',
    },
];

/** The type in a value of level-type. The game writes `minecraft\:flat`, older versions used FLAT and LARGEBIOMES. */
export const parseWorldType = (raw: string): WorldType | null => {
    const value = raw
        .replace(/\\/g, '')
        .trim()
        .toLowerCase()
        .replace(/^minecraft:/, '');

    switch (value) {
        case '':
        case 'default':
        case 'normal':
            return 'normal';
        case 'flat':
            return 'flat';
        case 'largebiomes':
        case 'large_biomes':
            return 'large_biomes';
        case 'amplified':
            return 'amplified';
        default:
            // Custom and single biome worlds are left alone.
            return null;
    }
};

const LEGACY: Record<WorldType, string> = {
    normal: 'DEFAULT',
    flat: 'FLAT',
    large_biomes: 'LARGEBIOMES',
    amplified: 'AMPLIFIED',
};

/**
 * The value to write for a type, in the style the server already uses: the names of before 1.16 when the file has
 * them (`FLAT`), the ids of the game otherwise (`minecraft\:flat`, the colon is escaped as in a properties file).
 */
export const formatWorldType = (type: WorldType, current: string): string =>
    current.trim() !== '' && !current.includes(':') && !current.includes('minecraft')
        ? LEGACY[type]
        : `minecraft\\:${type}`;

export interface FlatPreset {
    id: string;
    label: string;
    description: string;
    // The generator-settings of 1.16 and newer.
    settings: string;
}

const layers = (list: [string, number][]) => list.map(([block, height]) => ({ block: `minecraft:${block}`, height }));

const preset = (id: string, label: string, description: string, settings: object): FlatPreset => ({
    id,
    label,
    description,
    settings: JSON.stringify(settings),
});

export const FLAT_PRESETS: FlatPreset[] = [
    preset('classic', 'Classic Flat', 'Bedrock, two layers of dirt and grass, with villages.', {
        biome: 'minecraft:plains',
        features: false,
        lakes: false,
        layers: layers([
            ['bedrock', 1],
            ['dirt', 2],
            ['grass_block', 1],
        ]),
        structure_overrides: ['minecraft:villages'],
    }),
    preset('void', 'Void', 'Nothing at all, a world to build in the air.', {
        biome: 'minecraft:the_void',
        features: false,
        lakes: false,
        layers: layers([['air', 1]]),
    }),
    preset('tunnelers', "Tunnelers' Dream", 'A thick layer of stone to dig through, with mineshafts and strongholds.', {
        biome: 'minecraft:windswept_hills',
        features: true,
        lakes: false,
        layers: layers([
            ['bedrock', 1],
            ['stone', 230],
            ['dirt', 5],
            ['grass_block', 1],
        ]),
        structure_overrides: ['minecraft:mineshafts', 'minecraft:strongholds'],
    }),
    preset('redstone', 'Redstone Ready', 'A sandstone desert, level and empty, made for redstone.', {
        biome: 'minecraft:desert',
        features: false,
        lakes: false,
        layers: layers([
            ['bedrock', 1],
            ['stone', 3],
            ['sandstone', 116],
        ]),
    }),
];

/** JSON with the keys of every object in order, so two spellings of the same layers compare equal. */
const canonical = (value: unknown): string =>
    Array.isArray(value)
        ? `[${value.map(canonical).join(',')}]`
        : value && typeof value === 'object'
        ? `{${Object.keys(value as object)
              .sort()
              .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
              .join(',')}}`
        : JSON.stringify(value);

/** Which preset a generator-settings value is, '' for none and 'custom' for layers somebody wrote by hand. */
export const matchFlatPreset = (raw: string): string => {
    const value = raw.trim();
    if (value === '' || value === '{}') return '';

    try {
        const wanted = canonical(JSON.parse(value));

        return FLAT_PRESETS.find((p) => canonical(JSON.parse(p.settings)) === wanted)?.id || 'custom';
    } catch (e) {
        // The older format, a line such as 2;7,2x3,2;1;village.
        return 'custom';
    }
};

/**
 * What to write into server.properties for a type of world. For Superflat the layers come with it: a preset, or '' for the
 * default layers, while 'custom' keeps what somebody wrote by hand. Leaving Superflat clears layers that came from a preset.
 */
export const worldTypeProperties = (
    type: WorldType,
    flat: string,
    current: { levelType: string; generatorSettings: string }
): Record<string, string> => {
    const values: Record<string, string> = { 'level-type': formatWorldType(type, current.levelType) };

    if (type === 'flat') {
        if (flat !== 'custom') values['generator-settings'] = FLAT_PRESETS.find((p) => p.id === flat)?.settings || '{}';
    } else if (FLAT_PRESETS.some((p) => p.id === matchFlatPreset(current.generatorSettings))) {
        values['generator-settings'] = '{}';
    }

    return values;
};
