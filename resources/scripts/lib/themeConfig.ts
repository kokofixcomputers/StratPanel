/**
 * The look an admin builds in the theme editor (components/admin/ThemeEditor.tsx). The settings are kept as they are, and turned into a
 * few blocks of CSS variables (buildThemeCss) that the styles of the panel are written against: the colour scales of assets/css/theme.css,
 * and the radius, shadow, font, background and layout variables that tailwind.config.js and the global stylesheet read. The server prints
 * the CSS into every page (Services/Theme/ThemeService.php checks it first, it only lets variables through), the layout settings are read
 * from window.SiteConfiguration.theme by useThemeConfig.
 */
import { useEffect, useState } from 'react';

export type RadiusStyle = 'sharp' | 'soft' | 'round' | 'pill';
export type ButtonStyle = 'default' | 'pill' | 'square';
export type ShadowStyle = 'none' | 'soft' | 'strong';
export type FontChoice = 'inter' | 'system' | 'serif' | 'mono';

export interface ThemeConfig {
    // The colour of buttons, links and highlights.
    accent: string;
    // A colour mixed into the surfaces, borders and text greys, null keeps them neutral.
    secondary: string | null;
    // What a visitor sees who never chose light or dark.
    mode: 'system' | 'light' | 'dark';
    radius: RadiusStyle;
    buttons: ButtonStyle;
    shadow: ShadowStyle;
    density: 'comfortable' | 'compact';
    font: FontChoice;
    // The servers of the dashboard as a list or as cards side by side.
    layout: 'list' | 'grid';
    columns: 2 | 3;
    // How see-through the cards are (percent) and how much the picture behind them is blurred (pixels).
    glass: number;
    glassBlur: number;
    background: {
        // A path of this panel, an https address or "gradient:<name>".
        image: string | null;
        blur: number;
        dim: number;
    };
    // The preset this started from, for the editor only.
    preset: string | null;
}

export const DEFAULT_ACCENT = '#1447e6';

export const DEFAULT_CONFIG: ThemeConfig = {
    accent: DEFAULT_ACCENT,
    secondary: null,
    mode: 'system',
    radius: 'soft',
    buttons: 'default',
    shadow: 'soft',
    density: 'comfortable',
    font: 'inter',
    layout: 'list',
    columns: 2,
    glass: 0,
    glassBlur: 0,
    background: { image: null, blur: 0, dim: 0 },
    preset: 'default',
};

export const GRADIENTS: Record<string, { label: string; css: string }> = {
    aurora: { label: 'Aurora', css: 'linear-gradient(135deg, #0f2027 0%, #1d4e89 45%, #7b2ff7 100%)' },
    sunset: { label: 'Sunset', css: 'linear-gradient(135deg, #3a1c71 0%, #d76d77 55%, #ffaf7b 100%)' },
    ocean: { label: 'Ocean', css: 'linear-gradient(160deg, #0b132b 0%, #1c7c9c 60%, #6fe7dd 100%)' },
    forest: { label: 'Forest', css: 'linear-gradient(150deg, #0b2b1a 0%, #1f7a4d 60%, #b8e986 100%)' },
    dusk: { label: 'Dusk', css: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
    paper: { label: 'Paper', css: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
};

export const PRESETS: { id: string; name: string; config: Partial<ThemeConfig> }[] = [
    { id: 'default', name: 'Default', config: {} },
    { id: 'ocean', name: 'Ocean', config: { accent: '#0891b2', secondary: '#0e7490' } },
    { id: 'forest', name: 'Forest', config: { accent: '#16a34a', secondary: '#166534' } },
    { id: 'sunset', name: 'Sunset', config: { accent: '#ea580c', secondary: '#9a3412', radius: 'round' } },
    { id: 'violet', name: 'Violet', config: { accent: '#7c3aed', secondary: '#5b21b6', radius: 'round' } },
    { id: 'rose', name: 'Rose pill', config: { accent: '#e11d48', radius: 'pill', buttons: 'pill', shadow: 'strong' } },
    { id: 'midnight', name: 'Midnight', config: { accent: '#6366f1', secondary: '#312e81', mode: 'dark' } },
    {
        id: 'glass',
        name: 'Glass aurora',
        config: {
            accent: '#60a5fa',
            mode: 'dark',
            radius: 'round',
            shadow: 'strong',
            glass: 45,
            glassBlur: 14,
            background: { image: 'gradient:aurora', blur: 0, dim: 15 },
        },
    },
    {
        id: 'paper',
        name: 'Paper',
        config: { accent: '#111827', radius: 'sharp', buttons: 'square', shadow: 'none', font: 'mono', mode: 'light' },
    },
    {
        id: 'cards',
        name: 'Cards',
        config: { layout: 'grid', columns: 3, density: 'compact', radius: 'round' },
    },
];

export const withDefaults = (config: Partial<ThemeConfig> | null | undefined): ThemeConfig => ({
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
    background: { ...DEFAULT_CONFIG.background, ...(config?.background ?? {}) },
});

export const presetConfig = (id: string): ThemeConfig => {
    const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];

    return withDefaults({ ...preset.config, preset: preset.id });
};

// ---- colours ----------------------------------------------------------------------------------------------------------------------

type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
    const n = parseInt(hex.replace('#', ''), 16);

    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: RGB): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const triplet = (hex: string): string => hexToRgb(hex).join(' ');

