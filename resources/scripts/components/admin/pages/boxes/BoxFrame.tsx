import React from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { ArrowLeftIcon, ExternalLinkIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import { BoxDetail } from '@/api/boxes';

// [path, label, permissions]
const TABS: [string, string, string[]][] = [
    ['', 'About', ['boxes.view']],
    ['/details', 'Details', ['boxes.view']],
    ['/servers', 'Servers', ['boxes.view']],
    ['/manage', 'Manage', ['boxes.view']],
    ['/delete', 'Delete', ['boxes.delete']],
];

/** The frame of the pages of one box: the title, the tabs and a link to the box as its owner sees it. */
export default ({
    box,
    subtitle,
    children,
}: {
    box: Pick<BoxDetail, 'admin_id' | 'id' | 'name'>;
    subtitle?: string;
    children: React.ReactNode;
}) => {
    const admin = useAdmin();

    return (
        <AdminPage
            title={box.name}
            subtitle={subtitle}
            actions={
                <>
                    <a href={`/boxes/${box.id}`} target={'_blank'} rel={'noopener noreferrer'}>
                        <Button.Text>
                            <ExternalLinkIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Open as the owner
                        </Button.Text>
                    </a>
                    <AdminLink to={'/admin/boxes'}>
                        <Button.Text>
                            <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Boxes
                        </Button.Text>
                    </AdminLink>
                </>
            }
        >
            <nav className={'mb-5 flex flex-wrap gap-1 border-b border-neutral-500'}>
                {TABS.filter(([, , permissions]) => admin.can(...permissions)).map(([path, label]) => (
                    <NavLink
                        key={path}
                        to={`/admin/boxes/view/${box.admin_id}${path}`}
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
