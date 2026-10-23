import React, { useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { LockClosedIcon, LockOpenIcon, PlusIcon, SearchIcon, StarIcon, UsersIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import Sensitive from '@/components/elements/Sensitive';
import useAdmin from '@/plugins/useAdmin';
import { useUsers } from '@/api/admin/users';

/** Admin > Users: the accounts of the panel. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, error } = useUsers(search, page);
    const admin = useAdmin();
    const history = useHistory();

    return (
        <AdminPage title={'Users'} subtitle={'All users that exist on the system.'}>
            <ListHeader
                icon={<UsersIcon className={'h-6 w-6'} />}
                title={'User list'}
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
                        placeholder={'Search by email or username'}
                        aria-label={'Search users'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                {admin.can('users.create') && (
                    <Link to={'/admin/users/new'}>
                        <Button>
                            <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Create new
                        </Button>
                    </Link>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The users could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.users.length === 0 ? (
                    <Empty>{search ? 'No user matches that.' : 'There are no users yet.'}</Empty>
                ) : (
                    <AdminTable heads={['', 'Email', 'Client name', 'Username', '2FA', 'Servers owned', 'Can access']}>
                        {data.users.map((user) => (
                            <Row key={user.id} onClick={() => history.push(`/admin/users/view/${user.id}`)}>
                                <Cell>
                                    <img src={user.gravatar} alt={''} className={'h-7 w-7 rounded-full'} />
                                </Cell>
                                <Cell>
                                    <span className={'font-medium text-neutral-50'}>
                                        <Sensitive>{user.email}</Sensitive>
                                    </span>{' '}
                                    {user.root_admin && (
                                        <span title={'Root admin: can do everything'}>
                                            <Pill tone={'yellow'}>
                                                <StarIcon className={'-mt-0.5 mr-1 inline h-3 w-3'} />
                                                Root admin
                                            </Pill>
                                        </span>
                                    )}
                                    {user.roles.map((role) => (
                                        <span
                                            key={role.id}
                                            className={'ml-1 rounded-full px-2 py-0.5 text-2xs font-medium text-snow'}
                                            style={{ backgroundColor: role.color }}
                                        >
                                            {role.name}
                                        </span>
                                    ))}
                                </Cell>
                                <Cell>
                                    {user.name_last}, {user.name_first}
                                </Cell>
                                <Cell>{user.username}</Cell>
                                <Cell>
                                    {user.use_totp ? (
                                        <LockClosedIcon
                                            className={'h-4 w-4 text-green-600'}
                                            title={'Two factor authentication is on'}
                                        />
                                    ) : (
                                        <LockOpenIcon
                                            className={'h-4 w-4 text-red-500'}
                                            title={'Two factor authentication is off'}
                                        />
                                    )}
                                </Cell>
                                <Cell>
                                    <AdminLink
                                        to={`/admin/servers?filter[owner_id]=${user.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {user.servers}
                                    </AdminLink>
                                </Cell>
                                <Cell>{user.subuser_of}</Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
            {data && <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-3'} />}
        </AdminPage>
    );
};
