import React from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, ShieldCheckIcon, StarIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Spinner from '@/components/elements/Spinner';
import useAdmin from '@/plugins/useAdmin';
import { useRoles } from '@/api/admin/roles';
import { useHistory } from 'react-router-dom';

/** Admin > Roles: the roles, and how many people have each. */
export default () => {
    const { data, error } = useRoles();
    const admin = useAdmin();
    const history = useHistory();

    return (
        <AdminPage title={'Roles'} subtitle={'Sets of permissions that can be given to people.'}>
            <ListHeader
                icon={<ShieldCheckIcon className={'h-6 w-6'} />}
                title={'Role list'}
                count={data ? String(data.roles.length) : undefined}
            >
                {admin.can('roles.create') && (
                    <Link to={'/admin/roles/new'}>
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
                        <p className={'p-6 text-sm text-red-600'}>The roles could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : (
                    <AdminTable heads={['Name', 'Description', 'Permissions', 'People']}>
                        <Row>
                            <Cell>
                                <Pill tone={'yellow'}>
                                    <StarIcon className={'-mt-0.5 mr-1 inline h-3 w-3'} />
                                    Root admin
                                </Pill>
                            </Cell>
                            <Cell className={'text-neutral-400'}>
                                Can do everything and can not be limited. Set on a user&apos;s page.
                            </Cell>
                            <Cell className={'text-neutral-400'}>all</Cell>
                            <Cell>{data.root_admins}</Cell>
                        </Row>
                        {data.roles.map((role) => (
                            <Row key={role.id} onClick={() => history.push(`/admin/roles/view/${role.id}`)}>
                                <Cell>
                                    <span
                                        className={'rounded-full px-2.5 py-0.5 text-xs font-medium text-snow'}
                                        style={{ backgroundColor: role.color }}
                                    >
                                        {role.name}
                                    </span>
                                </Cell>
                                <Cell className={'text-neutral-300'}>{role.description}</Cell>
                                <Cell>
                                    {role.permissions}{' '}
                                    {role.denied > 0 && (
                                        <span title={'Permissions this role denies'}>
                                            <Pill tone={'red'}>{role.denied} denied</Pill>
                                        </span>
                                    )}
                                </Cell>
                                <Cell>{role.users}</Cell>
                            </Row>
                        ))}
                        {data.roles.length === 0 && (
                            <Row>
                                <Cell className={'py-8 text-center text-neutral-400'}>No roles yet.</Cell>
                                <Cell />
                                <Cell />
                                <Cell />
                            </Row>
                        )}
                    </AdminTable>
                )}
            </div>
        </AdminPage>
    );
};
