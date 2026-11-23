import React, { useEffect, useState } from 'react';
import { CreditCardIcon, InformationCircleIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import CopyOnClick from '@/components/elements/CopyOnClick';
import Code from '@/components/elements/Code';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { Payments } from '@/api/admin/boxes';
import { saveSetting, useSetting } from '@/api/admin/settings';

interface Form {
    enabled: boolean;
    currency: string;
    stripeOn: boolean;
    stripeSecret: string;
    stripeHook: string;
    paypalOn: boolean;
    paypalClient: string;
    paypalSecret: string;
    paypalMode: 'live' | 'sandbox';
    paypalHook: string;
}

/** Admin > Settings > Payments: whether the store is open, the currency, and the keys of Stripe and PayPal. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.payments.update');
    const { data, mutate } = useSetting<Payments>('payments');
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<Form | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data && !form) {
            setForm({
                enabled: data.enabled,
                currency: data.currency,
                stripeOn: data.stripe.enabled,
                stripeSecret: '',
                stripeHook: '',
                paypalOn: data.paypal.enabled,
                paypalClient: data.paypal.client_id,
                paypalSecret: '',
                paypalMode: data.paypal.mode,
                paypalHook: data.paypal.webhook_id,
            });
        }
    }, [data]);

    const set = (key: keyof Form) => (value: string | boolean) => form && setForm({ ...form, [key]: value });

    const save = () => {
        if (!form) return;
        clearFlashes('admin');
        setBusy(true);
        // A secret that was not typed is not sent, so it stays as it is.
        saveSetting('payments', {
            enabled: form.enabled,
            currency: form.currency,
            stripe: {
                enabled: form.stripeOn,
                ...(form.stripeSecret ? { secret: form.stripeSecret } : {}),
                ...(form.stripeHook ? { webhook_secret: form.stripeHook } : {}),
            },
            paypal: {
                enabled: form.paypalOn,
                client_id: form.paypalClient,
                ...(form.paypalSecret ? { secret: form.paypalSecret } : {}),
                mode: form.paypalMode,
                webhook_id: form.paypalHook,
            },
        })
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The payment settings were saved.' });
                setForm(null);

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SettingsFrame
            title={'Payments'}
            subtitle={'Sell servers and boxes in the store with Stripe or PayPal. Boxes work without any of this.'}
        >
            {!data || !form ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        <SectionCard icon={<CreditCardIcon className={'h-5 w-5'} />} title={'Store'}>
                            <Stack>
                                <ToggleField
                                    label={'The store is open'}
                                    help={
                                        'Off by default. People see the packages and can pay once a payment service below is set up.'
                                    }
                                    checked={form.enabled}
                                    disabled={!can}
                                    onChange={set('enabled')}
                                />
                                <TextField
                                    id={'currency'}
                                    label={'Currency'}
                                    value={form.currency}
                                    disabled={!can}
                                    maxLength={3}
                                    onChange={(v) => set('currency')(v.toUpperCase())}
                                    help={
                                        'The three letter code, like USD or EUR. Prices of the packages are in it. Change it and fix the prices.'
                                    }
                                />
                            </Stack>
                        </SectionCard>

                        <SectionCard icon={<CreditCardIcon className={'h-5 w-5'} />} title={'Stripe'}>
                            <Stack>
                                <ToggleField
                                    label={'Take payments with Stripe'}
                                    checked={form.stripeOn}
                                    disabled={!can}
                                    onChange={set('stripeOn')}
                                />
                                <Columns>
                                    <TextField
                                        id={'stripe-secret'}
                                        type={'password'}
                                        label={'Secret key'}
                                        value={form.stripeSecret}
                                        disabled={!can}
                                        autoComplete={'off'}
                                        placeholder={data.stripe.secret_set ? 'Set, type to replace' : 'sk_live_...'}
                                        onChange={set('stripeSecret')}
                                    />
                                    <TextField
                                        id={'stripe-hook'}
                                        type={'password'}
                                        label={'Webhook signing secret'}
                                        value={form.stripeHook}
                                        disabled={!can}
                                        autoComplete={'off'}
                                        placeholder={
                                            data.stripe.webhook_secret_set ? 'Set, type to replace' : 'whsec_...'
                                        }
                                        onChange={set('stripeHook')}
                                    />
                                </Columns>
                                <div>
                                    <p className={'mb-1 text-sm text-neutral-200'}>
                                        Webhook address (add it in Stripe under Developers, Webhooks)
                                    </p>
                                    <CopyOnClick text={data.stripe.webhook_url}>
                                        <Code dark>{data.stripe.webhook_url}</Code>
                                    </CopyOnClick>
                                    <p className={'mt-1 text-xs text-neutral-400'}>
                                        Send it these events: checkout.session.completed,
                                        checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
                                        checkout.session.expired and charge.refunded.
                                    </p>
                                </div>
                            </Stack>
                        </SectionCard>

                        <SectionCard icon={<CreditCardIcon className={'h-5 w-5'} />} title={'PayPal'}>
                            <Stack>
                                <ToggleField
                                    label={'Take payments with PayPal'}
                                    checked={form.paypalOn}
                                    disabled={!can}
                                    onChange={set('paypalOn')}
                                />
                                <Columns>
                                    <TextField
                                        id={'pp-client'}
                                        label={'Client ID'}
                                        value={form.paypalClient}
                                        disabled={!can}
                                        onChange={set('paypalClient')}
                                    />
                                    <TextField
                                        id={'pp-secret'}
                                        type={'password'}
                                        label={'Secret'}
                                        value={form.paypalSecret}
                                        disabled={!can}
                                        autoComplete={'off'}
                                        placeholder={data.paypal.secret_set ? 'Set, type to replace' : ''}
                                        onChange={set('paypalSecret')}
                                    />
                                    <SelectField
                                        id={'pp-mode'}
                                        label={'Mode'}
                                        value={form.paypalMode}
                                        disabled={!can}
                                        onChange={set('paypalMode')}
                                        choices={[
                                            { value: 'live', label: 'Live' },
                                            { value: 'sandbox', label: 'Sandbox (testing)' },
                                        ]}
                                    />
                                    <TextField
                                        id={'pp-hook'}
                                        label={'Webhook ID'}
                                        value={form.paypalHook}
                                        disabled={!can}
                                        onChange={set('paypalHook')}
                                        help={'Optional. With it PayPal also tells the panel about refunds.'}
                                    />
                                </Columns>
                                <div>
                                    <p className={'mb-1 text-sm text-neutral-200'}>Webhook address</p>
                                    <CopyOnClick text={data.paypal.webhook_url}>
                                        <Code dark>{data.paypal.webhook_url}</Code>
                                    </CopyOnClick>
                                </div>
                            </Stack>
                        </SectionCard>
                        {can && (
                            <div className={'flex justify-end'}>
                                <Button onClick={save} disabled={busy}>
                                    Save
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className={'space-y-4'}>
                        <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                            <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                                <li>
                                    A payment lasts for the days of the package. People pay again to keep it (renew),
                                    the time is added.
                                </li>
                                <li>
                                    What is not paid for again is suspended, never deleted. Paying or an administrator
                                    brings it back.
                                </li>
                                <li>
                                    The panel asks Stripe or PayPal whether a payment really happened, the address
                                    people come back to is never believed.
                                </li>
                                <li>
                                    Packages are made on the Packages page, boxes for people without a payment on the
                                    Boxes page.
                                </li>
                                <li>
                                    Cards are never typed into the panel: people pay on the page of Stripe or PayPal.
                                </li>
                            </ul>
                        </SectionCard>
                        {!data.stripe.enabled && !data.paypal.enabled && form.enabled && (
                            <Notice tone={'yellow'}>
                                The store is open but no payment service is on, so nothing can be bought.
                            </Notice>
                        )}
                    </div>
                </div>
            )}
        </SettingsFrame>
    );
};
