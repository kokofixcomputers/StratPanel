import React, { useEffect, useState } from 'react';
import { CodeIcon, ViewListIcon } from '@heroicons/react/solid';
import { FilesView, getFilesView, setFilesView } from '@/lib/workspace';

const EVENT = 'panel:files-view';

/** Which view of the file manager is chosen: the list, or the code editor view. Remembered in the browser. */
export const useFilesView = (): [FilesView, (view: FilesView) => void] => {
    const [view, setView] = useState<FilesView>(() => getFilesView());

    useEffect(() => {
        const sync = () => setView(getFilesView());
        window.addEventListener(EVENT, sync);

        return () => window.removeEventListener(EVENT, sync);
    }, []);

    return [
        view,
        (next) => {
            setFilesView(next);
            window.dispatchEvent(new Event(EVENT));
        },
    ];
};

/** The two buttons that switch between the views, for the top of the file manager. */
export default () => {
    const [view, setView] = useFilesView();

    const button = (value: FilesView, label: string, icon: React.ReactNode) => (
        <button
            type={'button'}
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                view === value ? 'bg-primary-50 text-primary-700' : 'bg-white text-neutral-300 hover:bg-neutral-600'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div
            className={
                'inline-flex divide-x divide-neutral-500 overflow-hidden rounded-lg border border-neutral-500 shadow-sm'
            }
        >
            {button('list', 'List', <ViewListIcon className={'h-4 w-4'} />)}
            {button('editor', 'Editor', <CodeIcon className={'h-4 w-4'} />)}
        </div>
    );
};
