/** Small colour helpers for the theme editor and the console. */
export type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
    const n = parseInt(hex.replace('#', ''), 16);

    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const toHex = (rgb: RGB): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const triplet = (hex: string): string => hexToRgb(hex).join(' ');

/** `amount` of a, the rest of b. */
export const mix = (a: string, b: string, amount: number): string => {
    const x = hexToRgb(a);
    const y = hexToRgb(b);

    return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)) as RGB);
};

export const luminance = (hex: string): number => {
    const [r, g, b] = hexToRgb(hex).map((v) => {
        const c = v / 255;

        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
