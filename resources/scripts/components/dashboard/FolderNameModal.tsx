import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import Modal from '@/components/elements/Modal';
import Input from '@/components/elements/Input';
import Button from '@/components/elements/Button';
import { httpErrorToHuman } from '@/api/http';

/** Asks for the name of a folder, to make one or to rename one. */
export default ({
    visible,
    title,
    initial,
    action,
    onSubmit,
    onDismissed,
}: {
    visible: boolean;
    title: string;
    initial: string;
    action: string;
    onSubmit: (name: string) => Promise<unknown>;
    onDismissed: () => void;
}) => {
    const [name, setName] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            setName(initial);
            setError(null);
        }
    }, [visible, initial]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        setError(null);

        onSubmit(trimmed)
            .then(onDismissed)
            .catch((err) => setError(httpErrorToHuman(err)))
            .then(() => setBusy(false));
    };

    return (
        <Modal visible={visible} onDismissed={onDismissed} showSpinnerOverlay={busy}>
            <form onSubmit={submit}>
                <h2 css={tw`text-xl font-semibold text-neutral-50 mb-4`}>{title}</h2>
                <Input
                    autoFocus
                    value={name}
                    maxLength={40}
                    placeholder={'Folder name'}
                    aria-label={'Folder name'}
                    onChange={(e) => setName(e.currentTarget.value)}
                />
                {error && <p css={tw`mt-2 text-sm text-red-600`}>{error}</p>}
                <div css={tw`mt-6 flex justify-end gap-3`}>
                    <Button type={'button'} isSecondary onClick={onDismissed}>
                        Cancel
                    </Button>
                    <Button type={'submit'} disabled={busy || name.trim() === ''}>
                        {action}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
