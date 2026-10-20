import React, { useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowLeftIcon, RefreshIcon, UploadIcon } from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import {
    ButtonStyle,
    buildThemeCss,
    FONTS,
    FontChoice,
    GRADIENTS,
    PRESETS,
    presetConfig,
    RadiusStyle,
    ShadowStyle,
    ThemeConfig,
    withDefaults,
} from '@/lib/themeConfig';

const PREVIEW_SCOPE = { common: '.tp', light: '.tp.theme-light', dark: '.tp.dark' };
const SWATCHES = ['#1447e6', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#e11d48', '#c026d3', '#7c3aed', '#111827'];

// ---- small controls ---------------------------------------------------------------------------------------------------------------

const Group = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <section className={'border-b border-neutral-500 px-5 py-4 last:border-b-0'}>
        <h3 className={'text-sm font-semibold text-neutral-50'}>{title}</h3>
        {hint && <p className={'mt-0.5 text-xs text-neutral-400'}>{hint}</p>}
        <div className={'mt-3 space-y-3'}>{children}</div>
    </section>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
        <p className={'mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400'}>{label}</p>
        {children}
    </div>
);

function Segmented<T extends string | number>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className={'flex flex-wrap gap-1.5'}>
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={classNames(
                        'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                        option.value === value
                            ? 'border-primary-600 bg-primary-50 font-medium text-primary-700'
                            : 'border-neutral-500 text-neutral-300 hover:bg-neutral-600'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

const ColorField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);

    return (
        <div className={'flex items-center gap-2'}>
            <input
                type={'color'}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                className={'h-9 w-12 cursor-pointer rounded-lg border border-neutral-500 bg-transparent p-0.5'}
                aria-label={'Pick a colour'}
            />
            <input
                type={'text'}
                value={text}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => {
                    setText(e.currentTarget.value);
                    if (/^#[0-9a-fA-F]{6}$/.test(e.currentTarget.value)) onChange(e.currentTarget.value.toLowerCase());
                }}
                className={
                    'w-28 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 font-mono text-sm text-neutral-100'
                }
            />
        </div>
    );
};

const Slider = ({
    value,
    min,
    max,
    unit,
    onChange,
}: {
    value: number;
    min: number;
    max: number;
    unit: string;
    onChange: (value: number) => void;
}) => (
    <div className={'flex items-center gap-3'}>
        <input
            type={'range'}
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
            className={'h-1.5 flex-1 cursor-pointer accent-primary-600'}
        />
        <span className={'w-14 text-right font-mono text-xs text-neutral-300'}>
            {value}
            {unit}
        </span>
    </div>
);

// ---- the preview ------------------------------------------------------------------------------------------------------------------

const Meter = ({ label, value, ratio, card }: { label: string; value: string; ratio: number; card: boolean }) => (
    <div className={card ? 'min-w-[5rem] flex-1' : 'w-28'}>
        <div className={'flex items-baseline justify-between'}>
            <span className={'text-2xs uppercase tracking-wide text-neutral-400'}>{label}</span>
            <span className={'text-xs font-semibold text-neutral-100'}>{value}</span>
        </div>
        <div className={'mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-600'}>
            <div className={'h-full rounded-full bg-primary-600'} style={{ width: `${ratio}%` }} />
        </div>
    </div>
);

const SERVERS = [
    { name: 'Survival SMP', address: 'play.example.com:25565', state: 'running', cpu: 34, memory: 62, players: 7 },
    { name: 'Creative plots', address: 'play.example.com:25566', state: 'running', cpu: 12, memory: 41, players: 2 },
    { name: 'Bedwars', address: 'play.example.com:25567', state: 'offline', cpu: 0, memory: 0, players: 0 },
    { name: 'Lobby', address: 'play.example.com:25568', state: 'running', cpu: 5, memory: 20, players: 11 },
];

