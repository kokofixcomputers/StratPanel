import React, { useEffect, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import classNames from 'classnames';
import { useStoreState } from 'easy-peasy';
import { AdjustmentsIcon, ExternalLinkIcon, PlusCircleIcon, ServerIcon, UserCircleIcon } from '@heroicons/react/solid';
import { ApplicationStore } from '@/state';
import { getSelfService } from '@/api/selfService';
import { useThemeConfig } from '@/lib/themeConfig';
import { resolveSidebar, safeUrl, SIDEBAR_DEFAULTS } from '@/lib/sidebarLayout';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    '/': ServerIcon,
    '/create': PlusCircleIcon,
    '/account': UserCircleIcon,
    '/admin': AdjustmentsIcon,
};

const link = (active: boolean) =>
    classNames(
        'nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        { 'is-active': active },
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** Whether the sidebar outside of servers is on (the theme editor decides, it is off by default). */
export const useDashboardSidebarOn = (): boolean => useThemeConfig().sidebars.dashboard.enabled;

/** The sidebar of the dashboard and the page to make a server: where to go, in categories the admin arranged. Wide screens only. */
export default () => {
    const { pathname } = useLocation();
    const admin = useStoreState((state: ApplicationStore) => state.user.data?.canAccessAdmin);
    const layout = useThemeConfig().sidebars.dashboard;
    const [canCreate, setCanCreate] = useState(false);

    useEffect(() => {
        getSelfService()
            .then((service) => setCanCreate(!!service.enabled))
            .catch(() => setCanCreate(false));
    }, []);

    const available = ['/', '/account', ...(canCreate ? ['/create'] : []), ...(admin ? ['/admin'] : [])];
    const groups = resolveSidebar('dashboard', layout, available);
    const labels = SIDEBAR_DEFAULTS.dashboard.labels;

    return (
        <aside className={'hidden flex-shrink-0 pl-4 pt-6 lg:block'} style={{ width: 'var(--sidebar-width, 16rem)' }}>
            <nav className={'server-sidebar sticky top-4 rounded-xl border border-neutral-500 bg-white p-2 shadow-md'}>
                {groups.map((group) => (
                    <div key={group.id} className={'mb-2 last:mb-0'}>
                        {(groups.length > 1 || group.title !== 'Panel') && (
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
                            const Icon = ICONS[entry.key] || ServerIcon;
                            const inner = (
                                <>
                                    <Icon className={'h-5 w-5 flex-shrink-0'} />
                                    <span className={'truncate'}>{labels[entry.key] ?? entry.key}</span>
                                </>
                            );

                            // The admin area is a page of its own, outside of this app.
                            return entry.key === '/admin' ? (
                                <a key={entry.key} href={'/admin'} className={link(false)}>
                                    {inner}
                                </a>
                            ) : (
                                <Link
                                    key={entry.key}
                                    to={entry.key}
                                    className={link(!!matchPath(pathname, { path: entry.key, exact: true }))}
                                >
                                    {inner}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
};
