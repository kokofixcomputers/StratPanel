import { schematicName } from './worldEdit';

describe('schematicName', () => {
    it('keeps a clean name and adds the extension', () => {
        expect(schematicName('pixel-art')).toBe('pixel-art.schem');
        expect(schematicName('castle.schem')).toBe('castle.schem');
    });

    it('removes characters WorldEdit cannot load', () => {
        expect(schematicName('my art (1)/../x')).toBe('my_art_1_.._x.schem');
        expect(schematicName('...')).toBe('schematic.schem');
        expect(schematicName('')).toBe('schematic.schem');
    });
});
