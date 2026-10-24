import React from 'react';
import classNames from 'classnames';
import { NavLink } from 'react-router-dom';
import { ArrowLeftIcon, ExternalLinkIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import { ServerDetails } from '@/api/admin/servers';

// [path, label, only for a server that is installed]
const TABS: [string, string, boolean, string[]][] = [
    ['', 'About', false, ['servers.view']],
    ['/details', 'Details', true, ['servers.view']],
    ['/build', 'Build configuration', true, ['servers.view']],
    ['/startup', 'Startup', true, ['servers.view']],
    ['/database', 'Database', true, ['servers.view']],
    ['/mounts', 'Mounts', true, ['servers.view']],
    ['/domains', 'Domains', true, ['servers.view']],
    ['/manage', 'Manage', false, ['servers.view']],
    ['/delete', 'Delete', false, ['servers.delete']],
];

/** The frame of the pages of one server: the title, the tabs and a link to the server as its owner sees it. */
export default ({
    server,
    subtitle,
    children,
}: {
    server: Pick<ServerDetails, 'id' | 'name' | 'uuid_short' | 'state'>;
    subtitle?: string;
    children: React.ReactNode;
}) => {
    const admin = useAdmin();

    return (
        <AdminPage
            title={server.name}
            subtitle={subtitle}
            actions={
                <>
                    <a href={`/server/${server.uuid_short}`} target={'_blank'} rel={'noopener noreferrer'}>
                        <Button.Text>
                            <ExternalLinkIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Open server
                        </Button.Text>
                    </a>
                    <AdminLink to={'/admin/servers'}>
                        <Button.Text>
                            <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Servers
                        </Button.Text>
                    </AdminLink>
                </>
            }
        >
            <nav className={'mb-5 flex flex-wrap gap-1 border-b border-neutral-500'}>
                {TABS.filter(
                    ([, , needsInstall, permissions]) =>
                        admin.can(...permissions) && (!needsInstall || server.state !== 'installing')
                ).map(([path, label]) => (
                    <NavLink
                        key={path}
                        to={`/admin/servers/view/${server.id}${path}`}
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
