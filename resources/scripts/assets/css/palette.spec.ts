/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scales, singles } = require('./palette');

const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8');

describe('palette', () => {
    it('has every shade in both themes', () => {
        for (const [name, scale] of Object.entries<any>(scales)) {
            expect(Object.keys(scale.dark)).toEqual(Object.keys(scale.light));
            for (const value of [...Object.values<string>(scale.light), ...Object.values<string>(scale.dark)])
                expect(value).toMatch(/^#[0-9a-f]{6}$/i);
            expect(name).toBeTruthy();
        }
    });

    it('is written to theme.css for the light, dark and forced light blocks', () => {
        expect(css).toMatch(/:root \{/);
        expect(css).toMatch(/\.dark \{/);
        expect(css).toMatch(/\.theme-light \{/);
        for (const name of Object.keys(singles)) expect(css).toContain(`--c-${name}:`);
        for (const [name, scale] of Object.entries<any>(scales))
            for (const shade of Object.keys(scale.light)) expect(css).toContain(`--c-${name}-${shade}:`);
    });

    it('keeps text readable on the dark card colour', () => {
        const luminance = (hex: string) => {
            const n = parseInt(hex.slice(1), 16);
            const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const ratio = (a: string, b: string) => {
            const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
            return (x + 0.05) / (y + 0.05);
        };
        const card = singles.white.dark;
        expect(ratio(scales.neutral.dark[50], card)).toBeGreaterThan(7);
        expect(ratio(scales.neutral.dark[300], card)).toBeGreaterThan(4.5);
        expect(ratio(scales.primary.dark[700], card)).toBeGreaterThan(4.5);
    });
});
