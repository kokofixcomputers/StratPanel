import React from 'react';
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
    ExternalLinkIcon,
    FolderIcon,
    GlobeAltIcon,
    LightningBoltIcon,
    PuzzleIcon,
    TerminalIcon,
    UserGroupIcon,
    UsersIcon,
    AdjustmentsIcon,
    ViewListIcon,
} from '@heroicons/react/solid';
import CopyOnClick from '@/components/elements/CopyOnClick';
import { ip } from '@/lib/formatters';
import Can from '@/components/elements/Can';
import { ServerContext } from '@/state/server';
import StatusBadge from '@/components/server/console/StatusBadge';
import PowerButtons from '@/components/server/console/PowerButtons';

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
    '/files': FolderIcon,
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

const GROUPS: { title: string; paths: string[] }[] = [
    { title: 'Server', paths: ['/', '/players'] },
    { title: 'Minecraft', paths: ['/versions', '/properties', '/mods'] },
    { title: 'Manage', paths: ['/files', '/databases', '/schedules', '/backups', '/users'] },
    { title: 'Configuration', paths: ['/network', '/domains', '/startup', '/settings', '/activity'] },
];

const link = (active: boolean) =>
    classNames(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** The server navigation as a left sidebar on wide screens. Narrow screens keep the horizontal tabs. */
export default ({ items, adminUrl }: { items: SidebarItem[]; adminUrl?: string }) => {
    const { pathname } = useLocation();
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const address = ServerContext.useStoreState((state) => {
        const match = state.server.data!.allocations.find((allocation) => allocation.isDefault);

        return match ? `${match.alias || ip(match.ip)}:${match.port}` : null;
    });
    const known = new Set(GROUPS.flatMap((g) => g.paths));
    const groups = [...GROUPS, { title: 'More', paths: items.map((i) => i.path).filter((path) => !known.has(path)) }];

    const renderItem = (item: SidebarItem) => {
        const Icon = ICONS[item.path] || CubeIcon;
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
        <aside className={'hidden w-64 flex-shrink-0 pl-4 pt-6 lg:block'}>
            <nav
                className={
                    'sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-neutral-500 bg-white p-2 shadow-md'
                }
            >
                <div className={'mb-2 border-b border-neutral-500 px-2 pb-3 pt-2'}>
                    <div className={'mb-3 flex items-center justify-between gap-2'}>
                        <p className={'truncate text-sm font-semibold text-neutral-50'}>{name}</p>
                        <StatusBadge />
                    </div>
                    {address && (
                        <CopyOnClick text={address}>
                            <button
                                type={'button'}
                                title={'Copy connection address'}
                                className={
                                    'mb-3 flex w-full items-center justify-center rounded-lg border border-neutral-500 bg-neutral-700/40 px-3 py-2 text-left hover:bg-neutral-600'
                                }
                            >
                                <span className={'break-all text-center font-mono text-xs text-neutral-100'}>
                                    {address}
                                </span>
                            </button>
                        </CopyOnClick>
                    )}
                    <Can action={['control.start', 'control.stop', 'control.restart']} matchAny>
                        <PowerButtons compact className={'flex gap-2'} />
                    </Can>
                </div>
                {groups.map((group) => {
                    const entries = group.paths
                        .map((path) => items.find((item) => item.path === path))
                        .filter((item): item is SidebarItem => !!item);
                    if (!entries.length) return null;

                    return (
                        <div key={group.title} className={'mb-2 last:mb-0'}>
                            <p
                                className={
                                    'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'
                                }
                            >
                                {group.title}
                            </p>
                            {entries.map(renderItem)}
                        </div>
                    );
                })}
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
