import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/solid';
import PageContentBlock from '@/components/elements/PageContentBlock';
import Spinner from '@/components/elements/Spinner';
import { httpErrorToHuman } from '@/api/http';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';
import { confirmOrder, StoreOrder } from '@/api/store';
import { clearCart } from '@/lib/cart';

/**
 * Where the payment page sends the person back to. The address is not believed: the panel asks the payment service what happened, and
 * makes the box or server when it was paid. A payment that takes a moment to arrive is asked about again.
 */
export default () => {
    const order = new URLSearchParams(useLocation().search).get('order');
    const user = useStoreState((state: ApplicationStore) => state.user.data!.uuid);
    const [result, setResult] = useState<StoreOrder | null>(null);
    const [error, setError] = useState('');
    const [tries, setTries] = useState(0);

    useEffect(() => {
        if (!order) return;
        let stale = false;
        confirmOrder(order)
            .then((next) => {
                if (stale) return;
                setResult(next);
                // What was paid for is not in the cart any more.
                if (next.status === 'paid') clearCart(user);
                if (next.status === 'pending' && tries < 8) setTimeout(() => !stale && setTries((n) => n + 1), 3000);
            })
            .catch((e) => !stale && setError(httpErrorToHuman(e)));

        return () => {
            stale = true;
        };
    }, [order, tries]);

    const done = result?.status === 'paid';

    return (
        <PageContentBlock title={'Payment'}>
            <div
                className={
                    'mx-auto mt-16 max-w-md rounded-xl border border-neutral-500 bg-white p-8 text-center shadow-md'
                }
            >
                {error || !order ? (
                    <>
                        <ExclamationCircleIcon className={'mx-auto h-10 w-10 text-red-500'} />
                        <p className={'mt-3 text-base font-semibold text-neutral-50'}>
                            This payment could not be checked
                        </p>
                        <p className={'mt-1 text-sm text-neutral-300'}>
                            {error || 'There is no order in this address.'}
                        </p>
                    </>
                ) : !result || result.status === 'pending' ? (
                    <>
                        <Spinner size={'large'} centered />
                        <p className={'mt-3 text-base font-semibold text-neutral-50'}>Checking your payment...</p>
                        <p className={'mt-1 text-sm text-neutral-300'}>
                            This takes a moment, you can stay on this page.
                        </p>
                    </>
                ) : done ? (
                    <>
                        <CheckCircleIcon className={'mx-auto h-10 w-10 text-green-500'} />
                        <p className={'mt-3 text-base font-semibold text-neutral-50'}>
                            {result.setting_up ? 'Paid, setting it up' : 'Thank you, it is ready'}
                        </p>
                        {result.problem && (
                            <p className={'mt-1 text-sm text-red-600'}>
                                {result.problem} An administrator has been asked to look at it.
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        <ExclamationCircleIcon className={'mx-auto h-10 w-10 text-red-500'} />
                        <p className={'mt-3 text-base font-semibold text-neutral-50'}>
                            {result.status === 'canceled'
                                ? 'The payment was canceled'
                                : 'The payment did not go through'}
                        </p>
                        <p className={'mt-1 text-sm text-neutral-300'}>
                            Nothing was charged for it, or the payment service will give it back.
                        </p>
                    </>
                )}
                <div className={'mt-6 flex flex-wrap justify-center gap-3 text-sm font-semibold text-primary-600'}>
                    {done &&
                        result?.items.map((item, index) =>
                            item.box ? (
                                <Link key={index} to={`/boxes/${item.box}`}>
                                    Open the box
                                </Link>
                            ) : item.server ? (
                                <Link key={index} to={`/server/${item.server}`}>
                                    Open {item.name}
                                </Link>
                            ) : null
                        )}
                    <Link to={'/store'}>Back to the store</Link>
                </div>
            </div>
        </PageContentBlock>
    );
};