/** `amount` of a, the rest of b. */
const mix = (a: string, b: string, amount: number): string => {
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

const GROUND = '#0c1017';
const WHITE = '#ffffff';
const BLACK = '#000000';

/** The surfaces of the default look (assets/css/palette.js has the same, palette.spec.ts keeps them equal). */
export const BASE_NEUTRAL = {
    light: {
        50: '#0f172a',
        100: '#1e293b',
        200: '#334155',
        300: '#475569',
        400: '#64748b',
        500: '#e5e7eb',
        600: '#f3f4f6',
        700: '#ffffff',
        800: '#f5f5f6',
        900: '#fafafa',
    } as Record<number, string>,
    dark: {
        50: '#f1f5f9',
        100: '#e2e8f0',
        200: '#cbd5e1',
        300: '#a5b1c4',
        400: '#7d8ba1',
        500: '#283142',
        600: '#1c2330',
        700: '#141a23',
        800: GROUND,
        900: '#080b10',
    } as Record<number, string>,
};

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** White text sits on the 600 shade, so it must not be too light; and it has to be seen on dark surfaces, so not too dark. */
const usable = (accent: string, mode: 'light' | 'dark'): string => {
    let color = accent;
    if (mode === 'light') {
        for (let i = 0; i < 12 && luminance(color) > 0.3; i++) color = mix(BLACK, color, 0.12);
    } else {
        for (let i = 0; i < 12 && luminance(color) < 0.12; i++) color = mix(WHITE, color, 0.12);
    }

    return color;
};

/** The shades of the accent colour for the light and for the dark theme. */
export const accentScales = (accent: string): { light: Record<number, string>; dark: Record<number, string> } => {
    const base = usable(accent, 'light');
    const light: Record<number, string> = {
        50: mix(base, WHITE, 0.08),
        100: mix(base, WHITE, 0.16),
        200: mix(base, WHITE, 0.28),
        300: mix(base, WHITE, 0.48),
        400: mix(base, WHITE, 0.72),
        500: mix(base, WHITE, 0.88),
        600: base,
        700: mix(base, BLACK, 0.83),
        800: mix(base, BLACK, 0.65),
        900: mix(base, BLACK, 0.5),
    };

    const bright = usable(accent, 'dark');
    const dark: Record<number, string> = {
        50: mix(bright, GROUND, 0.14),
        100: mix(bright, GROUND, 0.22),
        200: mix(bright, GROUND, 0.34),
        300: mix(bright, GROUND, 0.52),
        400: mix(WHITE, bright, 0.24),
        500: mix(WHITE, bright, 0.17),
        600: mix(WHITE, bright, 0.1),
        700: mix(WHITE, bright, 0.65),
        800: mix(bright, BLACK, 0.9),
        900: mix(WHITE, bright, 0.8),
    };

    return { light, dark };
};

/** The surfaces, borders and greys with a little of the secondary colour in them. */
export const tintedNeutral = (secondary: string): { light: Record<number, string>; dark: Record<number, string> } => {
    const tint = (scale: Record<number, string>, amounts: Record<number, number>) =>
        Object.fromEntries(SHADES.map((shade) => [shade, mix(secondary, scale[shade], amounts[shade])]));
    const light = tint(BASE_NEUTRAL.light, {
        50: 0.12,
        100: 0.12,
        200: 0.12,
        300: 0.1,
        400: 0.1,
        500: 0.14,
        600: 0.1,
        700: 0,
        800: 0.07,
        900: 0.05,
    });
    const dark = tint(BASE_NEUTRAL.dark, {
        50: 0.05,
        100: 0.05,
        200: 0.06,
        300: 0.08,
        400: 0.1,
        500: 0.2,
        600: 0.2,
        700: 0.18,
        800: 0.16,
        900: 0.14,
    });

    return { light, dark };
};

// ---- the rest of the look ---------------------------------------------------------------------------------------------------------

const RADIUS: Record<RadiusStyle, Record<string, string>> = {
    sharp: { '--r-sm': '0px', '--r': '0px', '--r-md': '0px', '--r-lg': '0px', '--r-xl': '0px', '--r-2xl': '0px' },
    soft: {},
    round: {
        '--r-sm': '0.375rem',
        '--r': '0.75rem',
        '--r-md': '0.875rem',
        '--r-lg': '1rem',
        '--r-xl': '1.375rem',
        '--r-2xl': '1.75rem',
    },
    pill: {
        '--r-sm': '0.5rem',
        '--r': '1rem',
        '--r-md': '1.25rem',
        '--r-lg': '1.5rem',
        '--r-xl': '1.75rem',
        '--r-2xl': '2.25rem',
    },
};

const BUTTON_RADIUS: Record<ButtonStyle, string | null> = { default: null, pill: '9999px', square: '0px' };

const SHADOW: Record<ShadowStyle, Record<string, string>> = {
    none: { '--shadow': 'none', '--shadow-md': 'none', '--shadow-lg': 'none', '--shadow-xl': 'none' },
    soft: {},
    strong: {
        '--shadow': '0 1px 3px 0 rgb(15 23 42 / 0.12)',
        '--shadow-md': '0 4px 12px -2px rgb(15 23 42 / 0.18), 0 2px 4px -2px rgb(15 23 42 / 0.12)',
        '--shadow-lg': '0 16px 32px -8px rgb(15 23 42 / 0.28), 0 6px 12px -6px rgb(15 23 42 / 0.16)',
        '--shadow-xl': '0 32px 64px -12px rgb(15 23 42 / 0.4)',
    },
};

export const FONTS: Record<FontChoice, { label: string; stack: string | null }> = {
    inter: { label: 'Inter', stack: null },
    system: { label: 'System', stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { label: 'Serif', stack: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
    mono: { label: 'Mono', stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
};

/** The CSS value for the background of a config, null for none. */
export const backgroundValue = (image: string | null): string | null => {
    if (!image) return null;
    if (image.startsWith('gradient:')) return GRADIENTS[image.slice(9)]?.css ?? null;

    return `url("${image}")`;
};

export interface CssScope {
    // Where the variables that are the same in both themes go, and the light and the dark colours.
    common: string;
    light: string;
    dark: string;
}

/** The page itself. The selectors are a notch more specific than theme.css so the order of the styles does not matter. */
export const PAGE_SCOPE: CssScope = { common: 'html:root', light: 'html:root', dark: 'html.dark' };

const block = (selector: string, vars: Record<string, string>): string =>
    Object.keys(vars).length
        ? `${selector} {\n${Object.entries(vars)
              .map(([name, value]) => `    ${name}: ${value};`)
              .join('\n')}\n}`
        : '';

const scaleVars = (name: string, scale: Record<number, string>): Record<string, string> =>
    Object.fromEntries(SHADES.map((shade) => [`--c-${name}-${shade}`, triplet(scale[shade])]));

/** The CSS of a config, an empty string for the default look. Only custom properties, see ThemeService on the server. */
export const buildThemeCss = (input: ThemeConfig, scope: CssScope = PAGE_SCOPE): string => {
    const config = withDefaults(input);
    const common: Record<string, string> = { ...RADIUS[config.radius], ...SHADOW[config.shadow] };
    let light: Record<string, string> = {};
    let dark: Record<string, string> = {};

    if (config.accent.toLowerCase() !== DEFAULT_ACCENT) {
        const accent = accentScales(config.accent);
        light = { ...light, ...scaleVars('primary', accent.light) };
        dark = { ...dark, ...scaleVars('primary', accent.dark) };
    }
    if (config.secondary) {
        const tinted = tintedNeutral(config.secondary);
        light = { ...light, ...scaleVars('neutral', tinted.light) };
        dark = { ...dark, ...scaleVars('neutral', tinted.dark) };
        // The card colour is the 700 shade.
        light['--c-white'] = triplet(tinted.light[700]);
        dark['--c-white'] = triplet(tinted.dark[700]);
    }

    const button = BUTTON_RADIUS[config.buttons];
    if (button) {
        common['--btn-radius'] = button;
        common['--input-radius'] = button === '9999px' ? '9999px' : '0px';
    }
    if (config.font !== 'inter') common['--font-sans'] = FONTS[config.font].stack!;

    if (config.layout === 'grid') common['--server-columns'] = String(config.columns);
    if (config.density === 'compact') common['--server-gap'] = '0.5rem';

    const picture = backgroundValue(config.background.image);
    if (picture) {
        common['--bg-image'] = picture;
        if (config.background.blur > 0) common['--bg-blur'] = `${config.background.blur}px`;
        if (config.background.dim > 0) common['--bg-dim'] = String(config.background.dim / 100);
    }
    if (config.glass > 0) {
        common['--card-alpha'] = String(1 - config.glass / 100);
        if (config.glassBlur > 0) common['--card-blur'] = `${config.glassBlur}px`;
    }

    return [block(scope.common, common), block(scope.light, light), block(scope.dark, dark)]
        .filter((part) => part !== '')
        .join('\n');
};

// ---- the settings of the page ---------------------------------------------------------------------------------------------------------

const EVENT = 'stratosphere:themeconfig';
let current: ThemeConfig | null = null;

/** The theme config the server printed into the page. */
export const pageThemeConfig = (): ThemeConfig => {
    if (!current) {
        const site = (window as any).SiteConfiguration;
        current = withDefaults(site?.theme);
    }

    return current;
};

/** The editor shows a change in the page at once, without saving. */
export const setPageThemeConfig = (config: ThemeConfig): void => {
    current = withDefaults(config);
    window.dispatchEvent(new CustomEvent(EVENT));
};

export const useThemeConfig = (): ThemeConfig => {
    const [config, setConfig] = useState(pageThemeConfig);

    useEffect(() => {
        const update = () => setConfig(pageThemeConfig());
        window.addEventListener(EVENT, update);

        return () => window.removeEventListener(EVENT, update);
    }, []);

    return config;
};
