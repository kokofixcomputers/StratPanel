import React from 'react';
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
} from '@heroicons/react/solid';
import { ApplicationStore } from '@/state';
import Avatar from '@/components/Avatar';
import routes from '@/routers/routes';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    '/': UserCircleIcon,
    '/api': KeyIcon,
    '/ssh': TerminalIcon,
    '/activity': ViewListIcon,
};

const link = (active: boolean) =>
    classNames(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors duration-150',
        active ? 'bg-primary-50 text-primary-700' : 'text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'
    );

/** The account pages as a left sidebar on wide screens, narrow screens keep the horizontal tabs. */
export default () => {
    const { pathname } = useLocation();
    const user = useStoreState((state: ApplicationStore) => state.user.data!);

    return (
        <aside className={'hidden w-64 flex-shrink-0 pl-4 pt-6 lg:block'}>
            <nav className={'sticky top-4 rounded-xl border border-neutral-500 bg-white p-2 shadow-md'}>
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
                        <p className={'truncate text-xs text-neutral-300'}>{user.email}</p>
                    </div>
                </div>
                {routes.account
                    .filter((route) => !!route.name)
                    .map(({ path, name, exact = false }) => {
                        const url = `/account/${path}`.replace('//', '/').replace(/\/$/, '') || '/account';
                        const Icon = ICONS[path === '/' ? '/' : `/${path.replace(/^\//, '')}`] || UserCircleIcon;

                        return (
                            <Link key={path} to={url} className={link(!!matchPath(pathname, { path: url, exact }))}>
                                <Icon className={'h-5 w-5 flex-shrink-0'} />
                                <span className={'truncate'}>{name}</span>
                            </Link>
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
