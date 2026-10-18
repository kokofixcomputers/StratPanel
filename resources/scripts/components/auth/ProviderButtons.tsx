import React from 'react';
import { useStoreState } from 'easy-peasy';
import { providerUrl } from '@/lib/authProviders';
import { PROVIDER_ICONS } from '@/components/auth/providerIcons';

/** The mark of the service, or a round badge with its first letter for any other service. */
export const ProviderBadge = ({ type, name }: { type: string; name: string }) => {
    const Icon = PROVIDER_ICONS[type];

    return Icon ? (
        <Icon className={'mr-3 h-5 w-5 flex-shrink-0'} />
    ) : (
        <span
            className={
                'mr-3 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-snow'
            }
            aria-hidden
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
};

/** "Continue with ..." for every service an admin set up. With `signup` only the ones that let new people make an account. */
export default ({ signup = false }: { signup?: boolean }) => {
    const providers = useStoreState((state) => state.settings.data?.auth?.providers ?? []);
    const list = signup ? providers.filter((provider) => provider.signup) : providers;

    if (list.length === 0) return null;

    return (
        <div className={'space-y-2'}>
            {list.map((provider) => (
                <a
                    key={provider.key}
                    href={providerUrl(provider.key)}
                    className={
                        'flex w-full items-center justify-center rounded-lg border border-neutral-500 bg-white px-4 py-2.5 text-sm font-medium text-neutral-200 no-underline shadow-sm transition-colors duration-150 hover:bg-neutral-600 hover:text-neutral-50'
                    }
                >
                    <ProviderBadge type={provider.type} name={provider.name} />
                    Continue with {provider.name}
                </a>
            ))}
        </div>
    );
};