const PreviewServer = ({
    server,
    card,
    compact,
}: {
    server: typeof SERVERS[number];
    card: boolean;
    compact: boolean;
}) => (
    <div
        className={classNames(
            'relative flex items-center overflow-hidden rounded-xl border border-neutral-500 bg-white shadow',
            compact ? 'p-3' : 'p-4'
        )}
    >
        <div className={classNames('flex w-full items-center gap-4', card && 'flex-wrap')}>
            <div className={'flex min-w-0 flex-1 items-center'} style={{ flexBasis: card ? '100%' : undefined }}>
                <div
                    className={
                        'mr-3 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600'
                    }
                >
                    <span className={'text-sm font-bold'}>{server.name[0]}</span>
                </div>
                <div className={'min-w-0'}>
                    <p className={'truncate text-base font-semibold text-neutral-50'}>{server.name}</p>
                    <p className={'truncate font-mono text-xs text-neutral-400'}>{server.address}</p>
                </div>
            </div>
            {server.state === 'running' ? (
                <div className={classNames('flex items-center gap-4', card ? 'w-full' : 'justify-end')}>
                    <Meter label={'Players'} value={String(server.players)} ratio={server.players * 8} card={card} />
                    <Meter label={'CPU'} value={`${server.cpu}%`} ratio={server.cpu} card={card} />
                    <Meter label={'Memory'} value={`${server.memory}%`} ratio={server.memory} card={card} />
                </div>
            ) : (
                <span className={'rounded-full border border-neutral-500 bg-neutral-600 px-3 py-1 text-xs'}>
                    Offline
                </span>
            )}
            <span
                className={classNames(
                    'absolute right-0 top-2 h-[calc(100%-1rem)] w-1.5 rounded-full',
                    server.state === 'running' ? 'bg-green-500' : 'bg-red-500'
                )}
            />
        </div>
    </div>
);

