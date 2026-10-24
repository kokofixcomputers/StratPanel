import React, { useEffect, useState } from 'react';
import { Notice } from '@/components/admin/forms';
import { Button } from '@/components/elements/button/index';
import { getUiUpdate, UiUpdate } from '@/api/admin/updates';

const KEY = 'stratpanel:ui-update-hidden';

/** The notice, on every page of the admin area, that a newer web interface was published. What was hidden is remembered per build. */
export default () => {
    const [update, setUpdate] = useState<UiUpdate | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        getUiUpdate()
            .then((found) => {
                let hidden: string | null = null;
                try {
                    hidden = window.localStorage.getItem(KEY);
                } catch (e) {
                    // Nothing remembered, the notice is shown.
                }
                if (found && hidden !== `${found.tag}|${found.published}`) setUpdate(found);
            })
            .catch(() => undefined);
    }, []);

    if (!update) return null;

    const copy = () => {
        const done = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(update.command).then(done);
        }
    };

    return (
        <div className={'mx-auto mb-4 max-w-screen-xl px-4'}>
            <Notice tone={'blue'}>
                <strong>Hey! An update is available.</strong> A newer web interface ({update.name || update.tag}) was
                published{update.published ? ` on ${new Date(update.published).toLocaleDateString()}` : ''}. Run this on
                the server to install it, then hard refresh the browser:
                <div className={'mt-2 flex flex-wrap items-center gap-2'}>
                    <code className={'min-w-0 flex-1 break-all rounded bg-white/60 px-2 py-1 text-xs'}>
                        {update.command}
                    </code>
                    <Button.Text onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button.Text>
                    <Button.Text
                        onClick={() => {
                            try {
                                window.localStorage.setItem(KEY, `${update.tag}|${update.published}`);
                            } catch (e) {
                                // Only hidden for now.
                            }
                            setUpdate(null);
                        }}
                    >
                        Hide until the next update
                    </Button.Text>
                </div>
                <p className={'mt-2 text-xs opacity-80'}>
                    Only the interface is replaced, the previous one is kept and{' '}
                    <code>php artisan p:update-ui --rollback</code> puts it back. Changes that need a database migration
                    need the full update, see the README.
                </p>
            </Notice>
        </div>
    );
};
