import React from 'react';
import { useHistory } from 'react-router-dom';
import { PlusIcon, ShoppingBagIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Spinner from '@/components/elements/Spinner';
import useAdmin from '@/plugins/useAdmin';
import { usePackages } from '@/api/admin/boxes';
import { formatMoney, periodLabel, shareText } from '@/lib/store';

/** Admin > Packages: what the store sells. */
export default () => {
    const { data, error } = usePackages();
    const admin = useAdmin();
    const history = useHistory();
    const currency = data?.currency || 'USD';

    return (
        <AdminPage
            title={'Packages'}
            subtitle={
                'What the store sells: servers that are made when they are bought, and boxes people make servers in.'
            }
        >
            <ListHeader
                icon={<ShoppingBagIcon className={'h-6 w-6'} />}
                title={'Package list'}
                count={data ? String(data.packages.length) : undefined}
            >
                {admin.can('packages.create') && (
                    <Button onClick={() => history.push('/admin/packages/new')}>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The packages could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.packages.length === 0 ? (
                    <Empty>There are no packages yet. The store shows nothing until there is one.</Empty>
                ) : (
                    <AdminTable
                        heads={['Package name', 'Type', 'Price', 'Memory', 'Disk', 'CPU', 'Sold', 'For sale', null]}
                    >
                        {data.packages.map((pkg) => (
                            <Row key={pkg.id} onClick={() => history.push(`/admin/packages/view/${pkg.id}`)}>
                                <Cell className={'font-medium text-neutral-50'}>{pkg.name}</Cell>
                                <Cell>{pkg.kind === 'box' ? 'Box' : 'Server'}</Cell>
                                <Cell>
                                    {formatMoney(pkg.price, currency)}
                                    <span className={'text-xs text-neutral-400'}>
                                        {' '}
                                        / {periodLabel(pkg.period_days)}
                                    </span>
                                </Cell>
                                <Cell>{shareText('memory', pkg.memory)}</Cell>
                                <Cell>{shareText('disk', pkg.disk)}</Cell>
                                <Cell>{pkg.cpu}%</Cell>
                                <Cell>{pkg.sold}</Cell>
                                <Cell>
                                    <Pill tone={pkg.active ? 'green' : 'yellow'}>{pkg.active ? 'Yes' : 'Hidden'}</Pill>
                                </Cell>
                                <Cell className={'text-right'}>
                                    <span className={'text-xs font-semibold text-primary-600'}>Manage</span>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
        </AdminPage>
    );
};
