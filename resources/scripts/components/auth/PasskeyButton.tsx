import React, { useState } from 'react';
import { KeyIcon } from '@heroicons/react/solid';
import { useStoreState } from 'easy-peasy';
import signInWithPasskey from '@/api/auth/passkey';
import { httpErrorToHuman } from '@/api/http';
import { isPasskeySupported, passkeyErrorMessage } from '@/lib/webauthn';
import useFlash from '@/plugins/useFlash';

/** "Sign in with a passkey", shown only where the panel allows passkeys and the browser has them. */
export default () => {
    const enabled = useStoreState((state) => state.settings.data?.auth?.passkeys ?? false);
    const [busy, setBusy] = useState(false);
    const { clearFlashes, addFlash } = useFlash();

    if (!enabled || !isPasskeySupported()) return null;

    const signIn = () => {
        setBusy(true);
        clearFlashes();

        signInWithPasskey()
            .then((intended) => {
                // @ts-expect-error this is valid
                window.location = intended || '/';
            })
            .catch((error) => {
                setBusy(false);
                addFlash({
                    type: 'error',
                    title: 'Error',
                    // The panel's own answer when it refused, the browser's reason when the dialog was cancelled.
                    message: error?.response ? httpErrorToHuman(error) : passkeyErrorMessage(error),
                });
            });
    };

    return (
        <button
            type={'button'}
            onClick={signIn}
            disabled={busy}
            className={
                'flex w-full items-center justify-center rounded-lg border border-neutral-500 bg-white px-4 py-2.5 text-sm font-medium text-neutral-200 shadow-sm transition-colors duration-150 hover:bg-neutral-600 hover:text-neutral-50 disabled:opacity-50'
            }
        >
            <KeyIcon className={'mr-3 h-5 w-5 flex-shrink-0 text-primary-600'} />
            Sign in with a passkey
        </button>
    );
};
