import React, { useState } from 'react';
import { ClipboardListIcon } from '@heroicons/react/outline';
import { Dialog } from '@/components/elements/dialog';
import { Button } from '@/components/elements/button/index';

export default ({ meta }: { meta: Record<string, unknown> }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={'self-center md:px-4'}>
            <Dialog open={open} onClose={() => setOpen(false)} hideCloseIcon title={'Metadata'}>
                <pre
                    className={
                        'bg-neutral-600 border border-neutral-500 rounded-lg p-3 font-mono text-sm leading-relaxed overflow-x-scroll whitespace-pre-wrap'
                    }
                >
                    {JSON.stringify(meta, null, 2)}
                </pre>
                <Dialog.Footer>
                    <Button.Text onClick={() => setOpen(false)}>Close</Button.Text>
                </Dialog.Footer>
            </Dialog>
            <button
                aria-describedby={'View additional event metadata'}
                className={
                    'p-2 transition-colors duration-100 text-neutral-400 group-hover:text-neutral-200 group-hover:hover:text-neutral-50'
                }
                onClick={() => setOpen(true)}
            >
                <ClipboardListIcon className={'w-5 h-5'} />
            </button>
        </div>
    );
};
