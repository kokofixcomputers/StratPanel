import React, { useEffect, useState } from 'react';
import { LinkIcon } from '@heroicons/react/solid';
import { format } from 'date-fns';
import { useLocation } from 'react-router-dom';
import tw from 'twin.macro';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import FlashMessageRender from '@/components/FlashMessageRender';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import { ProviderBadge } from '@/components/auth/ProviderButtons';
import { unlinkProvider, useProviders, LinkedProvider } from '@/api/account/providers';
import { useFlashKey } from '@/plugins/useFlash';
import { authErrorMessage, providerUrl, queryParam } from '@/lib/authProviders';

const Row = ({ provider, onUnlink }: { provider: LinkedProvider; onUnlink: (provider: LinkedProvider) => void }) => (
    <GreyRowBox css={tw`bg-neutral-600 flex items-center space-x-4`} $hoverable={false}>
        <ProviderBadge type={provider.type} name={provider.name} />
        <div css={tw`flex-1 min-w-0`}>
            <p css={tw`text-sm font-medium truncate`}>
                {provider.name}
                {!provider.enabled && <span css={tw`ml-2 text-xs text-neutral-400`}>(switched off by an admin)</span>}
            </p>
            {provider.linked ? (
                <p css={tw`text-xs mt-1 text-neutral-300 truncate`}>
                    {provider.account ? `${provider.account} · ` : ''}
                    Linked {provider.linkedAt ? format(provider.linkedAt, 'MMM do, yyyy') : ''}
                    {provider.lastUsedAt ? `, last used ${format(provider.lastUsedAt, 'MMM do, yyyy')}` : ''}
                </p>
            ) : (
                <p css={tw`text-xs mt-1 text-neutral-300`}>Not linked</p>
            )}
        </div>
        {provider.linked ? (
            <Button size={'xsmall'} color={'red'} isSecondary onClick={() => onUnlink(provider)}>
                Unlink
            </Button>
        ) : (
            // A normal page load: the browser goes to the service and comes back here.
            <a
                href={providerUrl(provider.key, true)}
                className={
                    'inline-flex items-center rounded-lg border border-primary-600 bg-primary-600 px-2.5 py-1 text-xs font-medium text-white no-underline transition-colors duration-150 hover:bg-primary-700'
                }
            >
                Link
            </a>
        )}
    </GreyRowBox>
);

/** Account > Providers: the services this account can sign in with. */
export default () => {
    const { clearFlashes, clearAndAddHttpError, addError } = useFlashKey('account');
    const { data, isValidating, error, mutate } = useProviders();
    const { search } = useLocation();
    const [unlinking, setUnlinking] = useState<LinkedProvider | null>(null);

    useEffect(() => {
        clearAndAddHttpError(error);
    }, [error]);

    // Coming back from the service that was just linked, or that refused.
    useEffect(() => {
        const message = authErrorMessage(queryParam(search, 'error'));
        if (message) addError(message);
    }, []);

    const confirmUnlink = () => {
        if (!unlinking) return;
        clearFlashes();

        unlinkProvider(unlinking.key)
            .then(() => mutate())
            .catch((e) => clearAndAddHttpError(e))
            .then(() => setUnlinking(null));
    };

    const linkedNow = queryParam(search, 'linked');

    return (
        <PageContentBlock title={'Providers'}>
            <div css={tw`mt-6`}>
                <PageHeader title={'Providers'} subtitle={'Link other services to sign in with them'} />
            </div>
            <FlashMessageRender byKey={'account'} css={tw`mb-4`} />
            {linkedNow && data?.providers.some((p) => p.key === linkedNow && p.linked) && (
                <p css={tw`mb-4 text-sm text-green-700`}>
                    {data.providers.find((p) => p.key === linkedNow)!.name} is linked to your account.
                </p>
            )}
            <Dialog.Confirm
                open={!!unlinking}
                title={'Unlink ' + (unlinking?.name ?? '')}
                confirm={'Unlink'}
                onConfirmed={confirmUnlink}
                onClose={() => setUnlinking(null)}
            >
                You will no longer be able to sign in with {unlinking?.name}. You can link it again later.
            </Dialog.Confirm>
            <div css={tw`mb-10 max-w-3xl`}>
                <SectionCard
                    icon={<LinkIcon className={'h-5 w-5'} />}
                    title={'Sign in with'}
                    description={
                        'Link a service, then use it on the sign in page instead of your password. Your account is never matched by email address, only by the link you make here.'
                    }
                    className={'overflow-hidden'}
                >
                    <div css={tw`relative`}>
                        <SpinnerOverlay visible={!data && isValidating} />
                        {!data ? (
                            <p css={tw`text-center text-sm`}>Loading...</p>
                        ) : data.providers.length === 0 ? (
                            <p css={tw`text-center text-sm`}>No services have been set up by an admin.</p>
                        ) : (
                            <div css={tw`space-y-2`}>
                                {data.providers.map((provider) => (
                                    <Row key={provider.key} provider={provider} onUnlink={setUnlinking} />
                                ))}
                            </div>
                        )}
                        {data && !data.passwordSet && (
                            <p css={tw`mt-4 text-xs text-neutral-400`}>
                                You signed up with a service and have no password yet. You can set one under Account,
                                and you can not unlink your last way of signing in before that.
                            </p>
                        )}
                    </div>
                </SectionCard>
            </div>
        </PageContentBlock>
    );
};
