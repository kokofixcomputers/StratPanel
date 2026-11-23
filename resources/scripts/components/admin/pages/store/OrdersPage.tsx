import React, { useState } from 'react';
import { ReceiptTaxIcon, SearchIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { AdminOrder, fulfillOrder, refundOrder, useOrders } from '@/api/admin/boxes';
import { formatMoney } from '@/lib/store';

const TONE: Record<string, 'green' | 'yellow' | 'red' | 'primary'> = {
    paid: 'green',
    pending: 'yellow',
    canceled: 'primary',
    refunded: 'primary',
    failed: 'red',
};

/** Admin > Orders: what was bought, refunds, and orders that were paid but could not be set up. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, error, mutate } = useOrders(search, page);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [refunding, setRefunding] = useState<AdminOrder | null>(null);
    const [revoke, setRevoke] = useState(false);
    const can = admin.can('orders.update');

    const settle = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');

        return work
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    return (
        <AdminPage title={'Orders'} subtitle={'What people bought in the store.'}>
            <ListHeader
                icon={<ReceiptTaxIcon className={'h-6 w-6'} />}
                title={'Order list'}
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
                        placeholder={'Search orders'}
                        aria-label={'Search orders'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The orders could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.orders.length === 0 ? (
                    <Empty>{search ? 'No order matches that.' : 'Nothing was bought yet.'}</Empty>
                ) : (
                    <AdminTable heads={['When', 'Buyer', 'Package', 'Amount', 'With', 'Status', null]}>
                        {data.orders.map((order) => (
                            <Row key={order.id}>
                                <Cell className={'whitespace-nowrap text-xs text-neutral-300'}>
                                    {order.paid_at
                                        ? new Date(order.paid_at).toLocaleString()
                                        : order.created_at
                                        ? new Date(order.created_at).toLocaleString()
                                        : ''}
                                </Cell>
                                <Cell>
                                    <AdminLink
                                        to={`/admin/users/view/${order.user.id}`}
                                        className={'hover:text-primary-600'}
                                    >
                                        {order.user.username}
                                    </AdminLink>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>
                                    {order.items.length > 1 ? `${order.items.length} items` : order.package}
                                    {order.items.map((item, index) => (
                                        <p key={index} className={'text-xs font-normal text-neutral-300'}>
                                            {item.name}
                                            {item.renewal && ' (renewal)'}
                                            {order.status === 'paid' && !item.done && (
                                                <span className={'ml-1 text-yellow-700'}>not set up</span>
                                            )}
                                        </p>
                                    ))}
                                    {order.error && <p className={'mt-1 text-xs text-red-600'}>{order.error}</p>}
                                </Cell>
                                <Cell>{formatMoney(order.amount, order.currency)}</Cell>
                                <Cell className={'capitalize'}>{order.provider}</Cell>
                                <Cell>
                                    <Pill tone={order.setting_up ? 'yellow' : TONE[order.status]}>
                                        {order.setting_up ? 'Not set up' : order.status}
                                    </Pill>
                                </Cell>
                                <Cell>
                                    <div className={'flex justify-end gap-2'}>
                                        {order.items.map((item, index) =>
                                            item.box_id ? (
                                                <AdminLink key={index} to={`/admin/boxes/view/${item.box_id}`}>
                                                    <Button.Text size={Button.Sizes.Small}>Box</Button.Text>
                                                </AdminLink>
                                            ) : item.server_id ? (
                                                <AdminLink key={index} to={`/admin/servers/view/${item.server_id}`}>
                                                    <Button.Text size={Button.Sizes.Small}>Server</Button.Text>
                                                </AdminLink>
                                            ) : null
                                        )}
                                        {can && order.setting_up && (
                                            <Button
                                                size={Button.Sizes.Small}
                                                onClick={() =>
                                                    settle(
                                                        fulfillOrder(order.id),
                                                        'The order was set up, or the reason is on it.'
                                                    )
                                                }
                                            >
                                                Set up now
                                            </Button>
                                        )}
                                        {can && order.status === 'paid' && (
                                            <Button.Danger
                                                size={Button.Sizes.Small}
                                                variant={Button.Variants.Secondary}
                                                onClick={() => {
                                                    setRevoke(false);
                                                    setRefunding(order);
                                                }}
                                            >
                                                Refund
                                            </Button.Danger>
                                        )}
                                    </div>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
                {data && data.pagination.totalPages > 1 && (
                    <PaginationFooter pagination={data.pagination} onPageSelect={setPage} />
                )}
            </div>

            <Dialog.Confirm
                open={!!refunding}
                title={'Refund this order?'}
                confirm={'Refund'}
                onClose={() => setRefunding(null)}
                onConfirmed={() => {
                    if (!refunding) return;
                    settle(refundOrder(refunding.id, revoke), 'The money was given back.');
                    setRefunding(null);
                }}
            >
                <p className={'text-sm text-neutral-200'}>
                    {refunding &&
                        `${formatMoney(refunding.amount, refunding.currency)} goes back to ${
                            refunding.user.username
                        } through ${refunding.provider}.`}
                </p>
                <label className={'mt-4 flex items-center gap-2 text-sm text-neutral-200'}>
                    <input type={'checkbox'} checked={revoke} onChange={(e) => setRevoke(e.currentTarget.checked)} />
                    Also stop what they bought (the box or server is suspended)
                </label>
            </Dialog.Confirm>
        </AdminPage>
    );
};
