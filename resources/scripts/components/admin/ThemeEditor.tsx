import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import {
    AdjustmentsIcon,
    ArrowDownIcon,
    ArrowLeftIcon,
    ArrowUpIcon,
    ColorSwatchIcon,
    CursorClickIcon,
    LightningBoltIcon,
    LockClosedIcon,
    MenuAlt2Icon,
    PhotographIcon,
    RefreshIcon,
    ServerIcon,
    SparklesIcon,
    TemplateIcon,
    TerminalIcon,
    UploadIcon,
    ViewGridIcon,
} from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import {
    ColorField,
    Group,
    OptionalColor,
    Row,
    SectionContext,
    Segmented,
    Slider,
    Toggle,
} from '@/components/admin/theme/controls';
import GradientPicker from '@/components/admin/theme/GradientPicker';
import SidebarEditor from '@/components/admin/theme/SidebarEditor';
import LivePreview, { PreviewPage } from '@/components/admin/theme/LivePreview';
import {
    BASE_NEUTRAL,
    buildThemeCss,
    DEFAULT_CONFIG,
    FONTS,
    FontChoice,
    PRESETS,
    presetConfig,
    ROW_METRICS,
    RowMetric,
    SurfaceColors,
    ThemeConfig,
    themeAttributes,
    withDefaults,
} from '@/lib/themeConfig';

const SECTIONS: {
    id: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
}[] = [
    { id: 'presets', label: 'Presets', description: 'Ready made looks to start from', icon: SparklesIcon },
    {
        id: 'colours',
        label: 'Colours',
        description: 'Accent, secondary, success, danger, warning',
        icon: ColorSwatchIcon,
    },
    {
        id: 'surfaces',
        label: 'Surfaces',
        description: 'Page, card, border and text colours per mode',
        icon: TemplateIcon,
    },
    {
        id: 'shape',
        label: 'Shape and type',
        description: 'Corners, shadows, font and text size',
        icon: AdjustmentsIcon,
    },
    {
        id: 'bars',
        label: 'Bars and menus',
        description: 'Floating bars, menu style, material, borders, width',
        icon: MenuAlt2Icon,
    },
    { id: 'buttons', label: 'Buttons', description: 'Button style, hover and press effects', icon: CursorClickIcon },
    { id: 'motion', label: 'Motion', description: 'Card hover, speed, page changes, pulse', icon: LightningBoltIcon },
    {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'List or cards, row size, what a row shows',
        icon: ViewGridIcon,
    },
    { id: 'sidebar', label: 'Server sidebar', description: 'Reorder, hide or add links, width', icon: ServerIcon },
    { id: 'console', label: 'Console', description: 'Colours, brightness and size of the text', icon: TerminalIcon },
    {
        id: 'login',
        label: 'Login page',
        description: 'Layout, background and message of the sign in pages',
        icon: LockClosedIcon,
    },
    { id: 'background', label: 'Background', description: 'Quiet gradients or your own picture', icon: PhotographIcon },
];

