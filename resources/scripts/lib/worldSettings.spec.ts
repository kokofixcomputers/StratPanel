import {
    readWorldSettings,
    validateWorldSettings,
    worldFolders,
    worldProperties,
    WorldSettings,
} from '@/lib/worldSettings';

const base: WorldSettings = { name: 'world', seed: '', type: 'normal', layers: '', structures: true, hardcore: false };

describe('readWorldSettings', () => {
    it('reads the properties of a server', () => {
        expect(
            readWorldSettings({
                'level-name': 'survival',
                'level-seed': '12345',
                'level-type': 'minecraft\\:flat',
                'generator-settings': '{"layers":[]}',
                'generate-structures': 'false',
                hardcore: 'true',
            })
        ).toEqual({
            name: 'survival',
            seed: '12345',
            type: 'flat',
            layers: '{"layers":[]}',
            structures: false,
            hardcore: true,
        });
    });

    it('has defaults for a server that never ran', () => {
        expect(readWorldSettings({})).toEqual(base);
    });

    it('shows a type it does not know as Default', () => {
        expect(readWorldSettings({ 'level-type': 'terralith' }).type).toBe('normal');
    });
});

describe('validateWorldSettings', () => {
    it('accepts good settings', () => {
        expect(validateWorldSettings(base)).toBeNull();
        expect(validateWorldSettings({ ...base, type: 'flat', layers: '{"layers":[]}' })).toBeNull();
    });

    it('refuses a folder name that could leave the server folder', () => {
        expect(validateWorldSettings({ ...base, name: '../x' })).toMatch(/folder name/);
        expect(validateWorldSettings({ ...base, name: '' })).toMatch(/folder name/);
    });

    it('refuses layers that are not JSON', () => {
        expect(validateWorldSettings({ ...base, type: 'flat', layers: '2;minecraft:stone' })).toMatch(/layers/);
    });
});

describe('worldProperties', () => {
    const current = { levelType: 'minecraft\\:normal', generatorSettings: '' };

    it('writes the world, the seed and the switches', () => {
        expect(
            worldProperties({ ...base, name: 'new', seed: ' 42 ', structures: false, hardcore: true }, current)
        ).toMatchObject({
            'level-name': 'new',
            'level-seed': '42',
            'generate-structures': 'false',
            hardcore: 'true',
            'level-type': 'minecraft\\:normal',
        });
    });

    it('writes the layers of a Superflat world, or the default ones when there are none', () => {
        const layers = '{"biome":"minecraft:plains","layers":[{"block":"minecraft:stone","height":1}]}';

        expect(worldProperties({ ...base, type: 'flat', layers }, current)).toMatchObject({
            'level-type': 'minecraft\\:flat',
            'generator-settings': layers,
        });
        expect(worldProperties({ ...base, type: 'flat' }, current)['generator-settings']).toBe('{}');
    });

    it('keeps the old style of the type', () => {
        expect(
            worldProperties({ ...base, type: 'flat' }, { levelType: 'DEFAULT', generatorSettings: '' })['level-type']
        ).toBe('FLAT');
    });

    it('keeps one line per value', () => {
        expect(worldProperties({ ...base, seed: 'a\nb' }, current)['level-seed']).toBe('a b');
    });
});

describe('worldFolders', () => {
    it('lists the folders of the world that are there', () => {
        expect(worldFolders('world', new Set(['world', 'world_nether', 'plugins']))).toEqual(['world', 'world_nether']);
        expect(worldFolders('world', new Set())).toEqual([]);
    });
});
