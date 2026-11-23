import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreState } from 'easy-peasy';
import { CubeIcon, MinusIcon, PlusIcon, ServerIcon, ShoppingCartIcon, TrashIcon } from '@heroicons/react/solid';
import { ApplicationStore } from '@/state';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { checkout, useStore } from '@/api/store';
import { cartCount, MAX_IN_CART, MAX_PER_PACKAGE, setQuantity, useCart } from '@/lib/cart';
import { formatMoney, periodLabel, SHARE_KEYS, shareText } from '@/lib/store';

/** The cart: what the person put in it, what it costs, and paying for all of it at once. */
export default () => {
    const user = useStoreState((state: ApplicationStore) => state.user.data!.uuid);
    const lines = useCart(user);
    const { data: store, error } = useStore();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [provider, setProvider] = useState('');
    const [paying, setPaying] = useState(false);

    // What is in the cart and still for sale, with its price now; the rest is shown as gone so it can be taken out.
    const rows = lines.map((line) => ({ line, pkg: store?.packages.find((p) => p.id === line.package) || null }));
    const buyable = rows.filter((r) => r.pkg);
    const total = buyable.reduce((sum, r) => sum + r.pkg!.price * r.line.quantity, 0);
    const chosen = provider || store?.providers[0]?.id || '';
    const count = cartCount(lines);

    const pay = () => {
        clearFlashes('store');
        setPaying(true);
        checkout(
            buyable.map((r) => ({ package: r.line.package, quantity: r.line.quantity })),
            chosen
        )
            .then((url) => {
                window.location.href = url;
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'store', error: e });
                setPaying(false);
            });
    };

    return (
        <PageContentBlock title={'Cart'}>
            <div className={'mt-6'}>
                <PageHeader title={'Cart'} subtitle={'Check what you are buying, then pay for all of it at once'} />
            </div>
            <FlashMessageRender byKey={'store'} className={'mb-4'} />

            {!store ? (
                error ? (
                    <p className={'text-sm text-red-600'}>The store could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : lines.length === 0 ? (
                <EmptyState>
                    Your cart is empty.{' '}
                    <Link to={'/store'} className={'font-semibold text-primary-600 hover:underline'}>
                        Look in the store
                    </Link>
                </EmptyState>
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-2 lg:col-span-2'}>
                        {rows.map(({ line, pkg }) => (
                            <div
                                key={line.package}
                                className={
                                    'flex flex-wrap items-center gap-4 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-sm'
                                }
                            >
                                <span
                                    className={
                                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                                    }
                                >
                                    {pkg?.kind === 'server' ? (
                                        <ServerIcon className={'h-5 w-5'} />
                                    ) : (
                                        <CubeIcon className={'h-5 w-5'} />
                                    )}
                                </span>
                                <div className={'min-w-[10rem] flex-1'}>
                                    {pkg ? (
                                        <>
                                            <p className={'text-sm font-semibold text-neutral-50'}>{pkg.name}</p>
                                            <p className={'text-xs text-neutral-400'}>
                                                {pkg.kind === 'box' ? 'Box' : 'Server'} ·{' '}
                                                {SHARE_KEYS.slice(0, 3)
                                                    .map((key) => shareText(key, pkg[key]))
                                                    .join(' · ')}{' '}
                                                · {formatMoney(pkg.price, store.currency)} /{' '}
                                                {periodLabel(pkg.period_days)}
                                            </p>
                                        </>
                                    ) : (
                                        <p className={'text-sm text-red-600'}>
                                            This is not for sale any more, take it out of the cart.
                                        </p>
                                    )}
                                </div>
                                <div className={'flex items-center gap-1'}>
                                    <button
                                        type={'button'}
                                        aria-label={'One less'}
                                        onClick={() => setQuantity(user, line.package, line.quantity - 1)}
                                        className={
                                            'rounded-lg border border-neutral-500 p-1.5 text-neutral-300 hover:bg-neutral-600'
                                        }
                                    >
                                        <MinusIcon className={'h-4 w-4'} />
                                    </button>
                                    <span
                                        className={'w-8 text-center text-sm font-semibold text-neutral-50'}
                                        aria-label={'Quantity'}
                                    >
                                        {line.quantity}
                                    </span>
                                    <button
                                        type={'button'}
                                        aria-label={'One more'}
                                        disabled={line.quantity >= MAX_PER_PACKAGE || count >= MAX_IN_CART}
                                        onClick={() => setQuantity(user, line.package, line.quantity + 1)}
                                        className={
                                            'rounded-lg border border-neutral-500 p-1.5 text-neutral-300 hover:bg-neutral-600 disabled:opacity-40'
                                        }
                                    >
                                        <PlusIcon className={'h-4 w-4'} />
                                    </button>
                                </div>
                                <span className={'w-24 text-right text-sm font-semibold text-neutral-50'}>
                                    {pkg ? formatMoney(pkg.price * line.quantity, store.currency) : '-'}
                                </span>
                                <button
                                    type={'button'}
                                    aria-label={`Take ${pkg?.name || 'it'} out of the cart`}
                                    onClick={() => setQuantity(user, line.package, 0)}
                                    className={'rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600'}
                                >
                                    <TrashIcon className={'h-4 w-4'} />
                                </button>
                            </div>
                        ))}
                        <Link
                            to={'/store'}
                            className={'inline-block pt-2 text-sm font-semibold text-primary-600 hover:underline'}
                        >
                            Keep looking
                        </Link>
                    </div>

                    <div className={'h-fit rounded-xl border border-neutral-500 bg-white p-5 shadow-md'}>
                        <h2 className={'mb-3 flex items-center gap-2 text-base font-semibold text-neutral-50'}>
                            <ShoppingCartIcon className={'h-5 w-5 text-primary-600'} />
                            Order
                        </h2>
                        <dl className={'space-y-1 text-sm'}>
                            <div className={'flex justify-between'}>
                                <dt className={'text-neutral-300'}>
                                    {buyable.reduce((n, r) => n + r.line.quantity, 0)}{' '}
                                    {buyable.reduce((n, r) => n + r.line.quantity, 0) === 1 ? 'item' : 'items'}
                                </dt>
                                <dd className={'text-neutral-100'}>{formatMoney(total, store.currency)}</dd>
                            </div>
                            <div
                                className={
                                    'flex justify-between border-t border-neutral-500 pt-2 text-base font-semibold'
                                }
                            >
                                <dt className={'text-neutral-50'}>Total</dt>
                                <dd className={'text-neutral-50'}>{formatMoney(total, store.currency)}</dd>
                            </div>
                        </dl>
                        <p className={'mt-1 text-xs text-neutral-400'}>
                            The final price is worked out again when you pay.
                        </p>

                        {store.open && store.providers.length > 0 ? (
                            <>
                                <fieldset className={'mt-4 space-y-2'}>
                                    <legend
                                        className={'mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400'}
                                    >
                                        Pay with
                                    </legend>
                                    {store.providers.map((p) => (
                                        <label
                                            key={p.id}
                                            className={
                                                'flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-500 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-600'
                                            }
                                        >
                                            <input
                                                type={'radio'}
                                                name={'provider'}
                                                checked={chosen === p.id}
                                                onChange={() => setProvider(p.id)}
                                            />
                                            {p.name}
                                        </label>
                                    ))}
                                </fieldset>
                                <Button
                                    className={'mt-4 w-full'}
                                    disabled={paying || buyable.length === 0 || buyable.length !== rows.length}
                                    onClick={pay}
                                >
                                    {paying
                                        ? 'Going to the payment page...'
                                        : `Pay ${formatMoney(total, store.currency)}`}
                                </Button>
                                {buyable.length !== rows.length && (
                                    <p className={'mt-2 text-xs text-red-600'}>
                                        Take out what is not for sale any more to pay.
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className={'mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                                The store is closed, nothing can be paid for now.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </PageContentBlock>
    );
};
