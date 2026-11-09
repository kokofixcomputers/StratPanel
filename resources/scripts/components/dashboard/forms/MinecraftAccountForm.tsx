import React, { useState } from 'react';
import { Actions, useStoreActions } from 'easy-peasy';
import tw from 'twin.macro';
import { ApplicationStore } from '@/state';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { useFlashKey } from '@/plugins/useFlash';
import { linkMinecraft, MinecraftAccount, unlinkMinecraft, useMinecraftAccount } from '@/api/account/minecraft';

/** The Minecraft account of this person: the code from the disconnect screen of the server links it, and its head becomes the avatar. */
export default ({ onLoaded }: { onLoaded?: (account: MinecraftAccount) => void }) => {
    const { data, mutate } = useMinecraftAccount({ onSuccess: onLoaded });
    const updateUserData = useStoreActions((actions: Actions<ApplicationStore>) => actions.user.updateUserData);
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('account:minecraft');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    if (!data) return <Spinner size={'small'} centered />;

    const apply = (account: MinecraftAccount) => {
        mutate(account, false);
        updateUserData({
            minecraftUuid: account.uuid,
            minecraftUsername: account.username,
            minecraftAvatar: account.avatar,
        });
    };

    const run = (work: Promise<MinecraftAccount>) => {
        clearFlashes();
        setBusy(true);

        return work
            .then((account) => {
                apply(account);
                setCode('');
            })
            .catch((error) => clearAndAddHttpError(error))
            .then(() => setBusy(false));
    };

    if (data.linked) {
        return (
            <div css={tw`flex flex-wrap items-center gap-4`}>
                <img
                    src={data.avatar || ''}
                    alt={''}
                    css={tw`h-14 w-14 rounded-lg border border-neutral-500`}
                    style={{ imageRendering: 'pixelated' }}
                />
                <div css={tw`min-w-0 flex-1`}>
                    <p css={tw`text-xs font-semibold uppercase tracking-wide text-green-600`}>Linked</p>
                    <p css={tw`truncate text-lg font-semibold text-neutral-50`}>{data.username}</p>
                    <p css={tw`text-xs text-neutral-400`}>
                        Its skin is your avatar, and other people can invite you to their servers by this name.
                    </p>
                </div>
                <Button.Danger
                    size={Button.Sizes.Small}
                    variant={Button.Variants.Secondary}
                    disabled={busy}
                    onClick={() => run(unlinkMinecraft())}
                >
                    Unlink
                </Button.Danger>
            </div>
        );
    }

    return (
        <div>
            <ol css={tw`mb-4 list-decimal space-y-1 pl-5 text-sm text-neutral-200`}>
                <li>
                    Join{' '}
                    {data.join ? (
                        <code css={tw`rounded bg-neutral-600 px-1.5 py-0.5 font-mono text-xs`}>{data.join}</code>
                    ) : (
                        'the Minecraft address of this panel'
                    )}{' '}
                    with your Minecraft account (Java Edition, not offline mode).
                </li>
                <li>You are disconnected with a screen that shows a 6 digit code.</li>
                <li>Enter it here within {data.minutes} minutes.</li>
            </ol>
            <form
                css={tw`flex flex-wrap items-center gap-3`}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (code.replace(/\D/g, '').length === 6) run(linkMinecraft(code));
                }}
            >
                <div css={tw`w-44`}>
                    <Input
                        type={'text'}
                        inputMode={'numeric'}
                        autoComplete={'one-time-code'}
                        placeholder={'123 456'}
                        aria-label={'Code from the disconnect screen'}
                        maxLength={7}
                        value={code}
                        css={tw`font-mono tracking-widest text-center`}
                        onChange={(e) => setCode(e.currentTarget.value)}
                    />
                </div>
                <Button type={'submit'} disabled={busy || code.replace(/\D/g, '').length !== 6}>
                    Link account
                </Button>
            </form>
            {!data.enabled && <p css={tw`mt-3 text-xs text-neutral-400`}>An administrator has not turned this on.</p>}
        </div>
    );
};
