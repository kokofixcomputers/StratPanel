import React, { useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { DesktopComputerIcon, PlusIcon, SearchIcon, TerminalIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useAdmin from '@/plugins/useAdmin';
import { ServerState, useServers } from '@/api/admin/servers';

const STATE: Record<ServerState, [string, 'green' | 'yellow' | 'primary']> = {
    active: ['Active', 'green'],
    installing: ['Installing', 'primary'],
    suspended: ['Suspended', 'yellow'],
};

/** Admin > Servers: every server on the panel. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const ownerId = new URLSearchParams(useLocation().search).get('owner_id');
    const { data, error } = useServers(search, ownerId, page);
    const admin = useAdmin();
    const history = useHistory();

    return (
        <AdminPage title={'Servers'} subtitle={'All servers available on the system.'}>
            <ListHeader
                icon={<DesktopComputerIcon className={'h-6 w-6'} />}
                title={ownerId ? 'Servers of one person' : 'Server list'}
                count={data ? String(data.pagination.total) : undefined}
            >
                <div className={'relative'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400'
                        }
                    />
                    <Input
                        type={'search'}
                        value={search}
                        placeholder={'Search servers'}
                        aria-label={'Search servers'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                {ownerId && (
                    <Link to={'/admin/servers'}>
                        <Button.Text>Show all servers</Button.Text>
                    </Link>
                )}
                {admin.can('servers.create') && (
                    <Button onClick={() => history.push('/admin/servers/new')}>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The servers could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.servers.length === 0 ? (
                    <Empty>{search ? 'No server matches that.' : 'There are no servers yet.'}</Empty>
                ) : (
                    <AdminTable heads={['Server name', 'UUID', 'Owner', 'Node', 'Connection', 'Status', null]}>
                        {data.servers.map((server) => (
                            <Row key={server.id} onClick={() => history.push(`/admin/servers/view/${server.id}`)}>
                                <Cell className={'font-medium text-neutral-50'}>{server.name}</Cell>
                                <Cell>
                                    <code className={'text-xs'} title={server.uuid}>
                                        {server.uuid_short}
                                    </code>
                                </Cell>
                                <Cell>
                                    <AdminLink
                                        to={`/admin/users/view/${server.owner.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {server.owner.username}
                                    </AdminLink>
                                </Cell>
                                <Cell>
                                    <AdminLink
                                        to={`/admin/nodes/view/${server.node.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {server.node.name}
                                    </AdminLink>
                                </Cell>
                                <Cell>
                                    <code className={'text-xs'}>{server.connection}</code>
                                </Cell>
                                <Cell>
                                    <Pill tone={STATE[server.state][1]}>{STATE[server.state][0]}</Pill>
                                </Cell>
                                <Cell>
                                    <a
                                        href={`/server/${server.uuid_short}`}
                                        target={'_blank'}
                                        rel={'noopener noreferrer'}
                                        title={'Open the console'}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <TerminalIcon className={'h-4 w-4'} />
                                    </a>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
            {data && <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-3'} />}
        </AdminPage>
    );
};
