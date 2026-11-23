import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CubeIcon, ServerIcon } from '@heroicons/react/solid';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { checkout, StorePackage, useOrders, useStore } from '@/api/store';
import { formatMoney, periodLabel, SHARE_KEYS, SHARE_LABELS, shareText } from '@/lib/store';

const STATUS: Record<string, string> = {
    paid: 'border-green-200 bg-green-50 text-green-700',
    pending: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    refunded: 'border-neutral-500 bg-neutral-600 text-neutral-300',
    canceled: 'border-neutral-500 bg-neutral-600 text-neutral-300',
    failed: 'border-red-200 bg-red-50 text-red-700',
};

/** The store: boxes and servers for sale, and what the person bought. */
export default () => {
    const { data: store, error } = useStore();
    const { data: orders } = useOrders();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const canceled = new URLSearchParams(useLocation().search).get('canceled');
    const [paying, setPaying] = useState<string | null>(null);

    const buy = (pkg: StorePackage, provider: string) => {
        clearFlashes('store');
        setPaying(pkg.id + provider);
        checkout(pkg.id, provider)
            .then((url) => {
                window.location.href = url;
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'store', error: e });
                setPaying(null);
            });
    };

    return (
        <PageContentBlock title={'Store'}>
            <div className={'mt-6'}>
                <PageHeader title={'Store'} subtitle={'Servers and boxes of resources to run your own servers in'} />
            </div>
            <FlashMessageRender byKey={'store'} className={'mb-4'} />
            {canceled && (
                <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800'}>
                    The payment was canceled, nothing was charged.
                </p>
            )}

            {!store ? (
                error ? (
                    <p className={'text-sm text-red-600'}>The store could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : !store.open ? (
                <EmptyState>The store is closed.</EmptyState>
            ) : store.packages.length === 0 ? (
                <EmptyState>Nothing is for sale yet.</EmptyState>
            ) : (
                <div className={'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                    {store.packages.map((pkg) => (
                        <div
                            key={pkg.id}
                            className={'flex flex-col rounded-xl border border-neutral-500 bg-white p-5 shadow-md'}
                        >
                            <div className={'mb-3 flex items-center gap-3'}>
                                <span
                                    className={
                                        'flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                                    }
                                >
                                    {pkg.kind === 'box' ? (
                                        <CubeIcon className={'h-5 w-5'} />
                                    ) : (
                                        <ServerIcon className={'h-5 w-5'} />
                                    )}
                                </span>
                                <div className={'min-w-0'}>
                                    <p className={'truncate text-base font-semibold text-neutral-50'}>{pkg.name}</p>
                                    <p className={'text-xs uppercase tracking-wide text-neutral-400'}>
                                        {pkg.kind === 'box' ? 'Box · make your own servers' : 'A server, ready to use'}
                                    </p>
                                </div>
                            </div>
                            <p className={'text-2xl font-bold text-neutral-50'}>
                                {formatMoney(pkg.price, store.currency)}
                                <span className={'ml-1 text-sm font-normal text-neutral-400'}>
                                    {pkg.period_days ? `/ ${periodLabel(pkg.period_days)}` : 'once'}
                                </span>
                            </p>
                            {pkg.description && <p className={'mt-2 text-sm text-neutral-300'}>{pkg.description}</p>}
                            <ul className={'my-4 flex-1 space-y-1 text-sm text-neutral-200'}>
                                {SHARE_KEYS.map((key) => (
                                    <li key={key} className={'flex justify-between'}>
                                        <span className={'text-neutral-400'}>{SHARE_LABELS[key]}</span>
                                        <span className={'font-medium'}>{shareText(key, pkg[key])}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className={'flex flex-wrap gap-2'}>
                                {store.providers.map((provider) => (
                                    <Button
                                        key={provider.id}
                                        disabled={paying !== null}
                                        onClick={() => buy(pkg, provider.id)}
                                    >
                                        {paying === pkg.id + provider.id
                                            ? 'Going to the payment page...'
                                            : store.providers.length > 1
                                            ? provider.name
                                            : 'Buy'}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {orders && orders.length > 0 && (
                <>
                    <h2 className={'mb-3 mt-8 text-lg font-semibold text-neutral-50'}>Your orders</h2>
                    <div className={'space-y-2'}>
                        {orders.map((order) => (
                            <div
                                key={order.id}
                                className={
                                    'flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-sm'
                                }
                            >
                                <div className={'min-w-[10rem] flex-1'}>
                                    <p className={'text-sm font-medium text-neutral-50'}>
                                        {order.package}
                                        {order.renewal && (
                                            <span className={'ml-2 text-xs text-neutral-400'}>renewal</span>
                                        )}
                                    </p>
                                    <p className={'text-xs text-neutral-400'}>
                                        {order.created_at ? new Date(order.created_at).toLocaleString() : ''} ·{' '}
                                        {order.provider}
                                    </p>
                                    {order.problem && <p className={'mt-1 text-xs text-red-600'}>{order.problem}</p>}
                                </div>
                                <span className={'text-sm font-semibold text-neutral-100'}>
                                    {formatMoney(order.amount, order.currency)}
                                </span>
                                <span
                                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                                        STATUS[order.status]
                                    }`}
                                >
                                    {order.setting_up ? 'Setting up' : order.status}
                                </span>
                                {order.box && (
                                    <Link
                                        to={`/boxes/${order.box}`}
                                        className={'text-xs font-semibold text-primary-600 hover:underline'}
                                    >
                                        Open box
                                    </Link>
                                )}
                                {order.server && (
                                    <Link
                                        to={`/server/${order.server}`}
                                        className={'text-xs font-semibold text-primary-600 hover:underline'}
                                    >
                                        Open server
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </PageContentBlock>
    );
};