const Preview = ({ config, dark }: { config: ThemeConfig; dark: boolean }) => {
    const css = useMemo(() => buildThemeCss(config, PREVIEW_SCOPE), [config]);
    const grid = config.layout === 'grid';

    return (
        <div
            className={classNames(
                'tp relative overflow-hidden rounded-2xl border border-neutral-500',
                dark ? 'dark' : 'theme-light'
            )}
            style={{
                background: 'rgb(var(--c-neutral-800))',
                color: 'rgb(var(--c-neutral-200))',
                fontFamily: 'var(--font-sans, inherit)',
            }}
        >
            <style>{css}</style>
            <div
                aria-hidden
                className={'pointer-events-none absolute inset-0'}
                style={{
                    background: 'var(--bg-image, none) center / cover no-repeat',
                    filter: 'blur(var(--bg-blur, 0px))',
                    transform: 'scale(1.05)',
                }}
            />
            <div
                aria-hidden
                className={'pointer-events-none absolute inset-0'}
                style={{ background: 'rgb(var(--c-neutral-800) / var(--bg-dim, 0))' }}
            />
            <div className={'relative'}>
                <div
                    className={
                        'flex items-center justify-between border-b border-neutral-500 bg-white px-5 py-3 shadow'
                    }
                >
                    <div className={'flex items-center gap-3'}>
                        <span className={'h-7 w-7 rounded-lg bg-primary-600'} />
                        <span className={'font-semibold text-neutral-50'}>Stratosphere</span>
                    </div>
                    <div className={'flex items-center gap-3'}>
                        <span className={'rounded-full border border-neutral-500 px-4 py-1 text-xs text-neutral-400'}>
                            Search...
                        </span>
                        <span className={'h-7 w-7 rounded-full bg-primary-100'} />
                    </div>
                </div>
                <div className={'p-5'}>
                    <div className={'mb-4 flex flex-wrap items-end justify-between gap-3'}>
                        <div>
                            <h2 className={'text-2xl font-bold tracking-tight text-neutral-50'}>Your servers</h2>
                            <p className={'text-sm text-neutral-400'}>4 servers on your account</p>
                        </div>
                        <div className={'flex gap-2'}>
                            <Button type={'button'}>Create new</Button>
                            <Button.Text type={'button'}>Folders</Button.Text>
                        </div>
                    </div>
                    <div
                        className={'server-list'}
                        style={{ gridTemplateColumns: `repeat(var(--server-columns, 1), minmax(0, 1fr))` }}
                    >
                        {SERVERS.map((server) => (
                            <PreviewServer
                                key={server.name}
                                server={server}
                                card={grid}
                                compact={config.density === 'compact'}
                            />
                        ))}
                    </div>
                    <div className={'mt-5 grid gap-4 sm:grid-cols-2'}>
                        <div className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
                            <p className={'mb-3 text-sm font-semibold text-neutral-50'}>Controls</p>
                            <input
                                readOnly
                                value={'Server name'}
                                className={
                                    'mb-3 w-full border border-neutral-500 bg-white px-4 py-2 text-sm text-neutral-100'
                                }
                                style={{ borderRadius: 'var(--input-radius, var(--r-lg, 0.75rem))' }}
                            />
                            <div className={'flex flex-wrap gap-2'}>
                                <Button type={'button'}>Save</Button>
                                <Button variant={Options.Variant.Secondary} type={'button'} className={'!bg-white'}>
                                    Cancel
                                </Button>
                                <Button.Danger type={'button'}>Delete</Button.Danger>
                            </div>
                        </div>
                        <div className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-lg'}>
                            <p className={'mb-3 text-sm font-semibold text-neutral-50'}>Status</p>
                            <div className={'flex flex-wrap gap-2 text-xs'}>
                                <span
                                    className={
                                        'rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-700'
                                    }
                                >
                                    Online
                                </span>
                                <span
                                    className={
                                        'rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-yellow-700'
                                    }
                                >
                                    Installing
                                </span>
                                <span className={'rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700'}>
                                    Suspended
                                </span>
                                <span
                                    className={
                                        'rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-primary-700'
                                    }
                                >
                                    Accent
                                </span>
                            </div>
                            <p className={'mt-3 text-sm text-neutral-300'}>
                                Text, links and <span className={'text-primary-600'}>highlights</span> follow the
                                accent.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ---- the page ---------------------------------------------------------------------------------------------------------------------

export default () => {
    const [config, setConfig] = useState<ThemeConfig | null>(null);
    const [saved, setSaved] = useState<ThemeConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [working, setWorking] = useState<null | 'save' | 'reset' | 'upload'>(null);
    const [dark, setDark] = useState(false);
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
            <div className={'grid gap-5 p-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'}>
                <aside
                    className={
                        'overflow-hidden rounded-2xl border border-neutral-500 bg-white shadow-md lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto'
                    }
                >
                    <Group title={'Presets'} hint={'A starting point, change anything after.'}>
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
                    <Group title={'Colours'}>
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
                    <Group title={'Shape'}>
                        <Row label={'Corners'}>
                            <Segmented<RadiusStyle>
                                value={config.radius}
                                onChange={(radius) => set({ radius })}
                                options={[
                                    { value: 'sharp', label: 'Sharp' },
                                    { value: 'soft', label: 'Soft' },
                                    { value: 'round', label: 'Round' },
                                    { value: 'pill', label: 'Pill' },
                                ]}
                            />
                        </Row>
                        <Row label={'Buttons and fields'}>
                            <Segmented<ButtonStyle>
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
                            <Segmented<ShadowStyle>
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
                    </Group>
                    <Group title={'Layout'} hint={'How the servers of the dashboard are shown.'}>
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
                    </Group>
                    <Group
                        title={'Background'}
                        hint={'A picture behind the panel. Make the cards see-through to let it show.'}
                    >
                        <Row label={'Picture'}>
                            <Segmented
                                value={kind}
                                onChange={(next) => {
                                    if (next === 'none') setBackground({ image: null });
                                    else if (next === 'gradient') setBackground({ image: 'gradient:aurora' });
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
                                            'h-12 rounded-lg border-2 text-xs font-medium text-snow',
                                            image === `gradient:${id}` ? 'border-primary-600' : 'border-transparent'
                                        )}
                                        style={{ background: gradient.css, textShadow: '0 1px 2px rgba(0,0,0,.5)' }}
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
                        <Row label={'Cards see-through'}>
                            <Slider
                                value={config.glass}
                                min={0}
                                max={70}
                                unit={'%'}
                                onChange={(glass) => set({ glass })}
                            />
                        </Row>
                        {config.glass > 0 && (
                            <Row label={'Blur behind the cards'}>
                                <Slider
                                    value={config.glassBlur}
                                    min={0}
                                    max={30}
                                    unit={'px'}
                                    onChange={(glassBlur) => set({ glassBlur })}
                                />
                            </Row>
                        )}
                    </Group>
                </aside>
                <main className={'min-w-0 lg:sticky lg:top-20 lg:self-start'}>
                    <div className={'mb-3 flex items-center justify-between'}>
                        <p className={'text-sm text-neutral-400'}>Preview, nothing changes until you save.</p>
                        <div className={'flex gap-1.5'}>
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
                    <Preview config={config} dark={dark} />
                </main>
            </div>
        </div>
    );
};
