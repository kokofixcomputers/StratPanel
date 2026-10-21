import React, { useEffect, useMemo, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import classNames from 'classnames';
import {
    ArchiveIcon,
    ChipIcon,
    ClockIcon,
    CloudDownloadIcon,
    CogIcon,
    CubeIcon,
    DatabaseIcon,
    DownloadIcon,
    ExternalLinkIcon,
    FolderIcon,
    GlobeAltIcon,
    LightningBoltIcon,
    MapIcon,
    PuzzleIcon,
    SparklesIcon,
    TerminalIcon,
    UserGroupIcon,
    UsersIcon,
    AdjustmentsIcon,
    ViewListIcon,
} from '@heroicons/react/solid';
import CopyOnClick from '@/components/elements/CopyOnClick';
import AddressMenu from '@/components/server/AddressMenu';
import { connectionAddresses } from '@/lib/connection';
import Sensitive from '@/components/elements/Sensitive';

import Can from '@/components/elements/Can';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import StatusBadge from '@/components/server/console/StatusBadge';
import { useOnlinePlayers } from '@/lib/onlinePlayers';
import { parseProperties, readOptionalFile } from '@/lib/minecraft';
import PowerButtons from '@/components/server/console/PowerButtons';
import useBranding from '@/plugins/useBranding';
import { linksAt } from '@/lib/branding';
import { useThemeConfig } from '@/lib/themeConfig';
import { fillUrl, resolveSidebar, safeUrl } from '@/lib/sidebarLayout';

export interface SidebarItem {
    path: string;
    url: string;
    label: string;
    permission: string | string[] | null;
    exact?: boolean;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    '/': TerminalIcon,
    '/players': UsersIcon,
    '/versions': CloudDownloadIcon,
    '/properties': AdjustmentsIcon,
    '/mods': PuzzleIcon,
    '/worlds': MapIcon,
    '/tools': SparklesIcon,
    '/files': FolderIcon,
    '/import': DownloadIcon,
    '/databases': DatabaseIcon,
    '/schedules': ClockIcon,
    '/users': UserGroupIcon,
    '/backups': ArchiveIcon,
    '/network': GlobeAltIcon,
    '/domains': LightningBoltIcon,
    '/startup': ChipIcon,
    '/settings': CogIcon,
    '/activity': ViewListIcon,
};

const link = (active: boolean) =>
    classNames(
        'nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        { 'is-active': active },
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** The server navigation as a left sidebar on wide screens. Narrow screens keep the horizontal tabs. */
export default ({
    items,
    adminUrl,
    playersUrl,
}: {
    items: SidebarItem[];
    adminUrl?: string;
    // Where the player count links to, left out for servers that have no player list (proxies).
    playersUrl?: string;
}) => {
    const { pathname } = useLocation();
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { online } = useOnlinePlayers(uuid);
    const [canOpenPlayers] = usePermissions(['control.console']);
    const [maxPlayers, setMaxPlayers] = useState(20);

    // The limit lives in server.properties, read it again whenever the server changes state in case it was edited.
    useEffect(() => {
        if (!playersUrl) return;

        readOptionalFile(uuid, '/server.properties').then((content) => {
            const value = parseProperties(content || '').find((line) => line.key === 'max-players')?.value;
            const parsed = parseInt(value || '', 10);
            if (!isNaN(parsed)) setMaxPlayers(parsed);
        });
    }, [uuid, status, playersUrl]);
    const domains = ServerContext.useStoreState((state) => state.server.data!.domains);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations);
    const addresses = useMemo(() => connectionAddresses({ domains, allocations }), [domains, allocations]);
    // A domain when the server has one, else the default allocation.
    const address = addresses[0]?.address ?? null;
    const customLinks = linksAt(useBranding().links, 'sidebar');
    const layout = useThemeConfig().sidebars.server;
    // The categories the admin arranged (or the default ones), with the items this person has.
    const groups = resolveSidebar(
        'server',
        layout,
        items.map((i) => i.path)
    );
    const serverId = ServerContext.useStoreState((state) => state.server.data!.id);

    const renderItem = (item: SidebarItem) => {
        const Icon = ICONS[item.path] || (item.path.startsWith('/ext/') ? PuzzleIcon : CubeIcon);
        const anchor = (
            <Link
                key={item.path}
                to={item.url}
                className={link(!!matchPath(pathname, { path: item.url, exact: item.exact }))}
            >
                <Icon className={'h-5 w-5 flex-shrink-0'} />
                <span className={'truncate'}>{item.label}</span>
            </Link>
        );

        return item.permission ? (
            <Can key={item.path} action={item.permission} matchAny>
                {anchor}
            </Can>
        ) : (
            anchor
        );
    };

    return (
        <aside className={'hidden flex-shrink-0 pl-4 pt-6 lg:block'} style={{ width: 'var(--sidebar-width, 16rem)' }}>
            <nav
                className={
                    'server-sidebar sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-neutral-500 bg-white p-2 shadow-md'
                }
            >
                <div className={'mb-2 border-b border-neutral-500 px-2 pb-3 pt-2'}>
                    <div className={'mb-3 flex items-center justify-between gap-2'}>
                        <p className={'truncate text-sm font-semibold text-neutral-50'}>{name}</p>
                        <StatusBadge />
                    </div>
                    {address && (
                        <div
                            className={
                                'mb-3 flex w-full items-center gap-1 rounded-lg border border-neutral-500 bg-neutral-700/40 pr-1 hover:bg-neutral-600'
                            }
                        >
                            <CopyOnClick text={address}>
                                <button
                                    type={'button'}
                                    title={'Copy connection address'}
                                    className={'min-w-0 flex-1 px-3 py-2 text-left'}
                                >
                                    <span className={'block break-all text-center font-mono text-xs text-neutral-100'}>
                                        <Sensitive>{address}</Sensitive>
                                    </span>
                                </button>
                            </CopyOnClick>
                            <AddressMenu addresses={addresses} />
                        </div>
                    )}
                    {playersUrl && (
                        <Link
                            to={canOpenPlayers ? playersUrl : '#'}
                            onClick={(e) => !canOpenPlayers && e.preventDefault()}
                            title={canOpenPlayers ? 'Open the player list' : undefined}
                            className={
                                'mb-3 flex items-center justify-between rounded-lg border border-neutral-500 bg-neutral-700/40 px-3 py-2 text-sm text-neutral-100 no-underline hover:bg-neutral-600'
                            }
                        >
                            <span className={'flex items-center gap-2 text-neutral-300'}>
                                <UsersIcon className={'h-4 w-4'} />
                                Players
                            </span>
                            <span className={'font-semibold'}>
                                {online.length}/{maxPlayers}
                            </span>
                        </Link>
                    )}
                    <Can action={['control.start', 'control.stop', 'control.restart']} matchAny>
                        <PowerButtons compact className={'flex gap-2'} />
                    </Can>
                </div>
                {groups.map((group) => (
                    <div key={group.id} className={'mb-2 last:mb-0'}>
                        <p className={'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>
                            {group.title}
                        </p>
                        {group.entries.map((entry) => {
                            if (entry.extra) {
                                if (!safeUrl(entry.extra.url)) return null;

                                return (
                                    <a
                                        key={entry.key}
                                        href={fillUrl(entry.extra.url, { id: serverId, uuid })}
                                        target={entry.extra.newTab ? '_blank' : undefined}
                                        rel={'noopener noreferrer'}
                                        className={link(false)}
                                    >
                                        <ExternalLinkIcon className={'h-5 w-5 flex-shrink-0'} />
                                        <span className={'truncate'}>{entry.extra.label}</span>
                                    </a>
                                );
                            }
                            const item = items.find((i) => i.path === entry.key);

                            return item ? renderItem(item) : null;
                        })}
                    </div>
                ))}
                {customLinks.length > 0 && (
                    <div className={'mb-2 mt-2 border-t border-neutral-500 pt-1'}>
                        {customLinks.map((custom, index) => (
                            <a
                                key={`${custom.url}:${index}`}
                                href={custom.url}
                                target={custom.newTab ? '_blank' : undefined}
                                rel={'noopener noreferrer'}
                                className={link(false)}
                            >
                                <ExternalLinkIcon className={'h-5 w-5 flex-shrink-0'} />
                                <span className={'truncate'}>{custom.label}</span>
                            </a>
                        ))}
                    </div>
                )}
                {adminUrl && (
                    <a
                        href={adminUrl}
                        target={'_blank'}
                        rel={'noreferrer'}
                        className={classNames(link(false), 'mt-2 border-t border-neutral-500 pt-3')}
                    >
                        <ExternalLinkIcon className={'h-5 w-5 flex-shrink-0'} />
                        <span>Admin view</span>
                    </a>
                )}
            </nav>
        </aside>
    );
};
