import { FLAT_PRESETS, formatWorldType, matchFlatPreset, parseWorldType, worldTypeProperties } from './worldType';

describe('parseWorldType', () => {
    it('reads the ids of the game and the older names', () => {
        expect(parseWorldType('minecraft\\:flat')).toBe('flat');
        expect(parseWorldType('minecraft:normal')).toBe('normal');
        expect(parseWorldType('FLAT')).toBe('flat');
        expect(parseWorldType('LARGEBIOMES')).toBe('large_biomes');
        expect(parseWorldType('minecraft\\:large_biomes')).toBe('large_biomes');
        expect(parseWorldType('AMPLIFIED')).toBe('amplified');
        expect(parseWorldType('DEFAULT')).toBe('normal');
    });

    it('takes an empty value as the default and leaves other types alone', () => {
        expect(parseWorldType('')).toBe('normal');
        expect(parseWorldType('minecraft\\:single_biome_surrounding')).toBeNull();
        expect(parseWorldType('somemod\\:custom')).toBeNull();
    });
});

describe('formatWorldType', () => {
    it('writes the ids of the game, like the game does', () => {
        expect(formatWorldType('flat', 'minecraft\\:normal')).toBe('minecraft\\:flat');
        expect(formatWorldType('amplified', '')).toBe('minecraft\\:amplified');
    });

    it('keeps to the old names on a server that uses them', () => {
        expect(formatWorldType('flat', 'DEFAULT')).toBe('FLAT');
        expect(formatWorldType('large_biomes', 'normal')).toBe('LARGEBIOMES');
    });
});

describe('flat presets', () => {
    it('are valid and recognised again', () => {
        FLAT_PRESETS.forEach((p) => {
            expect(() => JSON.parse(p.settings)).not.toThrow();
            expect(matchFlatPreset(p.settings)).toBe(p.id);
        });
    });

    it('recognises none, custom layers and the older format', () => {
        expect(matchFlatPreset('')).toBe('');
        expect(matchFlatPreset('{}')).toBe('');
        expect(matchFlatPreset('{"layers":[{"block":"minecraft:stone","height":4}]}')).toBe('custom');
        expect(matchFlatPreset('2;7,2x3,2;1;village')).toBe('custom');
    });

    it('does not mind the order of the keys', () => {
        const reordered = JSON.stringify(
            Object.fromEntries(Object.entries(JSON.parse(FLAT_PRESETS[0].settings)).reverse())
        );

        expect(matchFlatPreset(reordered)).toBe('classic');
    });
});

describe('worldTypeProperties', () => {
    const modern = { levelType: 'minecraft\\:normal', generatorSettings: '{}' };

    it('writes the type and the layers of a preset for Superflat', () => {
        expect(worldTypeProperties('flat', 'void', modern)).toEqual({
            'level-type': 'minecraft\\:flat',
            'generator-settings': FLAT_PRESETS.find((p) => p.id === 'void')!.settings,
        });
    });

    it('uses the default layers for Superflat without a preset', () => {
        expect(worldTypeProperties('flat', '', modern)['generator-settings']).toBe('{}');
    });

    it('keeps layers that were written by hand', () => {
        expect(worldTypeProperties('flat', 'custom', { ...modern, generatorSettings: '{"layers":[]}' })).toEqual({
            'level-type': 'minecraft\\:flat',
        });
    });

    it('clears the layers of a preset when leaving Superflat, but not the ones written by hand', () => {
        const withPreset = { levelType: 'minecraft\\:flat', generatorSettings: FLAT_PRESETS[1].settings };

        expect(worldTypeProperties('amplified', '', withPreset)).toEqual({
            'level-type': 'minecraft\\:amplified',
            'generator-settings': '{}',
        });
        expect(worldTypeProperties('normal', '', { ...withPreset, generatorSettings: '{"layers":[]}' })).toEqual({
            'level-type': 'minecraft\\:normal',
        });
    });
});
