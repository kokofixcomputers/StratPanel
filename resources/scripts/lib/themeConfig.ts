/**
 * The look an admin builds in the theme editor (components/admin/ThemeEditor.tsx). The settings are kept as they are, and turned into a
 * few blocks of CSS variables (buildThemeCss) that the styles of the panel are written against: the colour scales of assets/css/theme.css,
 * and the radius, shadow, font, background and layout variables that tailwind.config.js and the global stylesheet read. The server prints
 * the CSS into every page (Services/Theme/ThemeService.php checks it first, it only lets variables through), the layout settings are read
 * from window.SiteConfiguration.theme by useThemeConfig.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { ConsoleOptions, DEFAULT_CONSOLE } from '@/lib/consoleTheme';

export type RadiusStyle = 'sharp' | 'soft' | 'round' | 'pill';
export type ButtonStyle = 'default' | 'pill' | 'square';
export type ShadowStyle = 'none' | 'soft' | 'strong';
export type FontChoice = 'inter' | 'system' | 'serif' | 'mono';

export type RowMetric = 'players' | 'cpu' | 'memory' | 'disk' | 'uptime' | 'network';
export const ROW_METRICS: { id: RowMetric; label: string }[] = [
    { id: 'players', label: 'Players' },
    { id: 'cpu', label: 'CPU' },
    { id: 'memory', label: 'Memory' },
    { id: 'disk', label: 'Disk' },
    { id: 'uptime', label: 'Uptime' },
    { id: 'network', label: 'Network' },
];

/** Colours of the surfaces for one theme. Null keeps the default. */
export interface SurfaceColors {
    page: string | null;
    card: string | null;
    border: string | null;
    text: string | null;
    muted: string | null;
}

export type ButtonHover = 'none' | 'lift' | 'glow' | 'scale' | 'shine';
export type ButtonPress = 'none' | 'squish' | 'sink';
export type CardHover = 'none' | 'lift' | 'glow' | 'border';

/** How things move: hovering a button or a card, how fast, and between pages. */
export interface MotionOptions {
    buttonHover: ButtonHover;
    buttonPress: ButtonPress;
    cardHover: CardHover;
    // "off" removes all transitions (also what people who ask their device for less motion get).
    speed: 'off' | 'fast' | 'normal' | 'slow';
    page: 'fade' | 'slide' | 'none';
    // The status mark of running servers pulses.
    pulse: boolean;
}

export const DEFAULT_MOTION: MotionOptions = {
    buttonHover: 'none',
    buttonPress: 'none',
    cardHover: 'none',
    speed: 'normal',
    page: 'fade',
    pulse: false,
};

export interface SidebarExtra {
    id: string;
    label: string;
    // A path of the panel or an http(s) address.
    url: string;
    newTab: boolean;
    // The title of the group of the sidebar it is shown in.
    group: string;
}

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
    // The bars at the top: fixed to the edge of the page, or floating above it as a rounded block.
    chrome: 'attached' | 'floating';
    // How the page you are on is marked in menus: a tint, a solid fill or a line.
    nav: 'tint' | 'solid' | 'line';
    // What the cards and bars are made of: frosted glass, subtle, off (solid), or custom (the two sliders below).
    material: 'frosted' | 'subtle' | 'custom' | 'off';
    // The colours of success, danger and warning, null keeps the defaults.
    status: { success: string | null; danger: string | null; warning: string | null };
    surface: { light: SurfaceColors; dark: SurfaceColors };
    // A corner radius in pixels instead of the preset's, null follows the preset.
    radiusCustom: number | null;
    // Size of all text and spacing in percent.
    fontScale: number;
    console: ConsoleOptions;
    // What a server of the dashboard shows, how big it is and how its state is marked.
    row: {
        metrics: RowMetric[];
        address: boolean;
        description: boolean;
        size: 'small' | 'medium' | 'large';
        status: 'bar' | 'dot' | 'none';
    };
    // The weight of headings (500 to 800) and the spacing of letters.
    headingWeight: 500 | 600 | 700 | 800;
    tracking: 'tight' | 'normal' | 'wide';
    // Main buttons: filled, soft, outlined or with a gradient.
    buttonStyle: 'solid' | 'soft' | 'outline' | 'gradient';
    // Lines around cards: the usual ones, none, or stronger.
    borders: 'subtle' | 'none' | 'strong';
    // How wide the content of a page can get.
    pageWidth: 'narrow' | 'normal' | 'wide' | 'full';
    sidebarWidth: 'narrow' | 'normal' | 'wide';
    // The server sidebar without its own card.
    sidebarFlat: boolean;
    motion: MotionOptions;
    // The navigation of a server: which items there are, in what order, and links of your own.
    sidebar: { order: string[]; hidden: string[]; extra: SidebarExtra[] };
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
    chrome: 'attached',
    nav: 'tint',
    material: 'off',
    status: { success: null, danger: null, warning: null },
    surface: {
        light: { page: null, card: null, border: null, text: null, muted: null },
        dark: { page: null, card: null, border: null, text: null, muted: null },
    },
    radiusCustom: null,
    fontScale: 100,
    console: DEFAULT_CONSOLE,
    row: {
        metrics: ['players', 'cpu', 'memory', 'disk'],
        address: true,
        description: true,
        size: 'medium',
        status: 'bar',
    },
    headingWeight: 600,
    tracking: 'normal',
    buttonStyle: 'solid',
    borders: 'subtle',
    pageWidth: 'normal',
    sidebarWidth: 'normal',
    sidebarFlat: false,
    motion: DEFAULT_MOTION,
    sidebar: { order: [], hidden: [], extra: [] },
    layout: 'list',
    columns: 2,
    glass: 0,
    glassBlur: 0,
    background: { image: null, blur: 0, dim: 0 },
    preset: 'default',
};

