import React, { useEffect, useState } from 'react';
import { KeyIcon, PlusCircleIcon } from '@heroicons/react/solid';
import { format } from 'date-fns';
import tw from 'twin.macro';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import FlashMessageRender from '@/components/FlashMessageRender';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Button from '@/components/elements/Button';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { Dialog } from '@/components/elements/dialog';
import { addPasskey, Passkey, removePasskey, usePasskeys } from '@/api/account/passkeys';
import { useFlashKey } from '@/plugins/useFlash';
import { isPasskeySupported, passkeyErrorMessage } from '@/lib/webauthn';

/** Account > Passkeys: signing in with a fingerprint, a face, a PIN or a security key. */
export default () => {
    const { clearFlashes, clearAndAddHttpError, addError } = useFlashKey('account');
    const { data, isValidating, error, mutate } = usePasskeys();
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [removing, setRemoving] = useState<Passkey | null>(null);
    const supported = isPasskeySupported();

    useEffect(() => {
        clearAndAddHttpError(error);
    }, [error]);

    const add = () => {
        clearFlashes();
        setBusy(true);

        addPasskey(name.trim() || 'Passkey')
            .then(() => {
                setName('');

                return mutate();
            })
            .catch((e) => {
                // The panel's own answer when it refused, the browser's reason when the dialog was cancelled.
                if (e?.response) clearAndAddHttpError(e);
                else addError(passkeyErrorMessage(e));
            })
            .then(() => setBusy(false));
    };

    const remove = () => {
        if (!removing) return;
        clearFlashes();

        removePasskey(removing.id)
            .then(() => mutate())
            .catch((e) => clearAndAddHttpError(e))
            .then(() => setRemoving(null));
    };

    return (
        <PageContentBlock title={'Passkeys'}>
            <div css={tw`mt-6`}>
                <PageHeader
                    title={'Passkeys'}
                    subtitle={'Sign in with a fingerprint, face, PIN or security key instead of a password'}
                />
            </div>
            <FlashMessageRender byKey={'account'} css={tw`mb-4`} />
            <Dialog.Confirm
                open={!!removing}
                title={'Remove passkey'}
                confirm={'Remove'}
                onConfirmed={remove}
                onClose={() => setRemoving(null)}
            >
                You will no longer be able to sign in with {removing?.name}. Remove it from your device or password
                manager as well, if you want it gone there too.
            </Dialog.Confirm>
            <div css={tw`grid gap-4 xl:grid-cols-2 mb-10`}>
                <SectionCard
                    icon={<PlusCircleIcon className={'h-5 w-5'} />}
                    title={'Add a passkey'}
                    description={'Your device asks you to confirm it is you. Nothing secret is sent to the panel.'}
                >
                    {data && !data.enabled ? (
                        <p css={tw`text-sm text-neutral-300`}>An admin has turned passkeys off.</p>
                    ) : !supported ? (
                        <p css={tw`text-sm text-neutral-300`}>
                            This browser can not make passkeys here. They need a recent browser and an https address.
                        </p>
                    ) : (
                        <>
                            <Label htmlFor={'passkey-name'}>Name</Label>
                            <Input
                                id={'passkey-name'}
                                type={'text'}
                                value={name}
                                maxLength={100}
                                placeholder={'My laptop'}
                                onChange={(e) => setName(e.currentTarget.value)}
                                disabled={busy}
                            />
                            <p className={'input-help'}>So you can tell your passkeys apart.</p>
                            <div css={tw`mt-6 text-right`}>
                                <Button onClick={add} isLoading={busy} disabled={busy}>
                                    Add passkey
                                </Button>
                            </div>
                        </>
                    )}
                </SectionCard>
                <SectionCard
                    icon={<KeyIcon className={'h-5 w-5'} />}
                    title={'Your passkeys'}
                    description={`${data?.passkeys.length ?? 0} ${
                        data?.passkeys.length === 1 ? 'passkey' : 'passkeys'
                    }`}
                    className={'overflow-hidden'}
                >
                    <div css={tw`relative`}>
                        <SpinnerOverlay visible={!data && isValidating} />
                        {!data || !data.passkeys.length ? (
                            <p css={tw`text-center text-sm`}>{!data ? 'Loading...' : 'You have no passkeys.'}</p>
                        ) : (
                            data.passkeys.map((key, index) => (
                                <GreyRowBox
                                    key={key.id}
                                    css={[tw`bg-neutral-600 flex space-x-4 items-center`, index > 0 && tw`mt-2`]}
                                    $hoverable={false}
                                >
                                    <KeyIcon className={'h-5 w-5 flex-shrink-0 text-neutral-300'} />
                                    <div css={tw`flex-1 min-w-0`}>
                                        <p css={tw`text-sm font-medium truncate`}>{key.name}</p>
                                        <p css={tw`text-xs mt-1 text-neutral-300`}>
                                            Added {format(key.createdAt, 'MMM do, yyyy')}
                                            {key.lastUsedAt
                                                ? `, last used ${format(key.lastUsedAt, 'MMM do, yyyy HH:mm')}`
                                                : ', never used'}
                                        </p>
                                    </div>
                                    <Button size={'xsmall'} color={'red'} isSecondary onClick={() => setRemoving(key)}>
                                        Remove
                                    </Button>
                                </GreyRowBox>
                            ))
                        )}
                    </div>
                </SectionCard>
            </div>
        </PageContentBlock>
    );
};