const SWATCHES = ['#1447e6', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#e11d48', '#c026d3', '#7c3aed', '#374151'];
const SURFACE_PARTS: { key: keyof SurfaceColors; label: string; base: (mode: 'light' | 'dark') => string }[] = [
    { key: 'page', label: 'Page background', base: (m) => BASE_NEUTRAL[m][800] },
    { key: 'card', label: 'Cards and bars', base: (m) => BASE_NEUTRAL[m][700] },
    { key: 'border', label: 'Borders', base: (m) => BASE_NEUTRAL[m][500] },
    { key: 'text', label: 'Text', base: (m) => BASE_NEUTRAL[m][50] },
    { key: 'muted', label: 'Muted text', base: (m) => BASE_NEUTRAL[m][400] },
];
const STATUS_PARTS: { key: 'success' | 'danger' | 'warning'; label: string; base: string }[] = [
    { key: 'success', label: 'Success', base: '#16a34a' },
    { key: 'danger', label: 'Danger', base: '#dc2626' },
    { key: 'warning', label: 'Warning', base: '#ca8a04' },
];

/** The saved theme is not drawn on this page, the preview shows the draft alone: otherwise the saved one would leak into it. */
const useBareTheme = () => {
    useEffect(() => {
        const style = document.getElementById('stratosphere-custom-theme');
        const css = style?.textContent ?? '';
        const root = document.documentElement;
        const attributes = Object.keys(themeAttributes(DEFAULT_CONFIG)).map(
            (name) => [name, root.getAttribute(name)] as const
        );
        if (style) style.textContent = '';
        attributes.forEach(([name]) => root.removeAttribute(name));

        return () => {
            if (style) style.textContent = css;
            attributes.forEach(([name, value]) => value !== null && root.setAttribute(name, value));
        };
    }, []);
};

export default () => {
    useBareTheme();
    const [config, setConfig] = useState<ThemeConfig | null>(null);
    const [saved, setSaved] = useState<ThemeConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [working, setWorking] = useState<null | 'save' | 'reset' | 'upload'>(null);
    const [dark, setDark] = useState(false);
    const [page, setPage] = useState<PreviewPage>('dashboard');
    const [phone, setPhone] = useState(false);
    const [serverId, setServerId] = useState<string | null>(null);
    const [section, setSectionState] = useState('presets');
    const [surfaceMode, setSurfaceMode] = useState<'light' | 'dark'>('light');
    const file = useRef<HTMLInputElement>(null);
    const loginFile = useRef<HTMLInputElement>(null);

    // A server of the admin's own for the preview of the server pages.
    useEffect(() => {
        http.get('/api/client')
            .then(({ data }) => setServerId(data.data?.[0]?.attributes?.identifier ?? null))
            .catch(() => setServerId(null));
    }, []);

    useEffect(() => {
        http.get('/api/client/theme')
            .then(({ data }) => {
                const loaded = withDefaults(data.config);
                setConfig(loaded);
                setSaved(loaded);
            })
            .catch((e) => {
                if (e?.response?.status === 403) setForbidden(true);
                else setError(httpErrorToHuman(e));
            });
    }, []);

    if (forbidden)
        return (
            <div className={'mx-auto max-w-lg px-4 py-24 text-center'}>
                <h1 className={'text-2xl font-bold text-neutral-50'}>Not allowed</h1>
                <p className={'mt-2 text-neutral-400'}>Changing the theme is for admins who may change the branding.</p>
                <a href={'/'} className={'mt-4 inline-block'}>
                    Back to the panel
                </a>
            </div>
        );
    if (!config || !saved)
        return error ? <p className={'p-10 text-center text-red-600'}>{error}</p> : <Spinner size={'large'} centered />;

    // The login section shows the login page in the preview, the others bring the dashboard back.
    const setSection = (id: string) => {
        setSectionState(id);
        if (id === 'login') setPage('login');
        else if (page === 'login') setPage('dashboard');
    };
    const set = (changes: Partial<ThemeConfig>) => setConfig({ ...config, ...changes, preset: null });
    const setBackground = (changes: Partial<ThemeConfig['background']>) =>
        setConfig({ ...config, background: { ...config.background, ...changes }, preset: null });
    const setSurface = (mode: 'light' | 'dark', changes: Partial<SurfaceColors>) =>
        set({ surface: { ...config.surface, [mode]: { ...config.surface[mode], ...changes } } });
    const dirty = JSON.stringify(config) !== JSON.stringify(saved);

    const run = (kind: 'save' | 'reset', work: () => Promise<unknown>) => {
        setWorking(kind);
        setError(null);
        work()
            .then(() => window.location.reload())
            .catch((e) => {
                setError(httpErrorToHuman(e));
                setWorking(null);
            });
    };

    const save = () =>
        run('save', () =>
            http.put('/api/client/theme', {
                config: {
                    ...config,
                    login: { ...config.login, features: config.login.features.filter((f) => f.trim() !== '') },
                },
                css: buildThemeCss(config),
                attributes: themeAttributes(config),
            })
        );
    const reset = () => {
        if (window.confirm('Go back to the default look? Your uploaded pictures stay on the server.'))
            run('reset', () => http.delete('/api/client/theme'));
    };

    const upload = (picture: File, done: (url: string) => void = (url) => setBackground({ image: url })) => {
        setWorking('upload');
        setError(null);
        const form = new FormData();
        form.append('image', picture);
        http.post('/api/client/theme/background', form)
            .then(({ data }) => done(data.url))
            .catch((e) => setError(httpErrorToHuman(e)))
            .then(() => setWorking(null));
    };

    const moveMetric = (id: RowMetric, by: number) => {
        const list = [...config.row.metrics];
        const at = list.indexOf(id);
        const to = at + by;
        if (at < 0 || to < 0 || to >= list.length) return;
        list.splice(to, 0, list.splice(at, 1)[0]);
        set({ row: { ...config.row, metrics: list } });
    };
    const toggleMetric = (id: RowMetric, on: boolean) =>
        set({
            row: {
                ...config.row,
                metrics: on
                    ? ROW_METRICS.map((m) => m.id).filter((m) => m === id || config.row.metrics.includes(m))
                    : config.row.metrics.filter((m) => m !== id),
            },
        });

    const login = config.login;
    const setLogin = (changes: Partial<ThemeConfig['login']>) => set({ login: { ...login, ...changes } });
    const image = config.background.image;
    const kind = !image ? 'none' : image.startsWith('gradient:') ? 'gradient' : 'image';

    return (
        <div className={'min-h-screen'}>
            <header
                className={
                    'sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-neutral-500 bg-white px-5 py-3 shadow'
                }
            >
                <a
                    href={'/admin/settings/branding'}
                    className={'flex items-center gap-1.5 text-sm text-neutral-300 no-underline'}
                >
                    <ArrowLeftIcon className={'h-4 w-4'} />
                    Admin
                </a>
                <h1 className={'text-lg font-semibold text-neutral-50'}>Theme editor</h1>
                {dirty && (
                    <span className={'rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs text-yellow-700'}>Not saved</span>
                )}
                <div className={'ml-auto flex items-center gap-2'}>
                    <Button.Text type={'button'} onClick={reset} disabled={working !== null}>
                        <RefreshIcon className={'mr-1.5 h-4 w-4'} />
                        Reset to default
                    </Button.Text>
                    <Button
                        type={'button'}
                        onClick={() => setConfig(saved)}
                        disabled={!dirty || working !== null}
                        variant={Options.Variant.Secondary}
                    >
                        Discard
                    </Button>
                    <Button type={'button'} onClick={save} disabled={!dirty || working !== null}>
                        {working === 'save' ? 'Saving...' : 'Save theme'}
                    </Button>
                </div>
            </header>
            {error && <p className={'mx-5 mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700'}>{error}</p>}
            <div className={'grid gap-5 p-5 lg:grid-cols-[3.5rem_minmax(0,24rem)_minmax(0,1fr)]'}>
                <div className={'relative z-30 lg:sticky lg:top-20 lg:h-[calc(100vh-6.5rem)] lg:self-start'}>
                    <nav
                        className={
                            'flex gap-1 overflow-x-auto rounded-2xl border border-neutral-500 bg-white p-1.5 shadow-md lg:absolute lg:left-0 lg:top-0 lg:z-20 lg:w-14 lg:flex-col lg:overflow-hidden lg:transition-[width] lg:duration-200 lg:hover:w-72 lg:hover:shadow-xl'
                        }
                        aria-label={'Sections'}
                    >
                        {SECTIONS.map((item) => (
                            <button
                                key={item.id}
                                type={'button'}
                                title={item.label}
                                onClick={() => setSection(item.id)}
                                className={classNames(
                                    'flex flex-shrink-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors lg:w-full',
                                    section === item.id
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'text-neutral-300 hover:bg-neutral-600'
                                )}
                            >
                                <item.icon className={'h-5 w-5 flex-shrink-0'} />
                                <span className={'hidden whitespace-nowrap sm:block'}>
                                    <span className={'block text-sm font-medium leading-tight'}>{item.label}</span>
                                    <span className={'block text-2xs font-normal leading-tight text-neutral-400'}>
                                        {item.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </nav>
                </div>
                <aside
                    className={
                        'overflow-hidden rounded-2xl border border-neutral-500 bg-white shadow-md lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto'
                    }
                >
                    <SectionContext.Provider value={section}>
                        <div className={'border-b border-neutral-500 px-5 py-4'}>
                            <h2 className={'text-base font-semibold text-neutral-50'}>
                                {SECTIONS.find((item) => item.id === section)?.label}
                            </h2>
                            <p className={'text-sm text-neutral-400'}>
                                {SECTIONS.find((item) => item.id === section)?.description}
                            </p>
                        </div>
                        <Group id={'presets'}>
                            <div className={'grid grid-cols-2 gap-2'}>
                                {PRESETS.map((preset) => {
                                    const c = presetConfig(preset.id);

                                    return (
                                        <button
                                            key={preset.id}
                                            type={'button'}
                                            onClick={() => setConfig(c)}
                                            className={classNames(
                                                'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                                config.preset === preset.id
                                                    ? 'border-primary-600 bg-primary-50'
                                                    : 'border-neutral-500 hover:bg-neutral-600'
                                            )}
                                        >
                                            <span
                                                className={'h-4 w-4 flex-shrink-0 rounded-full'}
                                                style={{ background: c.accent }}
                                            />
                                            <span className={'truncate text-neutral-100'}>{preset.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </Group>
                        <Group id={'colours'}>
                            <Row label={'Accent'}>
                                <ColorField value={config.accent} onChange={(accent) => set({ accent })} />
                                <div className={'mt-2 flex flex-wrap gap-1.5'}>
                                    {SWATCHES.map((swatch) => (
                                        <button
                                            key={swatch}
                                            type={'button'}
                                            aria-label={swatch}
                                            onClick={() => set({ accent: swatch })}
                                            className={classNames(
                                                'h-6 w-6 rounded-full border-2',
                                                config.accent === swatch ? 'border-neutral-50' : 'border-transparent'
                                            )}
                                            style={{ background: swatch }}
                                        />
                                    ))}
                                </div>
                            </Row>
                            <Row label={'Secondary (tints surfaces and borders)'}>
                                <div className={'flex items-center gap-3'}>
                                    <ColorField
                                        value={config.secondary ?? '#64748b'}
                                        onChange={(secondary) => set({ secondary })}
                                    />
                                    {config.secondary && (
                                        <button
                                            type={'button'}
                                            className={'text-xs text-primary-600'}
                                            onClick={() => set({ secondary: null })}
                                        >
                                            None
                                        </button>
                                    )}
                                </div>
                            </Row>
                            <Row label={'Status colours'}>
                                <div className={'space-y-2'}>
                                    {STATUS_PARTS.map((part) => (
                                        <OptionalColor
                                            key={part.key}
                                            label={part.label}
                                            value={config.status[part.key]}
                                            fallback={part.base}
                                            onChange={(value) =>
                                                set({ status: { ...config.status, [part.key]: value } })
                                            }
                                        />
                                    ))}
                                </div>
                            </Row>
                            <Row label={'Default mode for new visitors'}>
                                <Segmented
                                    value={config.mode}
                                    onChange={(mode) => set({ mode })}
                                    options={[
                                        { value: 'system', label: 'System' },
                                        { value: 'light', label: 'Light' },
                                        { value: 'dark', label: 'Dark' },
                                    ]}
                                />
                            </Row>
                        </Group>
                        <Group id={'surfaces'}>
                            <Segmented
                                value={surfaceMode}
                                onChange={(mode) => {
                                    setSurfaceMode(mode);
                                    setDark(mode === 'dark');
                                }}
                                options={[
                                    { value: 'light', label: 'Light mode' },
                                    { value: 'dark', label: 'Dark mode' },
                                ]}
                            />
                            <div className={'space-y-2'}>
                                {SURFACE_PARTS.map((part) => (
                                    <OptionalColor
                                        key={part.key}
                                        label={part.label}
                                        value={config.surface[surfaceMode][part.key]}
                                        fallback={part.base(surfaceMode)}
                                        onChange={(value) => setSurface(surfaceMode, { [part.key]: value })}
                                    />
                                ))}
                            </div>
                        </Group>
                        <Group id={'shape'}>
                            <Row label={'Corners'}>
                                <Segmented
                                    value={config.radius}
                                    onChange={(radius) => set({ radius, radiusCustom: null })}
                                    options={[
                                        { value: 'sharp', label: 'Sharp' },
                                        { value: 'soft', label: 'Soft' },
                                        { value: 'round', label: 'Round' },
                                        { value: 'pill', label: 'Pill' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Exact corner radius'}>
                                <div className={'flex items-center gap-3'}>
                                    <div className={'flex-1'}>
                                        <Slider
                                            value={config.radiusCustom ?? 12}
                                            min={0}
                                            max={32}
                                            unit={'px'}
                                            onChange={(radiusCustom) => set({ radiusCustom })}
                                        />
                                    </div>
                                    {config.radiusCustom !== null && (
                                        <button
                                            type={'button'}
                                            className={'text-xs text-primary-600'}
                                            onClick={() => set({ radiusCustom: null })}
                                        >
                                            Use corners
                                        </button>
                                    )}
                                </div>
                            </Row>
                            <Row label={'Buttons and fields'}>
                                <Segmented
                                    value={config.buttons}
                                    onChange={(buttons) => set({ buttons })}
                                    options={[
                                        { value: 'default', label: 'Follow corners' },
                                        { value: 'pill', label: 'Pills' },
                                        { value: 'square', label: 'Square' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Shadows'}>
                                <Segmented
                                    value={config.shadow}
                                    onChange={(shadow) => set({ shadow })}
                                    options={[
                                        { value: 'none', label: 'None' },
                                        { value: 'soft', label: 'Soft' },
                                        { value: 'strong', label: 'Strong' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Font'}>
                                <Segmented<FontChoice>
                                    value={config.font}
                                    onChange={(font) => set({ font })}
                                    options={(Object.keys(FONTS) as FontChoice[]).map((value) => ({
                                        value,
                                        label: FONTS[value].label,
                                    }))}
                                />
                            </Row>
                            <Row label={'Text size'}>
                                <Slider
                                    value={config.fontScale}
                                    min={85}
                                    max={125}
                                    unit={'%'}
                                    onChange={(fontScale) => set({ fontScale })}
                                />
                            </Row>
                        </Group>
                        <Group id={'bars'}>
                            <Row label={'Top bars'}>
                                <Segmented
                                    value={config.chrome}
                                    onChange={(chrome) => set({ chrome })}
                                    options={[
                                        { value: 'attached', label: 'Attached' },
                                        { value: 'floating', label: 'Floating' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Current page in menus'}>
                                <Segmented
                                    value={config.nav}
                                    onChange={(nav) => set({ nav })}
                                    options={[
                                        { value: 'tint', label: 'Tint' },
                                        { value: 'solid', label: 'Solid' },
                                        { value: 'line', label: 'Line' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Surface material'}>
                                <Segmented
                                    value={config.material}
                                    onChange={(material) => set({ material })}
                                    options={[
                                        { value: 'off', label: 'Off' },
                                        { value: 'subtle', label: 'Subtle' },
                                        { value: 'frosted', label: 'Frosted' },
                                        { value: 'custom', label: 'Custom' },
                                    ]}
                                />
                            </Row>
                            {config.material === 'custom' && (
                                <>
                                    <Row label={'Cards see-through'}>
                                        <Slider
                                            value={config.glass}
                                            min={0}
                                            max={70}
                                            unit={'%'}
                                            onChange={(glass) => set({ glass })}
                                        />
                                    </Row>
                                    <Row label={'Blur behind the cards'}>
                                        <Slider
                                            value={config.glassBlur}
                                            min={0}
                                            max={30}
                                            unit={'px'}
                                            onChange={(glassBlur) => set({ glassBlur })}
                                        />
                                    </Row>
                                </>
                            )}
                            <Row label={'Lines around cards'}>
                                <Segmented
                                    value={config.borders}
                                    onChange={(borders) => set({ borders })}
                                    options={[
                                        { value: 'subtle', label: 'Subtle' },
                                        { value: 'none', label: 'None' },
                                        { value: 'strong', label: 'Strong' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Page width'}>
                                <Segmented
                                    value={config.pageWidth}
                                    onChange={(pageWidth) => set({ pageWidth })}
                                    options={[
                                        { value: 'narrow', label: 'Narrow' },
                                        { value: 'normal', label: 'Normal' },
                                        { value: 'wide', label: 'Wide' },
                                        { value: 'full', label: 'Full' },
                                    ]}
                                />
                            </Row>
                            {config.material !== 'off' && !image && (
                                <p className={'text-xs text-neutral-400'}>
                                    See-through cards show a background, pick one below.
                                </p>
                            )}
                        </Group>
                        <Group id={'buttons'}>
                            <Row label={'Main buttons'}>
                                <Segmented
                                    value={config.buttonStyle}
                                    onChange={(buttonStyle) => set({ buttonStyle })}
                                    options={[
                                        { value: 'solid', label: 'Solid' },
                                        { value: 'soft', label: 'Soft' },
                                        { value: 'outline', label: 'Outline' },
                                        { value: 'gradient', label: 'Gradient' },
                                    ]}
                                />
                            </Row>
                            <Row label={'On hover'}>
                                <Segmented
                                    value={config.motion.buttonHover}
                                    onChange={(buttonHover) => set({ motion: { ...config.motion, buttonHover } })}
                                    options={[
                                        { value: 'none', label: 'Nothing' },
                                        { value: 'lift', label: 'Lift' },
                                        { value: 'glow', label: 'Glow' },
                                        { value: 'scale', label: 'Grow' },
                                        { value: 'shine', label: 'Shine' },
                                    ]}
                                />
                            </Row>
                            <Row label={'When pressed'}>
                                <Segmented
                                    value={config.motion.buttonPress}
                                    onChange={(buttonPress) => set({ motion: { ...config.motion, buttonPress } })}
                                    options={[
                                        { value: 'none', label: 'Nothing' },
                                        { value: 'squish', label: 'Squish' },
                                        { value: 'sink', label: 'Sink' },
                                    ]}
                                />
                            </Row>
                            <p className={'text-xs text-neutral-400'}>Try them on the buttons in the preview.</p>
                        </Group>
                        <Group id={'motion'}>
                            <Row label={'Cards and server rows on hover'}>
                                <Segmented
                                    value={config.motion.cardHover}
                                    onChange={(cardHover) => set({ motion: { ...config.motion, cardHover } })}
                                    options={[
                                        { value: 'none', label: 'Nothing' },
                                        { value: 'lift', label: 'Lift' },
                                        { value: 'glow', label: 'Glow' },
                                        { value: 'border', label: 'Border' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Speed of everything'}>
                                <Segmented
                                    value={config.motion.speed}
                                    onChange={(speed) => set({ motion: { ...config.motion, speed } })}
                                    options={[
                                        { value: 'off', label: 'Off' },
                                        { value: 'fast', label: 'Fast' },
                                        { value: 'normal', label: 'Normal' },
                                        { value: 'slow', label: 'Slow' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Changing page'}>
                                <Segmented
                                    value={config.motion.page}
                                    onChange={(page) => set({ motion: { ...config.motion, page } })}
                                    options={[
                                        { value: 'fade', label: 'Fade' },
                                        { value: 'slide', label: 'Slide up' },
                                        { value: 'none', label: 'None' },
                                    ]}
                                />
                            </Row>
                            <Toggle
                                label={'Pulse the mark of running servers'}
                                checked={config.motion.pulse}
                                onChange={(pulse) => set({ motion: { ...config.motion, pulse } })}
                            />
                            <p className={'text-xs text-neutral-400'}>
                                People whose device asks for less motion never get animations.
                            </p>
                        </Group>
                        <Group id={'dashboard'}>
                            <Row label={'Servers'}>
                                <Segmented
                                    value={config.layout}
                                    onChange={(layout) => set({ layout })}
                                    options={[
                                        { value: 'list', label: 'List' },
                                        { value: 'grid', label: 'Side by side' },
                                    ]}
                                />
                            </Row>
                            {config.layout === 'grid' && (
                                <Row label={'Side by side, at most'}>
                                    <Segmented<2 | 3>
                                        value={config.columns}
                                        onChange={(columns) => set({ columns })}
                                        options={[
                                            { value: 2, label: '2' },
                                            { value: 3, label: '3' },
                                        ]}
                                    />
                                </Row>
                            )}
                            <Row label={'Spacing'}>
                                <Segmented
                                    value={config.density}
                                    onChange={(density) => set({ density })}
                                    options={[
                                        { value: 'comfortable', label: 'Comfortable' },
                                        { value: 'compact', label: 'Compact' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Size of a server'}>
                                <Segmented
                                    value={config.row.size}
                                    onChange={(size) => set({ row: { ...config.row, size } })}
                                    options={[
                                        { value: 'small', label: 'Small' },
                                        { value: 'medium', label: 'Medium' },
                                        { value: 'large', label: 'Large' },
                                    ]}
                                />
                            </Row>
                            <Row label={'State of a server'}>
                                <Segmented
                                    value={config.row.status}
                                    onChange={(status) => set({ row: { ...config.row, status } })}
                                    options={[
                                        { value: 'bar', label: 'Bar' },
                                        { value: 'dot', label: 'Dot' },
                                        { value: 'none', label: 'Hidden' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Shown on a server (in this order)'}>
                                <ul className={'rounded-lg border border-neutral-500'}>
                                    {[
                                        ...config.row.metrics.map((id) => ROW_METRICS.find((m) => m.id === id)!),
                                        ...ROW_METRICS.filter((m) => !config.row.metrics.includes(m.id)),
                                    ].map((metric) => {
                                        const on = config.row.metrics.includes(metric.id);
                                        const at = config.row.metrics.indexOf(metric.id);

                                        return (
                                            <li
                                                key={metric.id}
                                                className={
                                                    'flex items-center gap-2 border-b border-neutral-500 px-3 py-1.5 last:border-b-0'
                                                }
                                            >
                                                <input
                                                    type={'checkbox'}
                                                    checked={on}
                                                    onChange={(e) => toggleMetric(metric.id, e.currentTarget.checked)}
                                                    className={'h-4 w-4 accent-primary-600'}
                                                />
                                                <span
                                                    className={classNames(
                                                        'flex-1 text-sm',
                                                        on ? 'text-neutral-100' : 'text-neutral-400'
                                                    )}
                                                >
                                                    {metric.label}
                                                </span>
                                                {on && (
                                                    <>
                                                        <button
                                                            type={'button'}
                                                            disabled={at === 0}
                                                            onClick={() => moveMetric(metric.id, -1)}
                                                            className={
                                                                'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 disabled:opacity-30'
                                                            }
                                                            aria-label={'Move up'}
                                                        >
                                                            <ArrowUpIcon className={'h-4 w-4'} />
                                                        </button>
                                                        <button
                                                            type={'button'}
                                                            disabled={at === config.row.metrics.length - 1}
                                                            onClick={() => moveMetric(metric.id, 1)}
                                                            className={
                                                                'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 disabled:opacity-30'
                                                            }
                                                            aria-label={'Move down'}
                                                        >
                                                            <ArrowDownIcon className={'h-4 w-4'} />
                                                        </button>
                                                    </>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </Row>
                            <Toggle
                                label={'Show the address'}
                                checked={config.row.address}
                                onChange={(address) => set({ row: { ...config.row, address } })}
                            />
                            <Toggle
                                label={'Show the description'}
                                checked={config.row.description}
                                onChange={(description) => set({ row: { ...config.row, description } })}
                            />
                        </Group>
                        <Group id={'sidebar'}>
                            <Row label={'Width'}>
                                <Segmented
                                    value={config.sidebarWidth}
                                    onChange={(sidebarWidth) => set({ sidebarWidth })}
                                    options={[
                                        { value: 'narrow', label: 'Narrow' },
                                        { value: 'normal', label: 'Normal' },
                                        { value: 'wide', label: 'Wide' },
                                    ]}
                                />
                            </Row>
                            <Toggle
                                label={'Without its own card'}
                                checked={config.sidebarFlat}
                                onChange={(sidebarFlat) => set({ sidebarFlat })}
                            />
                            <SidebarEditor sidebar={config.sidebar} onChange={(sidebar) => set({ sidebar })} />
                        </Group>
                        <Group id={'console'}>
                            <Row label={'Console colours'}>
                                <Segmented
                                    value={config.console.style}
                                    onChange={(style) => set({ console: { ...config.console, style } })}
                                    options={[
                                        { value: 'match', label: 'Follow the theme' },
                                        { value: 'dark', label: 'Always dark' },
                                    ]}
                                />
                            </Row>
                            <Row label={'Text brightness'}>
                                <Slider
                                    value={config.console.brightness}
                                    min={30}
                                    max={100}
                                    unit={'%'}
                                    onChange={(brightness) => set({ console: { ...config.console, brightness } })}
                                />
                            </Row>
                            <Row label={'Text size'}>
                                <Slider
                                    value={config.console.fontSize}
                                    min={10}
                                    max={20}
                                    unit={'px'}
                                    onChange={(fontSize) => set({ console: { ...config.console, fontSize } })}
                                />
                            </Row>
                        </Group>
                        <Group id={'login'}>
                            <Row label={'Layout'}>
                                <Segmented
                                    value={login.layout}
                                    onChange={(layout) => setLogin({ layout })}
                                    options={[
                                        { value: 'card', label: 'Card' },
                                        { value: 'brand', label: 'Brand shell' },
                                        { value: 'split', label: 'Split' },
                                        { value: 'showcase', label: 'Showcase' },
                                    ]}
                                />
                            </Row>
                            <p className={'text-xs text-neutral-400'}>
                                {
                                    {
                                        card: 'The form in a card in the middle of the page.',
                                        brand: 'One side says who you are, the form is a card on the other.',
                                        split: 'The same, but the form is a plain panel, not a card.',
                                        showcase: 'The background fills the page, the form floats on one side.',
                                    }[login.layout]
                                }
                            </p>
                            {login.layout !== 'card' && (
                                <Row label={'Form on the'}>
                                    <Segmented
                                        value={login.side}
                                        onChange={(side) => setLogin({ side })}
                                        options={[
                                            { value: 'left', label: 'Left' },
                                            { value: 'right', label: 'Right' },
                                        ]}
                                    />
                                </Row>
                            )}
                            <Row label={'Background'}>
                                <Segmented
                                    value={login.background}
                                    onChange={(background) => setLogin({ background })}
                                    options={[
                                        { value: 'none', label: 'None' },
                                        { value: 'gradient', label: 'Gradient' },
                                        { value: 'image', label: 'Image' },
                                        { value: 'scan', label: 'Scanning light' },
                                        { value: 'squares', label: 'Squares' },
                                        { value: 'eggs', label: 'Egg banners' },
                                    ]}
                                />
                            </Row>
                            {login.background === 'gradient' && (
                                <GradientPicker
                                    value={login.gradient}
                                    onChange={(gradient) => setLogin({ gradient })}
                                    custom={config.customGradient}
                                    onCustomChange={(customGradient) => set({ customGradient })}
                                    dark={dark}
                                />
                            )}
                            {login.background === 'image' && (
                                <div className={'space-y-2'}>
                                    <input
                                        ref={loginFile}
                                        type={'file'}
                                        accept={'image/png,image/jpeg,image/webp,image/gif'}
                                        className={'hidden'}
                                        onChange={(e) => {
                                            const picture = e.currentTarget.files?.[0];
                                            e.currentTarget.value = '';
                                            if (picture) upload(picture, (url) => setLogin({ image: url }));
                                        }}
                                    />
                                    <Button.Text
                                        type={'button'}
                                        onClick={() => loginFile.current?.click()}
                                        disabled={working !== null}
                                    >
                                        <UploadIcon className={'mr-1.5 h-4 w-4'} />
                                        {working === 'upload' ? 'Uploading...' : 'Upload a picture'}
                                    </Button.Text>
                                    <input
                                        type={'text'}
                                        value={login.image ?? ''}
                                        placeholder={'Or an https:// address'}
                                        onChange={(e) => setLogin({ image: e.currentTarget.value.trim() || null })}
                                        className={
                                            'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                                        }
                                    />
                                    <Row label={'Blur the picture'}>
                                        <Slider
                                            value={login.blur}
                                            min={0}
                                            max={40}
                                            unit={'px'}
                                            onChange={(blur) => setLogin({ blur })}
                                        />
                                    </Row>
                                </div>
                            )}
                            {['image', 'scan', 'squares', 'eggs'].includes(login.background) && (
                                <Row label={'Dim it with the page colour'}>
                                    <Slider
                                        value={login.dim}
                                        min={0}
                                        max={90}
                                        unit={'%'}
                                        onChange={(dim) => setLogin({ dim })}
                                    />
                                </Row>
                            )}
                            {login.layout !== 'card' && (
                                <>
                                    <Row label={'Title (the name of the panel when empty)'}>
                                        <input
                                            type={'text'}
                                            value={login.title ?? ''}
                                            maxLength={60}
                                            onChange={(e) => setLogin({ title: e.currentTarget.value })}
                                            className={
                                                'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                                            }
                                        />
                                    </Row>
                                    <Row label={'Tagline'}>
                                        <textarea
                                            value={login.tagline ?? ''}
                                            maxLength={160}
                                            rows={2}
                                            onChange={(e) => setLogin({ tagline: e.currentTarget.value })}
                                            className={
                                                'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                                            }
                                        />
                                    </Row>
                                    <Row label={'Highlights (up to 4)'}>
                                        <div className={'space-y-2'}>
                                            {login.features.map((feature, i) => (
                                                <div key={i} className={'flex gap-2'}>
                                                    <input
                                                        type={'text'}
                                                        value={feature}
                                                        maxLength={50}
                                                        onChange={(e) =>
                                                            setLogin({
                                                                features: login.features.map((f, at) =>
                                                                    at === i ? e.currentTarget.value : f
                                                                ),
                                                            })
                                                        }
                                                        className={
                                                            'flex-1 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                                                        }
                                                    />
                                                    <button
                                                        type={'button'}
                                                        className={'text-xs text-primary-600'}
                                                        onClick={() =>
                                                            setLogin({
                                                                features: login.features.filter((_, at) => at !== i),
                                                            })
                                                        }
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                            {login.features.length < 4 && (
                                                <Button.Text
                                                    type={'button'}
                                                    onClick={() => setLogin({ features: [...login.features, ''] })}
                                                >
                                                    Add a highlight
                                                </Button.Text>
                                            )}
                                        </div>
                                    </Row>
                                </>
                            )}
                        </Group>
                        <Group id={'background'}>
                            <Row label={'Background'}>
                                <Segmented
                                    value={kind}
                                    onChange={(next) => {
                                        if (next === 'none') setBackground({ image: null });
                                        else if (next === 'gradient') setBackground({ image: 'gradient:mist' });
                                        else setBackground({ image: kind === 'image' ? image : '' });
                                    }}
                                    options={[
                                        { value: 'none', label: 'None' },
                                        { value: 'gradient', label: 'Gradient' },
                                        { value: 'image', label: 'Image' },
                                    ]}
                                />
                            </Row>
                            {kind === 'gradient' && (
                                <GradientPicker
                                    value={(image ?? '').replace('gradient:', '')}
                                    onChange={(id) => setBackground({ image: `gradient:${id}` })}
                                    custom={config.customGradient}
                                    onCustomChange={(customGradient) => set({ customGradient })}
                                    dark={dark}
                                />
                            )}
                            {kind === 'image' && (
                                <div className={'space-y-2'}>
                                    <input
                                        ref={file}
                                        type={'file'}
                                        accept={'image/png,image/jpeg,image/webp,image/gif'}
                                        className={'hidden'}
                                        onChange={(e) => {
                                            const picture = e.currentTarget.files?.[0];
                                            e.currentTarget.value = '';
                                            if (picture) upload(picture);
                                        }}
                                    />
                                    <Button.Text
                                        type={'button'}
                                        onClick={() => file.current?.click()}
                                        disabled={working !== null}
                                    >
                                        <UploadIcon className={'mr-1.5 h-4 w-4'} />
                                        {working === 'upload' ? 'Uploading...' : 'Upload a picture'}
                                    </Button.Text>
                                    <input
                                        type={'text'}
                                        value={image ?? ''}
                                        placeholder={'Or an https:// address'}
                                        onChange={(e) => setBackground({ image: e.currentTarget.value.trim() })}
                                        className={
                                            'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                                        }
                                    />
                                </div>
                            )}
                            {kind !== 'none' && (
                                <>
                                    <Row label={'Blur the picture'}>
                                        <Slider
                                            value={config.background.blur}
                                            min={0}
                                            max={40}
                                            unit={'px'}
                                            onChange={(blur) => setBackground({ blur })}
                                        />
                                    </Row>
                                    <Row label={'Dim it with the page colour'}>
                                        <Slider
                                            value={config.background.dim}
                                            min={0}
                                            max={90}
                                            unit={'%'}
                                            onChange={(dim) => setBackground({ dim })}
                                        />
                                    </Row>
                                </>
                            )}
                        </Group>
                    </SectionContext.Provider>
                </aside>
                <main className={'min-w-0 lg:sticky lg:top-20 lg:self-start'}>
                    <div className={'mb-3 flex flex-wrap items-center justify-between gap-2'}>
                        <Segmented
                            value={page}
                            onChange={setPage}
                            options={[
                                { value: 'dashboard', label: 'Dashboard' },
                                ...(serverId ? [{ value: 'server' as const, label: 'Server page' }] : []),
                                { value: 'account', label: 'Account' },
                                { value: 'login', label: 'Login page' },
                            ]}
                        />
                        <div className={'flex gap-2'}>
                            <Segmented
                                value={phone ? 'phone' : 'desktop'}
                                onChange={(next) => setPhone(next === 'phone')}
                                options={[
                                    { value: 'desktop', label: 'Desktop' },
                                    { value: 'phone', label: 'Phone' },
                                ]}
                            />
                            <Segmented
                                value={dark ? 'dark' : 'light'}
                                onChange={(next) => setDark(next === 'dark')}
                                options={[
                                    { value: 'light', label: 'Light' },
                                    { value: 'dark', label: 'Dark' },
                                ]}
                            />
                        </div>
                    </div>
                    <LivePreview config={config} dark={dark} page={page} serverId={serverId} phone={phone} />
                    <p className={'mt-3 text-sm text-neutral-400'}>
                        This is the real panel with your draft, nothing changes for anybody until you save.
                    </p>
                </main>
            </div>
        </div>
    );
};
