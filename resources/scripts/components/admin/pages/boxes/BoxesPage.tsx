import React, { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { CubeIcon, PlusIcon, SearchIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Meter, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useAdmin from '@/plugins/useAdmin';
import { useAdminBoxes } from '@/api/admin/boxes';
import { percentOf, shareText } from '@/lib/store';

const STATE: Record<string, [string, 'green' | 'yellow' | 'red']> = {
    active: ['Active', 'green'],
    suspended: ['Suspended', 'yellow'],
    expired: ['Expired', 'red'],
};

const level = (percent: number) => (percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'ok');

/** Admin > Boxes: every box with its owner and how full it is. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const ownerId = new URLSearchParams(useLocation().search).get('owner_id');
    const { data, error } = useAdminBoxes(search, ownerId, page);
    const admin = useAdmin();
    const history = useHistory();

    return (
        <AdminPage
            title={'Boxes'}
            subtitle={'Resources that people make their own servers in. A box does not need the store.'}
        >
            <ListHeader
                icon={<CubeIcon className={'h-6 w-6'} />}
                title={ownerId ? 'Boxes of one person' : 'Box list'}
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
                        placeholder={'Search boxes'}
                        aria-label={'Search boxes'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                {ownerId && (
                    <AdminLink to={'/admin/boxes'}>
                        <Button.Text>Show all boxes</Button.Text>
                    </AdminLink>
                )}
                {admin.can('boxes.create') && (
                    <Button onClick={() => history.push('/admin/boxes/new')}>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The boxes could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.boxes.length === 0 ? (
                    <Empty>{search ? 'No box matches that.' : 'There are no boxes yet.'}</Empty>
                ) : (
                    <AdminTable heads={['Box name', 'Owner', 'Servers', 'Memory', 'Disk', 'Source', 'Status', null]}>
                        {data.boxes.map((box) => (
                            <Row key={box.id} onClick={() => history.push(`/admin/boxes/view/${box.admin_id}`)}>
                                <Cell className={'font-medium text-neutral-50'}>{box.name}</Cell>
                                <Cell>{box.owner?.username}</Cell>
                                <Cell>{box.servers}</Cell>
                                <Cell className={'min-w-[9rem]'}>
                                    <p className={'mb-1 text-xs text-neutral-300'}>
                                        {shareText('memory', box.used.memory)} of{' '}
                                        {shareText('memory', box.limits.memory)}
                                    </p>
                                    <Meter
                                        percent={percentOf(box.used.memory, box.limits.memory)}
                                        level={level(percentOf(box.used.memory, box.limits.memory))}
                                    />
                                </Cell>
                                <Cell className={'min-w-[9rem]'}>
                                    <p className={'mb-1 text-xs text-neutral-300'}>
                                        {shareText('disk', box.used.disk)} of {shareText('disk', box.limits.disk)}
                                    </p>
                                    <Meter
                                        percent={percentOf(box.used.disk, box.limits.disk)}
                                        level={level(percentOf(box.used.disk, box.limits.disk))}
                                    />
                                </Cell>
                                <Cell>{box.source === 'order' ? 'Bought' : 'Given'}</Cell>
                                <Cell>
                                    <Pill tone={STATE[box.status][1]}>{STATE[box.status][0]}</Pill>
                                </Cell>
                                <Cell className={'text-right'}>
                                    <span className={'text-xs font-semibold text-primary-600'}>Manage</span>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
                {data && data.pagination.totalPages > 1 && (
                    <PaginationFooter pagination={data.pagination} onPageSelect={setPage} />
                )}
            </div>
        </AdminPage>
    );
};
