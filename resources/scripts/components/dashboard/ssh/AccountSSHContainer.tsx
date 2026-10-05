import React, { useEffect } from 'react';
import { KeyIcon, PlusCircleIcon } from '@heroicons/react/solid';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import FlashMessageRender from '@/components/FlashMessageRender';
import PageContentBlock from '@/components/elements/PageContentBlock';
import tw from 'twin.macro';
import GreyRowBox from '@/components/elements/GreyRowBox';
import { useSSHKeys } from '@/api/account/ssh-keys';
import { useFlashKey } from '@/plugins/useFlash';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey } from '@fortawesome/free-solid-svg-icons';
import { format } from 'date-fns';
import CreateSSHKeyForm from '@/components/dashboard/ssh/CreateSSHKeyForm';
import DeleteSSHKeyButton from '@/components/dashboard/ssh/DeleteSSHKeyButton';

export default () => {
    const { clearAndAddHttpError } = useFlashKey('account');
    const { data, isValidating, error } = useSSHKeys({
        revalidateOnMount: true,
        revalidateOnFocus: false,
    });

    useEffect(() => {
        clearAndAddHttpError(error);
    }, [error]);

    return (
        <PageContentBlock title={'SSH Keys'}>
            <div css={tw`mt-6`}>
                <PageHeader
                    title={'SSH keys'}
                    subtitle={'Public keys for signing in to the SFTP server without a password'}
                />
            </div>
            <FlashMessageRender byKey={'account'} css={tw`mb-4`} />
            <div css={tw`grid gap-4 xl:grid-cols-2 mb-10`}>
                <SectionCard
                    icon={<PlusCircleIcon className={'h-5 w-5'} />}
                    title={'Add SSH key'}
                    description={'Paste the public key, it starts with ssh-ed25519 or ssh-rsa.'}
                >
                    <CreateSSHKeyForm />
                </SectionCard>
                <SectionCard
                    icon={<KeyIcon className={'h-5 w-5'} />}
                    title={'Your SSH keys'}
                    description={`${data?.length ?? 0} ${data?.length === 1 ? 'key' : 'keys'}`}
                    className={'overflow-hidden'}
                >
                    <div css={tw`relative`}>
                        <SpinnerOverlay visible={!data && isValidating} />
                        {!data || !data.length ? (
                            <p css={tw`text-center text-sm`}>
                                {!data ? 'Loading...' : 'No SSH Keys exist for this account.'}
                            </p>
                        ) : (
                            data.map((key, index) => (
                                <GreyRowBox
                                    key={key.fingerprint}
                                    css={[tw`bg-neutral-600 flex space-x-4 items-center`, index > 0 && tw`mt-2`]}
                                >
                                    <FontAwesomeIcon icon={faKey} css={tw`text-neutral-300`} />
                                    <div css={tw`flex-1`}>
                                        <p css={tw`text-sm break-words font-medium`}>{key.name}</p>
                                        <p css={tw`text-xs mt-1 font-mono truncate`}>SHA256:{key.fingerprint}</p>
                                        <p css={tw`text-xs mt-1 text-neutral-300 uppercase`}>
                                            Added on:&nbsp;
                                            {format(key.createdAt, 'MMM do, yyyy HH:mm')}
                                        </p>
                                    </div>
                                    <DeleteSSHKeyButton name={key.name} fingerprint={key.fingerprint} />
                                </GreyRowBox>
                            ))
                        )}
                    </div>
                </SectionCard>
            </div>
        </PageContentBlock>
    );
};
