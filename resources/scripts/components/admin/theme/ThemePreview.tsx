import React, { useMemo } from 'react';
import classNames from 'classnames';
import { Button } from '@/components/elements/button/index';
import { consoleTheme } from '@/lib/consoleTheme';
import { arrange, extraKey, safeUrl, SIDEBAR_GROUPS, SIDEBAR_LABELS } from '@/lib/sidebarLayout';
import { buildThemeCss, themeAttributes, ThemeConfig } from '@/lib/themeConfig';

const PREVIEW_SCOPE = { common: '.tp', light: '.tp.theme-light', dark: '.tp.dark' };

const Meter = ({ label, value, ratio, note }: { label: string; value: string; ratio?: number; note?: string }) => (
    <div className={'min-w-0 flex-1'} style={{ minWidth: '5rem' }}>
        <div className={'flex items-baseline justify-between'}>
            <span className={'text-2xs uppercase tracking-wide text-neutral-400'}>{label}</span>
            <span className={'text-xs font-semibold text-neutral-100'}>{value}</span>
        </div>
        {ratio !== undefined && (
            <div className={'mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-600'}>
                <div className={'h-full rounded-full bg-primary-600'} style={{ width: `${ratio}%` }} />
            </div>
        )}
        {note && <p className={'mt-1 text-2xs text-neutral-400'}>{note}</p>}
    </div>
);

const SERVERS = [
    {
        name: 'Survival SMP',
        address: 'play.example.com:25565',
        note: 'Vanilla survival',
        state: 'running',
        cpu: 34,
        memory: 62,
        players: 7,
    },
    {
        name: 'Creative plots',
        address: 'play.example.com:25566',
        note: 'Build in peace',
        state: 'running',
        cpu: 12,
        memory: 41,
        players: 2,
    },
    {
        name: 'Bedwars',
        address: 'play.example.com:25567',
        note: 'Minigames',
        state: 'offline',
        cpu: 0,
        memory: 0,
        players: 0,
    },
    {
        name: 'Lobby',
        address: 'play.example.com:25568',
        note: 'Hub',
        state: 'running',
        cpu: 5,
        memory: 20,
        players: 11,
    },
];

