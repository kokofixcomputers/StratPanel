import * as React from 'react';
import { useStoreState } from 'easy-peasy';
import { useLocation } from 'react-router-dom';
import { CalendarIcon, KeyIcon, MailIcon, ShieldCheckIcon } from '@heroicons/react/solid';
import { format } from 'date-fns';
import { ApplicationStore } from '@/state';
import UpdatePasswordForm from '@/components/dashboard/forms/UpdatePasswordForm';
import UpdateEmailAddressForm from '@/components/dashboard/forms/UpdateEmailAddressForm';
import ConfigureTwoFactorForm from '@/components/dashboard/forms/ConfigureTwoFactorForm';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import MessageBox from '@/components/MessageBox';
import Avatar from '@/components/Avatar';

const Pill = ({ tone, children }: { tone: 'green' | 'grey' | 'blue'; children: React.ReactNode }) => (
    <span
        className={
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ' +
            (tone === 'green'
                ? 'border-green-200 bg-green-50 text-green-700'
                : tone === 'blue'
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-neutral-500 bg-neutral-600 text-neutral-300')
        }
    >
        {children}
    </span>
);

export default () => {
    const { state } = useLocation<undefined | { twoFactorRedirect?: boolean }>();
    const user = useStoreState((s: ApplicationStore) => s.user.data!);

    return (
        <PageContentBlock title={'Account Settings'}>
            <div className={'mt-6'}>
                <PageHeader
                    title={'Account settings'}
                    subtitle={'Manage how you sign in and keep your account secure'}
                />
            </div>

            {state?.twoFactorRedirect && (
                <MessageBox title={'2-Factor Required'} type={'error'}>
                    Your account must have two-factor authentication enabled in order to continue.
                </MessageBox>
            )}

            <div
                className={
                    'mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-neutral-500 bg-white p-5 shadow-md'
                }
            >
                <span className={'h-16 w-16 flex-shrink-0 overflow-hidden rounded-full'}>
                    <Avatar.User size={64} />
                </span>
                <div className={'min-w-0 flex-1'}>
                    <p className={'truncate text-xl font-semibold text-neutral-50'}>{user.username}</p>
                    <p className={'truncate text-sm text-neutral-300'}>{user.email}</p>
                    <div className={'mt-2 flex flex-wrap items-center gap-2'}>
                        {user.rootAdmin && <Pill tone={'blue'}>Administrator</Pill>}
                        <Pill tone={user.useTotp ? 'green' : 'grey'}>
                            {user.useTotp ? 'Two-step on' : 'Two-step off'}
                        </Pill>
                        {user.createdAt && (
                            <span className={'inline-flex items-center text-xs text-neutral-400'}>
                                <CalendarIcon className={'mr-1 h-3.5 w-3.5'} />
                                Member since {format(user.createdAt, 'MMM d, yyyy')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className={'mb-10 grid gap-4 lg:grid-cols-2'}>
                <SectionCard
                    icon={<MailIcon className={'h-5 w-5'} />}
                    title={'Email address'}
                    description={'Used to sign in and to send you password reset links.'}
                    flash={'account:email'}
                >
                    <UpdateEmailAddressForm />
                </SectionCard>
                <SectionCard
                    icon={<KeyIcon className={'h-5 w-5'} />}
                    title={'Password'}
                    description={'Use a long password you do not use anywhere else.'}
                    flash={'account:password'}
                >
                    <UpdatePasswordForm />
                </SectionCard>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<ShieldCheckIcon className={'h-5 w-5'} />}
                    title={'Two-step verification'}
                    description={'Ask for a code from an authenticator app when you sign in.'}
                    badge={
                        <Pill tone={user.useTotp ? 'green' : 'grey'}>{user.useTotp ? 'Enabled' : 'Not enabled'}</Pill>
                    }
                >
                    <ConfigureTwoFactorForm />
                </SectionCard>
            </div>
        </PageContentBlock>
    );
};
