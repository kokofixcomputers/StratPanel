import React from 'react';
import { ExclamationIcon } from '@heroicons/react/solid';
import { protectedFiles } from '@/lib/protectedFiles';

/** A warning for the delete dialogs when files the panel depends on are among the files to delete. */
export default ({ directory, names }: { directory: string; names: string[] }) => {
    const found = protectedFiles(directory, names);
    if (found.length === 0) return null;

    return (
        <div className={'mt-3 flex items-start rounded-xl border border-yellow-200 bg-yellow-50 p-3'}>
            <ExclamationIcon className={'mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600'} />
            <div className={'min-w-0 text-sm text-yellow-800'}>
                <p className={'font-semibold'}>This may cause data loss or take away features of the panel.</p>
                <ul className={'mt-1 list-none space-y-1.5 p-0'}>
                    {found.map((file) => (
                        <li key={file.name}>
                            <span className={'font-mono font-semibold'}>{file.name}</span>: {file.consequence}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};
