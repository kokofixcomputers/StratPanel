import React from 'react';
import classNames from 'classnames';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { ArrowLeftIcon, ColorSwatchIcon } from '@heroicons/react/solid';
import { adminUrl, GROUPS, PAGES, pageUrl } from '@/lib/adminNav';
import useAdmin from '@/plugins/useAdmin';

const link = (active: boolean) =>
    classNames(
        'nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        { 'is-active': active },
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** The pages of the admin area, as the left sidebar the account pages have. */
export default () => {
    const { pathname } = useLocation();
    const admin = useAdmin();
    const pages = PAGES.filter((page) => admin.canOpen(page));

    return (
        <aside className={'hidden flex-shrink-0 pl-4 pt-6 lg:block'} style={{ width: 'var(--sidebar-width, 16rem)' }}>
            <nav className={'server-sidebar sticky top-4 rounded-xl border border-neutral-500 bg-white p-2 shadow-md'}>
                <p className={'px-3 pb-2 pt-2 text-sm font-semibold text-neutral-50'}>Administration</p>
                {GROUPS.map((group) => {
                    const entries = pages.filter((page) => page.group === group.id);
                    if (entries.length === 0) return null;

                    return (
                        <div key={group.id} className={'mb-2 last:mb-0'}>
                            {group.title && (
                                <p
                                    className={
                                        'px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'
                                    }
                                >
                                    {group.title}
                                </p>
                            )}
                            {entries.map((page) => {
                                const url = pageUrl(page, admin.permissions, admin.root);
                                const active =
                                    page.path === ''
                                        ? !!matchPath(pathname, { path: '/admin', exact: true })
                                        : pathname.startsWith(adminUrl(page.path));
                                const Icon = page.icon;
                                const content = (
                                    <>
                                        <Icon className={'h-5 w-5 flex-shrink-0'} />
                                        <span className={'truncate'}>{page.name}</span>
                                    </>
                                );

                                return page.ported ? (
                                    <Link key={page.key} to={url} className={link(active)}>
                                        {content}
                                    </Link>
                                ) : (
                                    <a key={page.key} href={url} className={link(false)}>
                                        {content}
                                    </a>
                                );
                            })}
                            {group.id === 'main' && admin.can('settings.branding.update') && (
                                // The theme editor is a page of the panel itself, not of the admin area.
                                <Link to={'/theme-editor'} className={link(false)}>
                                    <ColorSwatchIcon className={'h-5 w-5 flex-shrink-0'} />
                                    <span className={'truncate'}>Theme editor</span>
                                </Link>
                            )}
                        </div>
                    );
                })}
                <Link to={'/'} className={classNames(link(false), 'mt-2 border-t border-neutral-500 pt-3')}>
                    <ArrowLeftIcon className={'h-5 w-5 flex-shrink-0'} />
                    <span>Back to servers</span>
                </Link>
            </nav>
        </aside>
    );
};