/** Quiet backgrounds, one for each theme so they look right in light and in dark. */
export const GRADIENTS: Record<string, { label: string; light: string; dark: string }> = {
    mist: {
        label: 'Mist',
        light: 'linear-gradient(160deg, #f7f9fc 0%, #e6ecf4 100%)',
        dark: 'linear-gradient(160deg, #0c1017 0%, #131b28 100%)',
    },
    paper: {
        label: 'Paper',
        light: 'linear-gradient(135deg, #f6f7f9 0%, #e5e9ef 100%)',
        dark: 'linear-gradient(135deg, #0c1017 0%, #171d28 100%)',
    },
    sage: {
        label: 'Sage',
        light: 'linear-gradient(150deg, #f5f8f5 0%, #e2ebe3 100%)',
        dark: 'linear-gradient(150deg, #0b110e 0%, #121d16 100%)',
    },
    sand: {
        label: 'Sand',
        light: 'linear-gradient(150deg, #f9f7f3 0%, #ece6db 100%)',
        dark: 'linear-gradient(150deg, #12100c 0%, #1d1a13 100%)',
    },
    slate: {
        label: 'Slate',
        light: 'linear-gradient(180deg, #f4f5f7 0%, #e3e6ea 100%)',
        dark: 'linear-gradient(180deg, #0b0d12 0%, #161a23 100%)',
    },
    rose: {
        label: 'Rose',
        light: 'linear-gradient(135deg, #fbf6f6 0%, #f0e2e5 100%)',
        dark: 'linear-gradient(135deg, #130e10 0%, #1f1519 100%)',
    },
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
        name: 'Frosted',
        config: {
            accent: '#4f7cff',
            radius: 'round',
            shadow: 'strong',
            material: 'frosted',
            chrome: 'floating',
            background: { image: 'gradient:mist', blur: 0, dim: 0 },
        },
    },
    {
        id: 'paper',
        name: 'Paper',
        config: {
            accent: '#374151',
            radius: 'soft',
            shadow: 'soft',
            nav: 'line',
            background: { image: 'gradient:paper', blur: 0, dim: 0 },
        },
    },
    {
        id: 'sage',
        name: 'Sage',
        config: {
            accent: '#4d7c5f',
            secondary: '#5b7a66',
            nav: 'tint',
            background: { image: 'gradient:sage', blur: 0, dim: 0 },
        },
    },
    {
        id: 'floating',
        name: 'Floating',
        config: { chrome: 'floating', radius: 'round', nav: 'solid', shadow: 'strong' },
    },
    {
        id: 'mono',
        name: 'Mono',
        config: { accent: '#111827', radius: 'sharp', buttons: 'square', shadow: 'none', font: 'mono', nav: 'line' },
    },
    {
        id: 'cards',
        name: 'Cards',
        config: { layout: 'grid', columns: 3, density: 'compact', radius: 'round' },
    },
];

