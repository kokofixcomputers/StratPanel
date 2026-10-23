import React from 'react';
import Sensitive from '@/components/elements/Sensitive';
import { Link, matchPath, useLocation } from 'react-router-dom';
import classNames from 'classnames';
import { useStoreState } from 'easy-peasy';
import {
    ArrowLeftIcon,
    KeyIcon,
    UserCircleIcon,
    ViewListIcon,
    TerminalIcon,
    ShieldCheckIcon,
    LinkIcon,
    ExternalLinkIcon,
    FingerPrintIcon,
    ChartBarIcon,
} from '@heroicons/react/solid';
import { ApplicationStore } from '@/state';
import { useThemeConfig } from '@/lib/themeConfig';
import { resolveSidebar, safeUrl } from '@/lib/sidebarLayout';
import Avatar from '@/components/Avatar';
import routes from '@/routers/routes';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    '/': UserCircleIcon,
    '/resources': ChartBarIcon,
    '/api': KeyIcon,
    '/ssh': TerminalIcon,
    '/providers': LinkIcon,
    '/passkeys': FingerPrintIcon,
    '/activity': ViewListIcon,
};

const link = (active: boolean) =>
    classNames(
        'nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        { 'is-active': active },
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** The account pages as a left sidebar on wide screens, narrow screens keep the horizontal tabs. */
export default () => {
    const { pathname } = useLocation();
    const user = useStoreState((state: ApplicationStore) => state.user.data!);
    const layout = useThemeConfig().sidebars.account;
    const pages = routes.account.filter((route) => !!route.name);
    const keyOf = (path: string) => (path === '/' ? '/' : `/${path.replace(/^\//, '')}`);
    const groups = resolveSidebar(
        'account',
        layout,
        pages.map((route) => keyOf(route.path))
    );

    return (
        <aside className={'hidden flex-shrink-0 pl-4 pt-6 lg:block'} style={{ width: 'var(--sidebar-width, 16rem)' }}>
            <nav className={'server-sidebar sticky top-4 rounded-xl border border-neutral-500 bg-white p-2 shadow-md'}>
                <div className={'mb-2 flex items-center gap-3 border-b border-neutral-500 px-2 pb-3 pt-2'}>
                    <span className={'h-11 w-11 flex-shrink-0 overflow-hidden rounded-full'}>
                        <Avatar.User size={44} />
                    </span>
                    <div className={'min-w-0'}>
                        <p className={'flex items-center truncate text-sm font-semibold text-neutral-50'}>
                            <span className={'truncate'}>{user.username}</span>
                            {user.rootAdmin && (
                                <ShieldCheckIcon
                                    className={'ml-1 h-4 w-4 flex-shrink-0 text-primary-600'}
                                    title={'Administrator'}
                                />
                            )}
                        </p>
                        <p className={'truncate text-xs text-neutral-300'}>
                            <Sensitive>{user.email}</Sensitive>
                        </p>
                    </div>
                </div>
                {groups.map((group) => (
                    <div key={group.id} className={'mb-2 last:mb-0'}>
                        {groups.length > 1 && (
                            <p
                                className={
                                    'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'
                                }
                            >
                                {group.title}
                            </p>
                        )}
                        {group.entries.map((entry) => {
                            if (entry.extra) {
                                if (!safeUrl(entry.extra.url)) return null;

                                return (
                                    <a
                                        key={entry.key}
                                        href={entry.extra.url}
                                        target={entry.extra.newTab ? '_blank' : undefined}
                                        rel={'noopener noreferrer'}
                                        className={link(false)}
                                    >
                                        <ExternalLinkIcon className={'h-5 w-5 flex-shrink-0'} />
                                        <span className={'truncate'}>{entry.extra.label}</span>
                                    </a>
                                );
                            }
                            const route = pages.find((r) => keyOf(r.path) === entry.key);
                            if (!route) return null;
                            const url = `/account/${route.path}`.replace('//', '/').replace(/\/$/, '') || '/account';
                            const Icon = ICONS[entry.key] || UserCircleIcon;

                            return (
                                <Link
                                    key={entry.key}
                                    to={url}
                                    className={link(!!matchPath(pathname, { path: url, exact: route.exact ?? false }))}
                                >
                                    <Icon className={'h-5 w-5 flex-shrink-0'} />
                                    <span className={'truncate'}>{route.name}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
                <Link to={'/'} className={classNames(link(false), 'mt-2 border-t border-neutral-500 pt-3')}>
                    <ArrowLeftIcon className={'h-5 w-5 flex-shrink-0'} />
                    <span>Back to servers</span>
                </Link>
            </nav>
        </aside>
    );
};
