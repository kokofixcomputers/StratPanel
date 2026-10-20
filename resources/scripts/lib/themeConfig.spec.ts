import fs from 'fs';
import path from 'path';
import {
    accentScales,
    BASE_NEUTRAL,
    buildThemeCss,
    DEFAULT_CONFIG,
    DEFAULT_LOGIN,
    DEFAULT_MOTION,
    themeAttributes,
    glassOf,
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
                material: 'custom',
                glass: 40,
                glassBlur: 12,
                background: { image: 'gradient:paper', blur: 8, dim: 20 },
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

    it('writes status and surface colours for the right theme', () => {
        const css = buildThemeCss(
            withDefaults({
                status: { success: '#0d9488', danger: '#be123c', warning: null },
                surface: {
                    light: { page: '#fdf6e3', card: null, border: null, text: null, muted: null },
                    dark: { page: null, card: '#1a1d29', border: null, text: '#eeeeee', muted: null },
                },
            })
        );
        const [light, dark] = css.split('html.dark');
        expect(light).toContain('--c-green-600:');
        expect(light).toContain('--c-red-600:');
        expect(light).not.toContain('--c-yellow-600:');
        expect(light).toContain('--c-neutral-800: 253 246 227;');
        expect(dark).toContain('--c-neutral-700: 26 29 41;');
        expect(dark).toContain('--c-neutral-50: 238 238 238;');
        expect(dark).not.toContain('--c-neutral-800');
    });

    it('gives a gradient to each theme and a picture to both', () => {
        const css = buildThemeCss(withDefaults({ background: { image: 'gradient:paper', blur: 0, dim: 0 } }));
        const [light, dark] = css.split('html.dark');
        expect(light).toContain('--bg-image: linear-gradient(135deg, #f6f7f9');
        expect(dark).toContain('--bg-image: linear-gradient(135deg, #0c1017');
        expect(buildThemeCss(withDefaults({ background: { image: '/branding/a.png', blur: 0, dim: 0 } }))).toContain(
            '--bg-image: url("/branding/a.png");'
        );
    });

    it('takes the see-through amount from the material', () => {
        expect(glassOf(withDefaults({ material: 'off', glass: 50 }))).toEqual({ glass: 0, blur: 0 });
        expect(glassOf(withDefaults({ material: 'frosted' })).glass).toBeGreaterThan(30);
        expect(glassOf(withDefaults({ material: 'custom', glass: 25, glassBlur: 7 }))).toEqual({ glass: 25, blur: 7 });
        expect(buildThemeCss(withDefaults({ material: 'subtle' }))).toContain('--card-alpha: 0.92;');
    });

    it('sets an exact radius and the text size', () => {
        const css = buildThemeCss(withDefaults({ radiusCustom: 10, fontScale: 110 }));
        expect(css).toContain('--r-lg: 10px;');
        expect(css).toContain('--font-scale: 110;');
    });

    it('turns the settings that are marks on the page into attributes', () => {
        const attributes = themeAttributes(
            withDefaults({
                chrome: 'floating',
                buttonStyle: 'outline',
                motion: { ...DEFAULT_MOTION, buttonHover: 'glow', pulse: true },
            })
        );
        expect(attributes['data-chrome']).toBe('floating');
        expect(attributes['data-btn-style']).toBe('outline');
        expect(attributes['data-btn-hover']).toBe('glow');
        expect(attributes['data-pulse']).toBe('true');
        expect(attributes['data-row-size']).toBe('medium');
        for (const value of Object.values(attributes)) expect(value).toMatch(/^[a-z0-9-]{1,20}$/);
    });

    it('writes width, sidebar and type variables', () => {
        const css = buildThemeCss(
            withDefaults({ pageWidth: 'wide', sidebarWidth: 'narrow', headingWeight: 800, tracking: 'tight' })
        );
        expect(css).toContain('--page-max: 1536px;');
        expect(css).toContain('--sidebar-width: 14rem;');
        expect(css).toContain('--heading-weight: 800;');
        expect(css).toContain('--tracking: -0.02em;');
    });

    it('writes the background of the login pages', () => {
        const gradient = buildThemeCss(
            withDefaults({ login: { ...DEFAULT_LOGIN, background: 'gradient', gradient: 'sage' } })
        );
        const [light, dark] = gradient.split('html.dark');
        expect(light).toContain('--login-gradient: linear-gradient(150deg, #f5f8f5');
        expect(dark).toContain('--login-gradient: linear-gradient(150deg, #0b110e');

        const image = buildThemeCss(
            withDefaults({
                login: { ...DEFAULT_LOGIN, background: 'image', image: '/branding/a.jpg', blur: 6, dim: 40 },
            })
        );
        expect(image).toContain('--login-image: url("/branding/a.jpg");');
        expect(image).toContain('--login-blur: 6px;');
        expect(image).toContain('--login-dim: 0.4;');

        // Nothing for the layouts and the animated backgrounds that draw themselves, apart from the dimming.
        expect(
            buildThemeCss(withDefaults({ login: { ...DEFAULT_LOGIN, layout: 'split', background: 'squares', dim: 0 } }))
        ).toBe('');
        expect(buildThemeCss(withDefaults({}))).toBe('');
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
