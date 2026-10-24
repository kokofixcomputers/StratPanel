import React from 'react';
import classNames from 'classnames';
import { Link, NavLink } from 'react-router-dom';
import { ColorSwatchIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import useAdmin from '@/plugins/useAdmin';
import { SETTINGS_TABS } from '@/lib/adminNav';

/** The frame of a page of Settings: the title and the row of tabs for the pages of Settings the person may open. */
export default ({
    title,
    subtitle,
    actions,
    children,
}: {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) => {
    const admin = useAdmin();
    const tabs = SETTINGS_TABS.filter((tab) => admin.can(`settings.${tab.key}.view`));

    return (
        <AdminPage title={title} subtitle={subtitle} actions={actions}>
            <nav className={'-mt-2 mb-5 flex flex-wrap gap-1 border-b border-neutral-500'}>
                {tabs.map((tab) => (
                    <React.Fragment key={tab.key}>
                        <NavLink
                            to={`/admin/settings${tab.path}`}
                            exact={tab.path === ''}
                            className={classNames(
                                'rounded-t-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                                'text-neutral-300 hover:text-neutral-50'
                            )}
                            activeClassName={'border-b-2 border-primary-600 !text-primary-700'}
                        >
                            {tab.name}
                        </NavLink>
                        {tab.key === 'branding' && admin.can('settings.branding.update') && (
                            // The theme editor is a page of the panel itself, not of the admin area.
                            <Link
                                to={'/theme-editor'}
                                className={
                                    'flex items-center gap-1 rounded-t-lg px-3 py-2 text-sm font-medium no-underline text-neutral-300 transition-colors hover:text-neutral-50'
                                }
                            >
                                <ColorSwatchIcon className={'h-4 w-4'} />
                                Theme editor
                            </Link>
                        )}
                    </React.Fragment>
                ))}
            </nav>
            {children}
        </AdminPage>
    );
};