const PreviewServer = ({ server, config }: { server: typeof SERVERS[number]; config: ThemeConfig }) => {
    const card = config.layout === 'grid';
    const running = server.state === 'running';

    return (
        <div
            className={classNames(
                'relative overflow-hidden rounded-xl border border-neutral-500 bg-white shadow',
                config.density === 'compact' ? 'p-3' : 'p-4'
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
                        {config.row.address && (
                            <p className={'truncate font-mono text-xs text-neutral-400'}>{server.address}</p>
                        )}
                        {config.row.description && <p className={'truncate text-sm text-neutral-400'}>{server.note}</p>}
                    </div>
                </div>
                {running ? (
                    <div
                        className={classNames('flex items-center gap-4', card && 'w-full')}
                        style={card ? { display: 'grid', gridTemplateColumns: '1fr 1fr' } : undefined}
                    >
                        {config.row.metrics.map((id) => {
                            switch (id) {
                                case 'players':
                                    return (
                                        <Meter
                                            key={id}
                                            label={'Players'}
                                            value={`${server.players}/20`}
                                            ratio={server.players * 5}
                                        />
                                    );
                                case 'cpu':
                                    return <Meter key={id} label={'CPU'} value={`${server.cpu}%`} ratio={server.cpu} />;
                                case 'memory':
                                    return (
                                        <Meter
                                            key={id}
                                            label={'Memory'}
                                            value={`${server.memory}%`}
                                            ratio={server.memory}
                                        />
                                    );
                                case 'disk':
                                    return <Meter key={id} label={'Disk'} value={'2.1 GiB'} ratio={21} />;
                                case 'uptime':
                                    return (
                                        <Meter
                                            key={id}
                                            label={'Uptime'}
                                            value={'3d 4h'}
                                            note={'since the last start'}
                                        />
                                    );
                                case 'network':
                                    return (
                                        <Meter
                                            key={id}
                                            label={'Network'}
                                            value={'1.4 GiB'}
                                            note={'in 1.1 GiB / out 0.3 GiB'}
                                        />
                                    );
                                default:
                                    return null;
                            }
                        })}
                    </div>
                ) : (
                    <span className={'rounded-full border border-neutral-500 bg-neutral-600 px-3 py-1 text-xs'}>
                        Offline
                    </span>
                )}
            </div>
            <span
                className={classNames(
                    'absolute right-0 top-2 h-[calc(100%-1rem)] w-1.5 rounded-full',
                    running ? 'bg-green-500' : 'bg-red-500'
                )}
            />
        </div>
    );
};

const TopBar = ({ active }: { active: 'dashboard' | 'server' }) => (
    <div className={'app-nav flex items-center justify-between border-b border-neutral-500 bg-white px-5 py-3 shadow'}>
        <div className={'flex items-center gap-3'}>
            <span className={'h-7 w-7 rounded-lg bg-primary-600'} />
            <span className={'font-semibold text-neutral-50'}>Stratosphere</span>
        </div>
        <div className={'flex items-center gap-3'}>
            <span className={'rounded-full border border-neutral-500 px-4 py-1 text-xs text-neutral-400'}>
                Search...
            </span>
            <div className={'nav-right flex items-center gap-1'}>
                <a
                    className={classNames(
                        'flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300',
                        active === 'dashboard' && 'active bg-primary-50 text-primary-600'
                    )}
                >
                    <span className={'h-4 w-4 rounded-sm border-2 border-current'} />
                </a>
                <a className={'flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300'}>
                    <span className={'h-4 w-4 rounded-full border-2 border-current'} />
                </a>
                <span className={'ml-1 h-7 w-7 rounded-full bg-primary-100'} />
            </div>
        </div>
    </div>
);

const PreviewSidebar = ({ config }: { config: ThemeConfig }) => {
    const layout = config.sidebar;
    const groups = [...SIDEBAR_GROUPS.map((g) => g.title), 'More'];

    return (
        <aside className={'w-44 flex-shrink-0'}>
            <nav className={'rounded-xl border border-neutral-500 bg-white p-2 shadow-md'}>
                <div className={'mb-2 border-b border-neutral-500 px-2 pb-2 pt-1'}>
                    <p className={'truncate text-sm font-semibold text-neutral-50'}>Survival SMP</p>
                    <span className={'rounded-full bg-green-50 px-2 py-0.5 text-2xs text-green-700'}>Running</span>
                </div>
                {groups.map((title) => {
                    const entries = arrange(
                        [
                            ...(SIDEBAR_GROUPS.find((g) => g.title === title)?.paths ?? [])
                                .filter((path) => !layout.hidden.includes(path))
                                .map((path) => ({ key: path, label: SIDEBAR_LABELS[path] ?? path })),
                            ...layout.extra
                                .filter((extra) => extra.group === title && safeUrl(extra.url))
                                .map((extra) => ({ key: extraKey(extra.id), label: extra.label })),
                        ],
                        layout.order
                    );
                    if (!entries.length) return null;

                    return (
                        <div key={title} className={'mb-1'}>
                            <p
                                className={
                                    'px-2 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-neutral-400'
                                }
                            >
                                {title}
                            </p>
                            {entries.map((entry) => (
                                <div
                                    key={entry.key}
                                    className={classNames(
                                        'nav-item flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium',
                                        entry.key === '/'
                                            ? 'is-active bg-primary-50 text-primary-700'
                                            : 'text-neutral-300'
                                    )}
                                >
                                    <span
                                        className={
                                            'h-3.5 w-3.5 flex-shrink-0 rounded-sm border-2 border-current opacity-70'
                                        }
                                    />
                                    <span className={'truncate'}>{entry.label}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
};

const LINES: [string, 'foreground' | 'green' | 'yellow' | 'red' | 'blue' | 'brightBlack'][] = [
    ['[12:01:03 INFO]: Starting minecraft server version 1.21.1', 'foreground'],
    ['[12:01:05 INFO]: Loading properties', 'foreground'],
    ['[12:01:08 INFO]: Done (3.214s)! For help, type "help"', 'green'],
    ["[12:03:41 WARN]: Can't keep up! Is the server overloaded?", 'yellow'],
    ['[12:05:10 INFO]: Steve joined the game', 'foreground'],
    ['[12:07:22 ERROR]: Could not pass event PlayerMoveEvent', 'red'],
    ['> say Restarting in 5 minutes', 'blue'],
];

const PreviewConsole = ({ config, dark }: { config: ThemeConfig; dark: boolean }) => {
    const colors = consoleTheme(dark ? 'dark' : 'light', config.console);

    return (
        <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
            <div className={'flex gap-1.5 border-b border-neutral-500 px-3 py-2'}>
                {['All', 'Warnings', 'Errors'].map((label, i) => (
                    <span
                        key={label}
                        className={classNames(
                            'rounded-full border px-2.5 py-0.5 text-2xs',
                            i === 0
                                ? 'border-primary-300 bg-primary-50 text-primary-700'
                                : 'border-neutral-500 text-neutral-300'
                        )}
                    >
                        {label}
                    </span>
                ))}
            </div>
            <div
                className={'p-3 font-mono'}
                style={{ background: colors.background, fontSize: config.console.fontSize, lineHeight: 1.45 }}
            >
                {LINES.map(([text, key], i) => (
                    <p key={i} style={{ color: colors[key], margin: 0 }}>
                        {text}
                    </p>
                ))}
            </div>
        </div>
    );
};

const Status = () => (
    <div className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-lg'}>
        <p className={'mb-3 text-sm font-semibold text-neutral-50'}>Status</p>
        <div className={'flex flex-wrap gap-2 text-xs'}>
            <span className={'rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-700'}>Success</span>
            <span className={'rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-yellow-700'}>
                Warning
            </span>
            <span className={'rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700'}>Danger</span>
            <span className={'rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-primary-700'}>
                Accent
            </span>
        </div>
        <p className={'mt-3 text-sm text-neutral-300'}>
            Text, <span className={'text-primary-600'}>links</span> and{' '}
            <span className={'text-neutral-400'}>muted text</span>.
        </p>
    </div>
);

/** The editor's preview: the dashboard or a server page drawn with the same classes and variables as the panel, scoped to this box. */
export default ({ config, dark, page }: { config: ThemeConfig; dark: boolean; page: 'dashboard' | 'server' }) => {
    const css = useMemo(() => buildThemeCss(config, PREVIEW_SCOPE), [config]);

    return (
        <div
            {...themeAttributes(config)}
            className={classNames(
                'tp relative overflow-hidden rounded-2xl border border-neutral-500',
                dark ? 'dark' : 'theme-light'
            )}
            style={{
                background: 'rgb(var(--c-neutral-800))',
                color: 'rgb(var(--c-neutral-200))',
                fontFamily: 'var(--font-sans, inherit)',
                fontSize: 'calc(var(--font-scale, 100) * 1%)',
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
                <TopBar active={page} />
                {page === 'dashboard' ? (
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
                        <div className={'server-list'}>
                            {SERVERS.map((server) => (
                                <PreviewServer key={server.name} server={server} config={config} />
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
                                    <Button.Text type={'button'}>Cancel</Button.Text>
                                    <Button.Danger type={'button'}>Delete</Button.Danger>
                                </div>
                            </div>
                            <Status />
                        </div>
                    </div>
                ) : (
                    <div className={'flex gap-4 p-5'}>
                        <PreviewSidebar config={config} />
                        <div className={'min-w-0 flex-1 space-y-4'}>
                            <PreviewConsole config={config} dark={dark} />
                            <Status />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
