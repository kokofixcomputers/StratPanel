/**
 * Armor trims on the icon of an item, drawn the way the game draws them: the icon of the armor with a second layer on top, a grey
 * picture per piece (helmet, chestplate, leggings, boots) that is painted with the colours of the material of the trim. The pattern
 * of the trim does not change the icon, only the armor on a player shows it (the game does the same). The grey levels of the
 * layer are the 8 greys of trim_palette.png, and the palette of the material (such as gold.png) has the colour for each of them.
 */
export type Rgba = [number, number, number, number];

export type TrimPiece = 'helmet' | 'chestplate' | 'leggings' | 'boots';

const PIECES: TrimPiece[] = ['helmet', 'chestplate', 'leggings', 'boots'];

/** The materials the game has. A modded material has no palette here and no layer is drawn for it. */
export const TRIM_MATERIALS = [
    'amethyst',
    'copper',
    'diamond',
    'emerald',
    'gold',
    'iron',
    'lapis',
    'netherite',
    'quartz',
    'redstone',
    'resin',
];

// Armor made of the same material as its trim gets the darker colours, so the trim can be seen at all.
const DARKER = new Set(['copper', 'diamond', 'gold', 'iron', 'netherite']);

const ARMOR = /^(?:[a-z0-9_.-]+:)?([a-z]+)_(helmet|chestplate|leggings|boots)$/;

/** The piece of armor an item is, null for anything else. */
export const trimPieceOf = (itemId: string): TrimPiece | null => {
    const match = ARMOR.exec(itemId);

    return match && PIECES.includes(match[2] as TrimPiece) ? (match[2] as TrimPiece) : null;
};

/**
 * The palette to paint the trim of an armor item with, such as "gold" or "iron_darker", null when the material is not one of the
 * game's. Golden armor is made of "gold", and armor made of the material of its own trim gets the darker palette.
 */
export const trimPaletteName = (itemId: string, material: string): string | null => {
    const name = material.replace(/^minecraft:/, '');
    if (!TRIM_MATERIALS.includes(name)) return null;

    const armor = ARMOR.exec(itemId)?.[1];
    const armorMaterial = armor === 'golden' ? 'gold' : armor;

    return armorMaterial === name && DARKER.has(name) ? `${name}_darker` : name;
};

export const trimOverlayUrl = (version: string, piece: TrimPiece, base = '/tools/mc-assets'): string =>
    `${base}/${version}/trims/items/${piece}_trim.png`;

export const trimPaletteUrl = (version: string, palette: string, base = '/tools/mc-assets'): string =>
    `${base}/${version}/trims/color_palettes/${palette}.png`;

/**
 * Paints the grey layer with a palette: every pixel that has one of the greys of the key palette gets the colour of the same place
 * in the palette of the material. A grey that is not in the key goes to the nearest one. Transparent pixels stay as they are.
 */
export const paintTrim = (pixels: Uint8ClampedArray, key: Rgba[], palette: Rgba[]): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(pixels);
    if (!key.length || !palette.length) return out;

    for (let i = 0; i < out.length; i += 4) {
        if (out[i + 3] === 0) continue;

        let best = 0;
        let distance = Infinity;
        key.forEach((color, index) => {
            const d = (color[0] - out[i]) ** 2 + (color[1] - out[i + 1]) ** 2 + (color[2] - out[i + 2]) ** 2;
            if (d < distance) {
                distance = d;
                best = index;
            }
        });

        const color = palette[Math.min(best, palette.length - 1)];
        out[i] = color[0];
        out[i + 1] = color[1];
        out[i + 2] = color[2];
    }

    return out;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`could not load ${url}`));
        image.src = url;
    });

const draw = (image: HTMLImageElement): { canvas: HTMLCanvasElement; data: ImageData } => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0);

    return { canvas, data: context.getImageData(0, 0, canvas.width, canvas.height) };
};

const colorsOf = (image: HTMLImageElement): Rgba[] => {
    const { data } = draw(image);
    const colors: Rgba[] = [];
    for (let i = 0; i < data.data.length; i += 4) {
        colors.push([data.data[i], data.data[i + 1], data.data[i + 2], data.data[i + 3]]);
    }

    return colors;
};

const cache = new Map<string, Promise<string | null>>();

/**
 * The layer of a trim as a picture ready to lay over the icon of the armor, null when the pack has no such layer or palette (an older
 * version has no resin, say). Made once for each combination.
 */
export const trimOverlay = (version: string, piece: TrimPiece, palette: string): Promise<string | null> => {
    const key = `${version}|${piece}|${palette}`;
    const known = cache.get(key);
    if (known) return known;

    const made = (async () => {
        try {
            const [base, keyImage, paletteImage] = await Promise.all([
                loadImage(trimOverlayUrl(version, piece)),
                loadImage(trimPaletteUrl(version, 'trim_palette')),
                loadImage(trimPaletteUrl(version, palette)),
            ]);
            const { canvas, data } = draw(base);
            const painted = paintTrim(data.data, colorsOf(keyImage), colorsOf(paletteImage));
            canvas.getContext('2d')!.putImageData(new ImageData(painted, canvas.width, canvas.height), 0, 0);

            return canvas.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    })();
    cache.set(key, made);

    return made;
};
