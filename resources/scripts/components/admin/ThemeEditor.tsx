import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, RefreshIcon, UploadIcon } from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import { ColorField, Group, OptionalColor, Row, Segmented, Slider, Toggle } from '@/components/admin/theme/controls';
import SidebarEditor from '@/components/admin/theme/SidebarEditor';
import ThemePreview from '@/components/admin/theme/ThemePreview';
import {
    BASE_NEUTRAL,
    buildThemeCss,
    FONTS,
    FontChoice,
    GRADIENTS,
    PRESETS,
    presetConfig,
    ROW_METRICS,
    RowMetric,
    SurfaceColors,
    ThemeConfig,
    withDefaults,
} from '@/lib/themeConfig';

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
        const attributes = ['data-chrome', 'data-nav'].map((name) => [name, root.getAttribute(name)] as const);
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
    const [page, setPage] = useState<'dashboard' | 'server'>('dashboard');
    const [surfaceMode, setSurfaceMode] = useState<'light' | 'dark'>('light');
    const file = useRef<HTMLInputElement>(null);

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

    const save = () => run('save', () => http.put('/api/client/theme', { config, css: buildThemeCss(config) }));
    const reset = () => {
        if (window.confirm('Go back to the default look? Your uploaded pictures stay on the server.'))
            run('reset', () => http.delete('/api/client/theme'));
    };

    const upload = (picture: File) => {
        setWorking('upload');
        setError(null);
        const form = new FormData();
        form.append('image', picture);
        http.post('/api/client/theme/background', form)
            .then(({ data }) => setBackground({ image: data.url }))
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
            <div className={'grid gap-5 p-5 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]'}>
                <aside
                    className={
                        'overflow-hidden rounded-2xl border border-neutral-500 bg-white shadow-md lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto'
                    }
                >
                    <Group title={'Presets'} hint={'A starting point, change anything after.'} open>
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
                    <Group title={'Colours'} hint={'Accent, secondary and the colours of statuses.'} open>
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
                                        onChange={(value) => set({ status: { ...config.status, [part.key]: value } })}
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
                    <Group title={'Surfaces'} hint={'Page, cards, borders and text, for each mode.'}>
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
                    <Group title={'Shape and type'}>
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
                    <Group title={'Bars, menus and material'}>
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
                        {config.material !== 'off' && !image && (
                            <p className={'text-xs text-neutral-400'}>
                                See-through cards show a background, pick one below.
                            </p>
                        )}
                    </Group>
                    <Group title={'Dashboard'} hint={'How the servers are listed and what a row shows.'}>
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
                    <Group title={'Server sidebar'} hint={'Reorder, hide, or add your own links.'}>
                        <SidebarEditor sidebar={config.sidebar} onChange={(sidebar) => set({ sidebar })} />
                    </Group>
                    <Group title={'Console'} hint={'The text of the server console.'}>
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
                    <Group title={'Background'} hint={'A quiet gradient or a picture behind the panel.'}>
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
                            <div className={'grid grid-cols-3 gap-2'}>
                                {Object.entries(GRADIENTS).map(([id, gradient]) => (
                                    <button
                                        key={id}
                                        type={'button'}
                                        onClick={() => setBackground({ image: `gradient:${id}` })}
                                        className={classNames(
                                            'h-12 rounded-lg border-2 text-xs font-medium text-neutral-100',
                                            image === `gradient:${id}` ? 'border-primary-600' : 'border-neutral-500'
                                        )}
                                        style={{ background: dark ? gradient.dark : gradient.light }}
                                    >
                                        {gradient.label}
                                    </button>
                                ))}
                            </div>
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
                </aside>
                <main className={'min-w-0 lg:sticky lg:top-20 lg:self-start'}>
                    <div className={'mb-3 flex flex-wrap items-center justify-between gap-2'}>
                        <Segmented
                            value={page}
                            onChange={setPage}
                            options={[
                                { value: 'dashboard', label: 'Dashboard' },
                                { value: 'server', label: 'Server page' },
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
                    <ThemePreview config={config} dark={dark} page={page} />
                    <p className={'mt-3 text-sm text-neutral-400'}>Preview, nothing changes until you save.</p>
                </main>
            </div>
        </div>
    );
};
