import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import FileManagerContainer from '@/components/server/files/FileManagerContainer';
import Spinner from '@/components/elements/Spinner';
import { useFilesView } from '@/components/server/files/ViewSwitch';
import { hashToPath } from '@/helpers';

// The editor (Monaco) is big, it is only loaded when the page that needs it is opened.
const CodeWorkspace = lazy(() => import('@/components/server/files/workspace/CodeWorkspace'));
const FileEditContainer = lazy(() => import('@/components/server/files/FileEditContainer'));

/** The editor view needs room for a tree next to an editor, on a phone the list is used whatever was chosen. */
const useNarrow = (): boolean => {
    const query = '(max-width: 767px)';
    const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);

    useEffect(() => {
        const media = window.matchMedia?.(query);
        if (!media) return;
        const change = () => setNarrow(media.matches);
        media.addEventListener?.('change', change);

        return () => media.removeEventListener?.('change', change);
    }, []);

    return narrow;
};

const Loading = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<Spinner size={'large'} centered />}>{children}</Suspense>
);

/** The files of the server in the view that was chosen: the list, or the code editor view. */
export const FilesPage = () => {
    const [view] = useFilesView();
    const narrow = useNarrow();

    return view === 'editor' && !narrow ? (
        <Loading>
            <CodeWorkspace />
        </Loading>
    ) : (
        <FileManagerContainer />
    );
};

/** A link to edit a file (from the Content page and so on) opens it in the code editor view when that is the chosen view. */
export const FileEditPage = () => {
    const [view] = useFilesView();
    const narrow = useNarrow();
    const { hash, pathname } = useLocation();

    return (
        <Loading>
            {view === 'editor' && !narrow && pathname.endsWith('/files/edit') ? (
                <CodeWorkspace initialFile={hashToPath(hash)} />
            ) : (
                <FileEditContainer />
            )}
        </Loading>
    );
};
