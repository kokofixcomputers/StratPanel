import fs from 'fs';
import path from 'path';
import {
    accentScales,
    BASE_NEUTRAL,
    buildThemeCss,
    DEFAULT_CONFIG,
    luminance,
    presetConfig,
    PRESETS,
    tintedNeutral,
    withDefaults,
} from '@/lib/themeConfig';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scales } = require('../assets/css/palette');

describe('themeConfig', () => {
    it('makes no CSS for the default look', () => {
        expect(buildThemeCss(DEFAULT_CONFIG)).toBe('');
        expect(buildThemeCss(presetConfig('default'))).toBe('');
    });

    it('keeps the base surfaces equal to the palette', () => {
        expect(BASE_NEUTRAL.light).toEqual(
            Object.fromEntries(Object.entries(scales.neutral.light).map(([k, v]) => [k, v]))
        );
        expect(BASE_NEUTRAL.dark).toEqual(
            Object.fromEntries(Object.entries(scales.neutral.dark).map(([k, v]) => [k, v]))
        );
    });

    it('turns an accent into ten shades per theme, white text staying readable on 600', () => {
        for (const accent of ['#1447e6', '#facc15', '#000000', '#ffffff', '#e11d48']) {
            const { light, dark } = accentScales(accent);
            expect(Object.keys(light)).toHaveLength(10);
            expect(Object.keys(dark)).toHaveLength(10);
            // White text on the button colour needs a contrast of about 3:1 or more.
            expect(1.05 / (luminance(light[600]) + 0.05)).toBeGreaterThan(2.9);
            // The accent has to be seen on the dark surfaces.
            expect((luminance(dark[600]) + 0.05) / (luminance(BASE_NEUTRAL.dark[700]) + 0.05)).toBeGreaterThan(2.5);
        }
    });

    it('tints the surfaces but keeps cards white in the light theme', () => {
        const tinted = tintedNeutral('#0e7490');
        expect(tinted.light[700]).toBe('#ffffff');
        expect(tinted.dark[700]).not.toBe(BASE_NEUTRAL.dark[700]);
    });

    it('writes the layout, shape and background variables', () => {
        const css = buildThemeCss(
            withDefaults({
                layout: 'grid',
                columns: 3,
                radius: 'pill',
                buttons: 'pill',
                glass: 40,
                glassBlur: 12,
                background: { image: 'gradient:aurora', blur: 8, dim: 20 },
            })
        );
        expect(css).toContain('--server-columns: 3;');
        expect(css).toContain('--r-xl: 1.75rem;');
        expect(css).toContain('--btn-radius: 9999px;');
        expect(css).toContain('--card-alpha: 0.6;');
        expect(css).toContain('--bg-blur: 8px;');
        expect(css).toContain('--bg-dim: 0.2;');
        expect(css).toContain('linear-gradient(');
    });

    it('only ever writes custom properties inside the two page blocks', () => {
        for (const preset of PRESETS) {
            const css = buildThemeCss(presetConfig(preset.id));
            for (const line of css.split('\n').filter(Boolean)) {
                expect(line).toMatch(
                    /^(html:root \{|html\.dark \{|\}|\s{4}--[a-z0-9-]+: [A-Za-z0-9 ._,%#()/"'+*-]+;)$/
                );
            }
        }
    });

    it('matches the sample the PHP tests check', () => {
        const sample = fs.readFileSync(path.join(__dirname, '../../../tests/Fixtures/theme.css'), 'utf8').trim();
        expect(buildThemeCss(presetConfig('glass'))).toBe(sample);
    });
});
