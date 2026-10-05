import React, { useState } from 'react';
import { CheckIcon, ClipboardCopyIcon, ExternalLinkIcon, ShareIcon } from '@heroicons/react/solid';
import copy from 'copy-to-clipboard';
import { ServerContext } from '@/state/server';
import getFileContents from '@/api/server/files/getFileContents';
import { SharedLog, uploadLog } from '@/lib/mclogs';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import { httpErrorToHuman } from '@/api/http';

interface Props {
    // Path of the log to upload, e.g. /logs/latest.log
    file: string;
    label?: string;
    className?: string;
}

/** Uploads a log file to mclo.gs after the user confirms, then shows the link to share. */
export default ({ file, label = 'Share logs', className }: Props) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [shared, setShared] = useState<SharedLog | null>(null);
    const [copied, setCopied] = useState(false);

    const upload = async () => {
        setConfirming(false);
        setBusy(true);
        setError('');

        try {
            const content = await getFileContents(uuid, file);
            if (!content.trim()) throw new Error(`${file} is empty.`);
            setShared(await uploadLog(content));
        } catch (e) {
            setError((e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button.Text className={className} disabled={busy} onClick={() => setConfirming(true)}>
                <ShareIcon className={'mr-2 h-4 w-4'} />
                {busy ? 'Uploading...' : label}
            </Button.Text>

            <Dialog.Confirm
                open={confirming}
                title={'Share logs on mclo.gs'}
                confirm={'Upload'}
                confirmVariant={'primary'}
                onClose={() => setConfirming(false)}
                onConfirmed={upload}
            >
                <p className={'text-sm'}>
                    <span className={'font-semibold text-neutral-50'}>{file}</span> will be uploaded to mclo.gs, a
                    public log sharing service, and anyone with the link can read it. mclo.gs hides IP addresses
                    automatically, but check the log for anything else you want to keep private.
                </p>
            </Dialog.Confirm>

            <Dialog
                open={!!shared || !!error}
                onClose={() => {
                    setShared(null);
                    setError('');
                    setCopied(false);
                }}
                title={shared ? 'Log uploaded' : 'Upload failed'}
                description={shared ? 'Share this link to let others read the log.' : error}
            >
                {shared && (
                    <>
                        <Input readOnly value={shared.url} onFocus={(e) => e.currentTarget.select()} />
                        <Dialog.Footer>
                            <Button.Text
                                onClick={() => {
                                    copy(shared.url);
                                    setCopied(true);
                                }}
                            >
                                {copied ? (
                                    <CheckIcon className={'mr-2 h-4 w-4'} />
                                ) : (
                                    <ClipboardCopyIcon className={'mr-2 h-4 w-4'} />
                                )}
                                {copied ? 'Copied' : 'Copy link'}
                            </Button.Text>
                            <a href={shared.url} target={'_blank'} rel={'noopener noreferrer'}>
                                <Button>
                                    <ExternalLinkIcon className={'mr-2 h-4 w-4'} />
                                    Open
                                </Button>
                            </a>
                        </Dialog.Footer>
                    </>
                )}
            </Dialog>
        </>
    );
};
