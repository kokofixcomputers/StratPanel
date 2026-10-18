import { paintTrim, Rgba, trimOverlayUrl, trimPaletteName, trimPaletteUrl, trimPieceOf } from '@/lib/trims';

describe('lib/trims', () => {
    it('knows the piece of armor an item is', () => {
        expect(trimPieceOf('minecraft:iron_helmet')).toBe('helmet');
        expect(trimPieceOf('minecraft:netherite_chestplate')).toBe('chestplate');
        expect(trimPieceOf('minecraft:golden_leggings')).toBe('leggings');
        expect(trimPieceOf('mymod:ruby_boots')).toBe('boots');
        expect(trimPieceOf('minecraft:elytra')).toBeNull();
        expect(trimPieceOf('minecraft:diamond_sword')).toBeNull();
        expect(trimPieceOf('minecraft:turtle_helmet')).toBe('helmet');
    });

    it('paints with the palette of the material', () => {
        expect(trimPaletteName('minecraft:iron_helmet', 'gold')).toBe('gold');
        expect(trimPaletteName('minecraft:iron_helmet', 'minecraft:quartz')).toBe('quartz');
        expect(trimPaletteName('minecraft:diamond_boots', 'resin')).toBe('resin');
    });

    it('uses the darker palette for armor made of the material of its own trim', () => {
        expect(trimPaletteName('minecraft:iron_helmet', 'iron')).toBe('iron_darker');
        expect(trimPaletteName('minecraft:diamond_chestplate', 'diamond')).toBe('diamond_darker');
        expect(trimPaletteName('minecraft:netherite_leggings', 'netherite')).toBe('netherite_darker');
        // Golden armor is made of "gold".
        expect(trimPaletteName('minecraft:golden_boots', 'gold')).toBe('gold_darker');
        expect(trimPaletteName('minecraft:copper_helmet', 'copper')).toBe('copper_darker');
        // Another material on the same armor is not darker, and chainmail has no material of its own to match.
        expect(trimPaletteName('minecraft:golden_boots', 'iron')).toBe('iron');
        expect(trimPaletteName('minecraft:chainmail_helmet', 'iron')).toBe('iron');
        // Materials without a darker palette never get one.
        expect(trimPaletteName('minecraft:leather_helmet', 'amethyst')).toBe('amethyst');
    });

    it('has no palette for a material the game does not have', () => {
        expect(trimPaletteName('minecraft:iron_helmet', 'mymod:ruby')).toBeNull();
        expect(trimPaletteName('minecraft:iron_helmet', 'ruby')).toBeNull();
    });

    it('finds the pictures in the folders of the texture packs', () => {
        expect(trimOverlayUrl('26.3', 'helmet')).toBe('/tools/mc-assets/26.3/trims/items/helmet_trim.png');
        expect(trimPaletteUrl('1.21.1', 'trim_palette')).toBe(
            '/tools/mc-assets/1.21.1/trims/color_palettes/trim_palette.png'
        );
    });

    const key: Rgba[] = [224, 192, 160, 128, 96, 64, 32, 0].map((g) => [g, g, g, 255]);
    const gold: Rgba[] = [
        [255, 253, 144, 255],
        [236, 217, 63, 255],
        [222, 177, 45, 255],
        [177, 103, 18, 255],
        [160, 69, 10, 255],
        [128, 53, 3, 255],
        [113, 45, 0, 255],
        [87, 35, 0, 255],
    ];

    it('paints each grey with the colour at its place in the palette', () => {
        // Two opaque pixels (224 is the first colour, 32 the seventh) and a transparent one.
        const pixels = new Uint8ClampedArray([224, 224, 224, 255, 32, 32, 32, 255, 160, 160, 160, 0]);

        const painted = paintTrim(pixels, key, gold);

        expect(Array.from(painted)).toEqual([255, 253, 144, 255, 113, 45, 0, 255, 160, 160, 160, 0]);
        // The picture that came in is not changed.
        expect(pixels[0]).toBe(224);
    });

    it('keeps the transparency of the pixels and sends an unknown grey to the nearest one', () => {
        const painted = paintTrim(new Uint8ClampedArray([170, 170, 170, 128]), key, gold);

        // 170 is closest to 160, the third colour; the pixel was half see-through and stays so.
        expect(Array.from(painted)).toEqual([222, 177, 45, 128]);
    });

    it('does nothing without palettes', () => {
        const pixels = new Uint8ClampedArray([224, 224, 224, 255]);

        expect(Array.from(paintTrim(pixels, [], gold))).toEqual([224, 224, 224, 255]);
        expect(Array.from(paintTrim(pixels, key, []))).toEqual([224, 224, 224, 255]);
    });
});
