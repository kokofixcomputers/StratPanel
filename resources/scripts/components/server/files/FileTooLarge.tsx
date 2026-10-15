import React from 'react';
import { DocumentDownloadIcon, ExclamationIcon } from '@heroicons/react/solid';
import { Button } from '@/components/elements/button/index';
import { bytesToString } from '@/lib/formatters';

interface Props {
    name: string;
    // Null when the panel refused the file without saying how big it is.
    size: number | null;
    limit: number;
    onDownload: () => void;
    onBack: () => void;
    downloading: boolean;
}

/** What is shown instead of the editor for a file that is too big to open in it. */
export default ({ name, size, limit, onDownload, onBack, downloading }: Props) => (
    <div className={'mx-auto my-10 max-w-xl px-4'}>
        <div className={'rounded-xl border border-neutral-500 bg-white p-6 text-center shadow-md'}>
            <span className={'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-50'}>
                <ExclamationIcon className={'h-6 w-6 text-yellow-600'} />
            </span>
            <h2 className={'text-lg font-semibold text-neutral-50'}>This file is too big to edit here</h2>
            <p className={'mt-2 break-all font-mono text-xs text-neutral-300'}>{name}</p>
            <p className={'mt-4 text-sm leading-relaxed text-neutral-300'}>
                {size !== null ? <>It is {bytesToString(size)}, </> : <>It is bigger than </>}
                and the editor opens files up to {bytesToString(limit)}. Larger ones make the browser slow or stop it
                altogether. You can download it, or open it over SFTP in an editor on your computer.
            </p>
            <div className={'mt-5 flex flex-wrap justify-center gap-2'}>
                <Button disabled={downloading} onClick={onDownload}>
                    <DocumentDownloadIcon className={'mr-2 h-4 w-4'} />
                    {downloading ? 'Preparing...' : 'Download'}
                </Button>
                <Button.Text onClick={onBack}>Back to the files</Button.Text>
            </div>
        </div>
    </div>
);
