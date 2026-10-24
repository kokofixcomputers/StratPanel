import React from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Button } from '@/components/elements/button/index';
import { ArrowLeftIcon } from '@heroicons/react/solid';
import useAdmin from '@/plugins/useAdmin';

const TABS: [string, string, string[]][] = [
    ['', 'About', ['nodes.view']],
    ['/settings', 'Settings', ['nodes.view']],
    ['/configuration', 'Configuration', ['nodes.configuration']],
    ['/certificate', 'Certificate', ['nodes.view']],
    ['/allocation', 'Allocation', ['nodes.view']],
    ['/servers', 'Servers', ['nodes.view']],
];

/** The frame of the pages of one node: the title and the tabs. */
export default ({
    id,
    name,
    subtitle,
    actions,
    children,
}: {
    id: number | string;
    name: string;
    subtitle?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) => {
    const admin = useAdmin();

    return (
        <AdminPage
            title={name}
            subtitle={subtitle}
            actions={
                <>
                    {actions}
                    <AdminLink to={'/admin/nodes'}>
                        <Button.Text>
                            <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Nodes
                        </Button.Text>
                    </AdminLink>
                </>
            }
        >
            <nav className={'mb-5 flex flex-wrap gap-1 border-b border-neutral-500'}>
                {TABS.filter(([, , permissions]) => admin.can(...permissions)).map(([path, label]) => (
                    <NavLink
                        key={path}
                        to={`/admin/nodes/view/${id}${path}`}
                        exact
                        className={classNames(
                            'rounded-t-lg px-3 py-2 text-sm font-medium no-underline transition-colors',
                            'text-neutral-300 hover:text-neutral-50'
                        )}
                        activeClassName={'border-b-2 border-primary-600 !text-primary-700'}
                    >
                        {label}
                    </NavLink>
                ))}
            </nav>
            {children}
        </AdminPage>
    );
};
