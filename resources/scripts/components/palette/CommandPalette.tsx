import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHistory, useRouteMatch } from 'react-router-dom';
import useSWR from 'swr';
import classNames from 'classnames';
import {
    AdjustmentsIcon,
    ArchiveIcon,
    CheckCircleIcon,
    LightningBoltIcon,
    MoonIcon,
    PlayIcon,
    PlusCircleIcon,
    RefreshIcon,
    SearchIcon,
    ServerIcon,
    StopIcon,
    TerminalIcon,
    UserCircleIcon,
    ViewListIcon,
    XCircleIcon,
} from '@heroicons/react/outline';
import { useStoreState } from 'easy-peasy';
import getServer, { Server } from '@/api/server/getServer';
import getServers, { getAllServers } from '@/api/getServers';
import sendPowerAction from '@/api/server/sendPowerAction';
import createServerBackup from '@/api/server/backups/createServerBackup';
import { getAdminPalette } from '@/api/palette';
import { httpErrorToHuman } from '@/api/http';
import { setThemeChoice, useTheme } from '@/lib/theme';
import { ip } from '@/lib/formatters';
import {
    adminItems,
    goToItems,
    IconKey,
    ListedServer,
    PaletteItem,
    rankItems,
    serverActionItems,
    serverItems,
    serverPageItems,
    verbItems,
} from '@/lib/palette';

const ICONS: Record<IconKey, React.ComponentType<React.ComponentProps<'svg'>>> = {
    server: ServerIcon,
    page: ViewListIcon,
    play: PlayIcon,
    stop: StopIcon,
    restart: RefreshIcon,
    kill: LightningBoltIcon,
    backup: ArchiveIcon,
    admin: AdjustmentsIcon,
    plus: PlusCircleIcon,
    user: UserCircleIcon,
    theme: MoonIcon,
    console: TerminalIcon,
};

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || '');

const toListed = (s: Server): ListedServer => ({
    id: s.id,
    uuid: s.uuid,
    name: s.name,
    node: s.node,
    internalId: s.internalId,
    description: s.description || '',
    address: s.allocations
        .filter((a) => a.isDefault)
        .map((a) => `${a.alias || ip(a.ip)}:${a.port}`)
        .join(' '),
    canControl: s.canControl,
});

type Toast = { text: string; kind: 'ok' | 'error' } | null;