export const withDefaults = (config: Partial<ThemeConfig> | null | undefined): ThemeConfig => {
    const given = config ?? {};

    return {
        ...DEFAULT_CONFIG,
        ...given,
        background: { ...DEFAULT_CONFIG.background, ...(given.background ?? {}) },
        status: { ...DEFAULT_CONFIG.status, ...(given.status ?? {}) },
        surface: {
            light: { ...DEFAULT_CONFIG.surface.light, ...(given.surface?.light ?? {}) },
            dark: { ...DEFAULT_CONFIG.surface.dark, ...(given.surface?.dark ?? {}) },
        },
        console: { ...DEFAULT_CONSOLE, ...(given.console ?? {}) },
        motion: { ...DEFAULT_MOTION, ...(given.motion ?? {}) },
        row: { ...DEFAULT_CONFIG.row, ...(given.row ?? {}) },
        sidebar: { ...DEFAULT_CONFIG.sidebar, ...(given.sidebar ?? {}) },
    };
};

/** How see-through the cards are and how much is blurred behind them, from the material. */
export const glassOf = (config: ThemeConfig): { glass: number; blur: number } => {
    switch (config.material) {
        case 'frosted':
            return { glass: 42, blur: 16 };
        case 'subtle':
            return { glass: 8, blur: 4 };
        case 'custom':
            return { glass: config.glass, blur: config.glassBlur };
        default:
            return { glass: 0, blur: 0 };
    }
};

export const presetConfig = (id: string): ThemeConfig => {
    const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];

    return withDefaults({ ...preset.config, preset: preset.id });
};

// ---- colours ----------------------------------------------------------------------------------------------------------------------

export { hexToRgb, luminance, mix } from '@/lib/colorMath';
import { luminance, mix, triplet } from '@/lib/colorMath';

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

