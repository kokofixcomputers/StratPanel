import React, { useEffect, useState } from 'react';
import { KeyIcon, PlusCircleIcon } from '@heroicons/react/solid';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import CreateApiKeyForm from '@/components/dashboard/forms/CreateApiKeyForm';
import getApiKeys, { ApiKey } from '@/api/account/getApiKeys';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import deleteApiKey from '@/api/account/deleteApiKey';
import FlashMessageRender from '@/components/FlashMessageRender';
import { format } from 'date-fns';
import PageContentBlock from '@/components/elements/PageContentBlock';
import tw from 'twin.macro';
import GreyRowBox from '@/components/elements/GreyRowBox';
import { Dialog } from '@/components/elements/dialog';
import { useFlashKey } from '@/plugins/useFlash';
import Code from '@/components/elements/Code';

export default () => {
    const [deleteIdentifier, setDeleteIdentifier] = useState('');
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const { clearAndAddHttpError } = useFlashKey('account');

    useEffect(() => {
        getApiKeys()
            .then((keys) => setKeys(keys))
            .then(() => setLoading(false))
            .catch((error) => clearAndAddHttpError(error));
    }, []);

    const doDeletion = (identifier: string) => {
        setLoading(true);

        clearAndAddHttpError();
        deleteApiKey(identifier)
            .then(() => setKeys((s) => [...(s || []).filter((key) => key.identifier !== identifier)]))
            .catch((error) => clearAndAddHttpError(error))
            .then(() => {
                setLoading(false);
                setDeleteIdentifier('');
            });
    };

    return (
        <PageContentBlock title={'Account API'}>
            <div css={tw`mt-6`}>
                <PageHeader title={'API credentials'} subtitle={'Keys that let other tools act on your account'} />
            </div>
            <FlashMessageRender byKey={'account'} css={tw`mb-4`} />
            <div css={tw`grid gap-4 xl:grid-cols-2 mb-10`}>
                <SectionCard
                    icon={<PlusCircleIcon className={'h-5 w-5'} />}
                    title={'Create API key'}
                    description={'Give the key a name so you remember what it is for.'}
                >
                    <CreateApiKeyForm onKeyCreated={(key) => setKeys((s) => [...s!, key])} />
                </SectionCard>
                <SectionCard
                    icon={<KeyIcon className={'h-5 w-5'} />}
                    title={'Your API keys'}
                    description={`${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`}
                    className={'overflow-hidden'}
                >
                    <div css={tw`relative`}>
                        <SpinnerOverlay visible={loading} />
                        <Dialog.Confirm
                            title={'Delete API Key'}
                            confirm={'Delete Key'}
                            open={!!deleteIdentifier}
                            onClose={() => setDeleteIdentifier('')}
                            onConfirmed={() => doDeletion(deleteIdentifier)}
                        >
                            All requests using the <Code>{deleteIdentifier}</Code> key will be invalidated.
                        </Dialog.Confirm>
                        {keys.length === 0 ? (
                            <p css={tw`text-center text-sm`}>
                                {loading ? 'Loading...' : 'No API keys exist for this account.'}
                            </p>
                        ) : (
                            keys.map((key, index) => (
                                <GreyRowBox
                                    key={key.identifier}
                                    css={[tw`bg-neutral-600 flex items-center`, index > 0 && tw`mt-2`]}
                                >
                                    <FontAwesomeIcon icon={faKey} css={tw`text-neutral-300`} />
                                    <div css={tw`ml-4 flex-1 overflow-hidden`}>
                                        <p css={tw`text-sm break-words`}>{key.description}</p>
                                        <p css={tw`text-2xs text-neutral-300 uppercase`}>
                                            Last used:&nbsp;
                                            {key.lastUsedAt ? format(key.lastUsedAt, 'MMM do, yyyy HH:mm') : 'Never'}
                                        </p>
                                    </div>
                                    <p css={tw`text-sm ml-4 hidden md:block`}>
                                        <code css={tw`font-mono py-1 px-2 bg-neutral-600 rounded`}>
                                            {key.identifier}
                                        </code>
                                    </p>
                                    <button
                                        css={tw`ml-4 p-2 text-sm`}
                                        onClick={() => setDeleteIdentifier(key.identifier)}
                                    >
                                        <FontAwesomeIcon
                                            icon={faTrashAlt}
                                            css={tw`text-neutral-400 hover:text-red-400 transition-colors duration-150`}
                                        />
                                    </button>
                                </GreyRowBox>
                            ))
                        )}
                    </div>
                </SectionCard>
            </div>
        </PageContentBlock>
    );
};