const Dialog = ({ onClose, onToast }: { onClose: () => void; onToast: (toast: Toast) => void }) => {
    const history = useHistory();
    const serverMatch = useRouteMatch<{ id: string }>('/server/:id');
    const canAdmin = useStoreState((state) => state.user.data!.canAccessAdmin);
    const canAll = useStoreState((state) => state.user.data!.canAccessAllServers);
    const { theme } = useTheme();
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [remote, setRemote] = useState<Server[]>([]);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);

    // The same list the dashboard keeps, so it is usually there already.
    const { data: servers } = useSWR<Server[]>(['/api/client/servers', 'all'], getAllServers, {
        revalidateOnFocus: false,
    });
    const { data: admin } = useSWR(canAdmin ? '/api/client/palette' : null, getAdminPalette, {
        revalidateOnFocus: false,
    });
    const serverId = serverMatch?.params.id;
    const { data: current } = useSWR(serverId ? ['palette-server', serverId] : null, () => getServer(serverId!), {
        revalidateOnFocus: false,
    });

    // People who can see every server also find the ones of other users, asked for once something is typed.
    useEffect(() => {
        const term = query.trim();
        if (!canAll || term.length < 2) {
            setRemote([]);
            return;
        }
        let stale = false;
        const timer = setTimeout(() => {
            getServers({ query: term, type: 'admin-all', per_page: 8 })
                .then((result) => !stale && setRemote(result.items))
                .catch(() => !stale && setRemote([]));
        }, 250);

        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [query, canAll]);

    const items = useMemo(() => {
        const own = (servers ?? []).map(toListed);
        const known = new Set(own.map((s) => s.uuid));
        const others = remote.filter((s) => !known.has(s.uuid)).map(toListed);
        const all: PaletteItem[] = [];

        if (current) {
            const [server, granted] = current;
            all.push(
                ...serverActionItems(server, granted, {
                    power: (signal) => sendPowerAction(server.uuid, signal),
                    backup: () => createServerBackup(server.uuid, { isLocked: false }),
                }),
                ...serverPageItems(server, granted)
            );
        }
        all.push(
            ...verbItems(query, [...own, ...others], (uuid, signal) => sendPowerAction(uuid, signal)),
            ...serverItems([...own, ...others], canAdmin, query),
            ...goToItems(),
            ...adminItems(admin ?? [])
        );
        all.push({
            id: 'theme',
            label: theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme',
            group: 'Account',
            words: 'dark mode light appearance',
            icon: 'theme',
            action: {
                type: 'run',
                run: async () => {
                    setThemeChoice(theme === 'dark' ? 'light' : 'dark');
                },
            },
        });

        return all;
    }, [servers, remote, admin, current, query, canAdmin, theme]);

    const sections = useMemo(() => rankItems(items, query), [items, query]);
    const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

    useEffect(() => setActive(0), [query]);
    useEffect(() => input.current?.focus(), []);
    useEffect(() => {
        list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, flat]);

    const choose = (item: PaletteItem | undefined) => {
        if (!item) return;
        onClose();
        const action = item.action;
        if (action.type === 'go') history.push(action.to);
        else if (action.type === 'open') window.location.assign(action.href);
        else {
            onToast({ text: `${item.label}...`, kind: 'ok' });
            action
                .run()
                .then((text) => onToast(text ? { text, kind: 'ok' } : null))
                .catch((e) => onToast({ text: httpErrorToHuman(e), kind: 'error' }));
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(flat[active]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    let index = -1;

    return createPortal(
        <div
            className={'fixed inset-0 z-50 flex items-start justify-center p-4'}
            style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)', paddingTop: '12vh' }}
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                role={'dialog'}
                aria-modal
                aria-label={'Search'}
                className={'w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-500 bg-white shadow-2xl'}
            >
                <div className={'flex items-center gap-3 border-b border-neutral-500 px-4'}>
                    <SearchIcon className={'h-5 w-5 flex-shrink-0 text-neutral-400'} />
                    <input
                        ref={input}
                        value={query}
                        onChange={(e) => setQuery(e.currentTarget.value)}
                        onKeyDown={onKeyDown}
                        role={'combobox'}
                        aria-expanded
                        aria-controls={'palette-list'}
                        aria-activedescendant={flat[active] ? `palette-${flat[active].id}` : undefined}
                        autoComplete={'off'}
                        spellCheck={false}
                        placeholder={'Search servers, pages and actions'}
                        className={
                            'w-full bg-transparent py-4 text-base text-neutral-50 placeholder-neutral-400 outline-none'
                        }
                    />
                    <kbd
                        className={
                            'hidden flex-shrink-0 rounded border border-neutral-500 px-1.5 py-0.5 text-2xs text-neutral-400 sm:block'
                        }
                    >
                        Esc
                    </kbd>
                </div>
                <div ref={list} id={'palette-list'} role={'listbox'} className={'max-h-[55vh] overflow-y-auto p-2'}>
                    {flat.length === 0 && (
                        <p className={'px-3 py-8 text-center text-sm text-neutral-400'}>
                            {servers || query ? 'Nothing found.' : 'Loading...'}
                        </p>
                    )}
                    {sections.map((section) => (
                        <div key={section.group} className={'mb-1'}>
                            <p
                                className={
                                    'px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-neutral-400'
                                }
                            >
                                {section.group}
                            </p>
                            {section.items.map((item) => {
                                index += 1;
                                const mine = index;
                                const Icon = ICONS[item.icon];

                                return (
                                    <div
                                        key={item.id}
                                        id={`palette-${item.id}`}
                                        role={'option'}
                                        aria-selected={mine === active}
                                        onMouseMove={() => active !== mine && setActive(mine)}
                                        onClick={() => choose(item)}
                                        className={classNames(
                                            'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                                            mine === active ? 'bg-primary-50 text-primary-700' : 'text-neutral-100'
                                        )}
                                    >
                                        <Icon className={'h-5 w-5 flex-shrink-0 opacity-80'} />
                                        <span className={'min-w-0 flex-1 truncate font-medium'}>{item.label}</span>
                                        {item.hint && (
                                            <span
                                                className={
                                                    'max-w-[40%] flex-shrink-0 truncate text-xs text-neutral-400'
                                                }
                                            >
                                                {item.hint}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                <div
                    className={
                        'hidden items-center gap-4 border-t border-neutral-500 px-4 py-2 text-2xs text-neutral-400 sm:flex'
                    }
                >
                    <span>↑↓ to move</span>
                    <span>Enter to open</span>
                    <span className={'ml-auto'}>Try &quot;restart&quot; and a server name</span>
                </div>
            </div>
        </div>,
        document.body
    );
};

/** The search box of the top bar, and the window it opens (also with Ctrl or Cmd + K, or / when not typing). */
export default () => {
    const [open, setOpen] = useState(false);
    const [toast, setToast] = useState<Toast>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = !!target && (/^(input|textarea|select)$/i.test(target.tagName) || target.isContentEditable);
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((o) => !o);
            } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', listener);

        return () => window.removeEventListener('keydown', listener);
    }, []);

    const show = (next: Toast) => {
        if (timer.current) clearTimeout(timer.current);
        setToast(next);
        if (next) timer.current = setTimeout(() => setToast(null), next.kind === 'error' ? 6000 : 3500);
    };

    const close = () => {
        setOpen(false);
        setTimeout(() => trigger.current?.focus(), 0);
    };

    return (
        <>
            <button
                ref={trigger}
                type={'button'}
                onClick={() => setOpen(true)}
                aria-label={'Search'}
                aria-haspopup={'dialog'}
                className={
                    'mr-2 flex h-9 items-center gap-2 rounded-lg border border-neutral-500 bg-white px-2.5 text-sm text-neutral-400 transition-colors hover:border-neutral-400 hover:text-neutral-100 md:w-56 md:px-3'
                }
            >
                <SearchIcon className={'h-4 w-4 flex-shrink-0'} />
                <span className={'hidden flex-1 text-left md:block'}>Search...</span>
                <kbd className={'hidden rounded border border-neutral-500 px-1.5 text-2xs md:block'}>
                    {isMac() ? '⌘K' : 'Ctrl K'}
                </kbd>
            </button>
            {open && <Dialog onClose={close} onToast={show} />}
            {toast &&
                createPortal(
                    <div
                        role={'status'}
                        aria-live={'polite'}
                        className={classNames(
                            'fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm shadow-xl',
                            toast.kind === 'error'
                                ? 'border-red-200 text-red-700'
                                : 'border-neutral-500 text-neutral-50'
                        )}
                    >
                        {toast.kind === 'error' ? (
                            <XCircleIcon className={'h-5 w-5 flex-shrink-0'} />
                        ) : toast.text.endsWith('...') ? (
                            <RefreshIcon className={'h-5 w-5 flex-shrink-0 animate-spin text-neutral-400'} />
                        ) : (
                            <CheckCircleIcon className={'h-5 w-5 flex-shrink-0 text-green-600'} />
                        )}
                        {toast.text}
                    </div>,
                    document.body
                )}
        </>
    );
};