/** The CSS value for the background of a config in a theme, null for none. */
export const backgroundValue = (image: string | null, mode: 'light' | 'dark'): string | null => {
    if (!image) return null;
    if (image.startsWith('gradient:')) return GRADIENTS[image.slice(9)]?.[mode] ?? null;

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

const isHex = (value: string | null | undefined): value is string => !!value && /^#[0-9a-fA-F]{6}$/.test(value);

/** The surface colours of one theme as variables, on top of the neutral scale that is there already. */
const surfaceVars = (colors: SurfaceColors, mode: 'light' | 'dark'): Record<string, string> => {
    const base = BASE_NEUTRAL[mode];
    const page = isHex(colors.page) ? colors.page : null;
    const card = isHex(colors.card) ? colors.card : null;
    const border = isHex(colors.border) ? colors.border : null;
    const text = isHex(colors.text) ? colors.text : null;
    const muted = isHex(colors.muted) ? colors.muted : null;
    const vars: Record<string, string> = {};
    const cardColor = card ?? base[700];
    const pageColor = page ?? base[800];

    if (card) {
        vars['--c-neutral-700'] = triplet(card);
        vars['--c-white'] = triplet(card);
        vars['--c-neutral-600'] = triplet(mix(text ?? base[50], card, 0.06));
    }
    if (page) {
        vars['--c-neutral-800'] = triplet(page);
        vars['--c-neutral-900'] =
            luminance(cardColor) > luminance(pageColor)
                ? triplet(mix(cardColor, page, 0.5))
                : triplet(mix(BLACK, page, 0.4));
    }
    if (border) vars['--c-neutral-500'] = triplet(border);
    if (text) {
        vars['--c-neutral-50'] = triplet(text);
        vars['--c-neutral-100'] = triplet(mix(text, cardColor, 0.92));
        vars['--c-neutral-200'] = triplet(mix(text, cardColor, 0.8));
    }
    if (muted) {
        vars['--c-neutral-400'] = triplet(muted);
        vars['--c-neutral-300'] = triplet(mix(muted, text ?? base[50], 0.72));
    }

    return vars;
};

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

    // The colours of success, danger and warning replace the whole scales that the panel uses for them.
    const status: [string | null, string[]][] = [
        [config.status.success, ['green']],
        [config.status.danger, ['red']],
        [config.status.warning, ['yellow', 'amber']],
    ];
    for (const [color, names] of status) {
        if (!isHex(color)) continue;
        const scales = accentScales(color);
        for (const name of names) {
            light = { ...light, ...scaleVars(name, scales.light) };
            dark = { ...dark, ...scaleVars(name, scales.dark) };
        }
    }

    light = { ...light, ...surfaceVars(config.surface.light, 'light') };
    dark = { ...dark, ...surfaceVars(config.surface.dark, 'dark') };

    if (config.radiusCustom !== null && config.radiusCustom !== undefined) {
        const r = config.radiusCustom;
        const px = (factor: number) => `${Math.round(r * factor * 10) / 10}px`;
        Object.assign(common, {
            '--r-sm': px(0.4),
            '--r': px(0.75),
            '--r-md': px(0.85),
            '--r-lg': px(1),
            '--r-xl': px(1.4),
            '--r-2xl': px(1.8),
        });
    }
    const button = BUTTON_RADIUS[config.buttons];
    if (button) {
        common['--btn-radius'] = button;
        common['--input-radius'] = button === '9999px' ? '9999px' : '0px';
    }
    if (config.font !== 'inter') common['--font-sans'] = FONTS[config.font].stack!;
    if (config.fontScale !== 100) common['--font-scale'] = String(config.fontScale);
    if (config.headingWeight !== 600) common['--heading-weight'] = String(config.headingWeight);
    if (config.tracking !== 'normal') common['--tracking'] = config.tracking === 'tight' ? '-0.02em' : '0.02em';
    if (config.pageWidth !== 'normal')
        common['--page-max'] = { narrow: '1024px', wide: '1536px', full: '100%', normal: '1280px' }[config.pageWidth];
    if (config.sidebarWidth !== 'normal')
        common['--sidebar-width'] = config.sidebarWidth === 'narrow' ? '14rem' : '18rem';

    if (config.layout === 'grid') common['--server-columns'] = String(config.columns);
    if (config.density === 'compact') common['--server-gap'] = '0.5rem';

    const image = config.background.image;
    if (image && image.startsWith('gradient:')) {
        const lightValue = backgroundValue(image, 'light');
        const darkValue = backgroundValue(image, 'dark');
        if (lightValue) light['--bg-image'] = lightValue;
        if (darkValue) dark['--bg-image'] = darkValue;
    } else if (image) {
        common['--bg-image'] = backgroundValue(image, 'light')!;
    }
    if (image && backgroundValue(image, 'light')) {
        if (config.background.blur > 0) common['--bg-blur'] = `${config.background.blur}px`;
        if (config.background.dim > 0) common['--bg-dim'] = String(config.background.dim / 100);
    }

    const glass = glassOf(config);
    if (glass.glass > 0) {
        common['--card-alpha'] = String(Math.round((1 - glass.glass / 100) * 100) / 100);
        if (glass.blur > 0) common['--card-blur'] = `${glass.blur}px`;
    }

    return [block(scope.common, common), block(scope.light, light), block(scope.dark, dark)]
        .filter((part) => part !== '')
        .join('\n');
};

/**
 * The settings that are marks on the page rather than variables: attributes on <html> that the global stylesheet has rules for. They are
 * stored next to the CSS (Services/Theme/ThemeService.php only lets these names and short lowercase values through) and set before the
 * page is drawn.
 */
export const themeAttributes = (input: ThemeConfig): Record<string, string> => {
    const config = withDefaults(input);
    const attributes: Record<string, string> = {
        'data-chrome': config.chrome,
        'data-nav': config.nav,
        'data-btn-style': config.buttonStyle,
        'data-btn-hover': config.motion.buttonHover,
        'data-btn-press': config.motion.buttonPress,
        'data-card-hover': config.motion.cardHover,
        'data-speed': config.motion.speed,
        'data-page-anim': config.motion.page,
        'data-pulse': String(config.motion.pulse),
        'data-borders': config.borders,
        'data-row-size': config.row.size,
        'data-row-status': config.row.status,
        'data-side-flat': String(config.sidebarFlat),
    };

    return attributes;
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

/** The theme editor draws parts of the panel with the config it is editing instead of the saved one. */
export const ThemeConfigContext = createContext<ThemeConfig | null>(null);

export const useThemeConfig = (): ThemeConfig => {
    const draft = useContext(ThemeConfigContext);
    const [config, setConfig] = useState(pageThemeConfig);

    useEffect(() => {
        const update = () => setConfig(pageThemeConfig());
        window.addEventListener(EVENT, update);

        return () => window.removeEventListener(EVENT, update);
    }, []);

    return draft ?? config;
};
