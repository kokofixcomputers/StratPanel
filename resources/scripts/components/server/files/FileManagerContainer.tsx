import React, { useEffect, useRef, useState } from 'react';
import { httpErrorToHuman } from '@/api/http';
import { CSSTransition } from 'react-transition-group';
import Spinner from '@/components/elements/Spinner';
import FileObjectRow from '@/components/server/files/FileObjectRow';
import FileManagerBreadcrumbs from '@/components/server/files/FileManagerBreadcrumbs';
import { FileObject } from '@/api/server/files/loadDirectory';
import NewDirectoryButton from '@/components/server/files/NewDirectoryButton';
import { NavLink, useLocation } from 'react-router-dom';
import Can from '@/components/elements/Can';
import { ServerError } from '@/components/elements/ScreenBlock';
import tw from 'twin.macro';
import { Button } from '@/components/elements/button/index';
import { ServerContext } from '@/state/server';
import useFileManagerSwr from '@/plugins/useFileManagerSwr';
import FileManagerStatus from '@/components/server/files/FileManagerStatus';
import MassActionsBar from '@/components/server/files/MassActionsBar';
import { DocumentAddIcon, SearchIcon } from '@heroicons/react/solid';
import UploadButton from '@/components/server/files/UploadButton';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { useStoreActions } from '@/state/hooks';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { FileActionCheckbox } from '@/components/server/files/SelectFileCheckbox';
import { hashToPath } from '@/helpers';
import useJarIcons from '@/components/server/files/useJarIcons';
import style from './style.module.css';

const sortFiles = (files: FileObject[]): FileObject[] => {
    const sortedFiles: FileObject[] = files
        .sort((a, b) => a.name.localeCompare(b.name))
        .sort((a, b) => (a.isFile === b.isFile ? 0 : a.isFile ? 1 : -1));
    return sortedFiles.filter((file, index) => index === 0 || file.name !== sortedFiles[index - 1].name);
};

export default () => {
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const serverUuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { hash } = useLocation();
    const { data: files, error, mutate } = useFileManagerSwr();
    const directory = ServerContext.useStoreState((state) => state.files.directory);
    const clearFlashes = useStoreActions((actions) => actions.flashes.clearFlashes);
    const setDirectory = ServerContext.useStoreActions((actions) => actions.files.setDirectory);

    const [search, setSearch] = useState('');
    const setSelectedFiles = ServerContext.useStoreActions((actions) => actions.files.setSelectedFiles);
    const selectedFilesLength = ServerContext.useStoreState((state) => state.files.selectedFiles.length);

    useEffect(() => {
        clearFlashes('files');
        setSelectedFiles([]);
        setSearch('');
        setDirectory(hashToPath(hash));
    }, [hash]);

    useEffect(() => {
        mutate();
    }, [directory]);

    // Once the toolbar has scrolled out of view, selection actions follow the user in a floating panel.
    const toolbar = useRef<HTMLDivElement>(null);
    const [toolbarVisible, setToolbarVisible] = useState(true);
    useEffect(() => {
        const element = toolbar.current;
        if (!element || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(([entry]) => setToolbarVisible(entry.isIntersecting));
        observer.observe(element);

        return () => observer.disconnect();
    }, [!!error]);
    const floatingBar = !toolbarVisible && selectedFilesLength > 0;
    const icons = useJarIcons(serverUuid, directory, files);

    const onSelectAllClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedFiles(e.currentTarget.checked ? files?.map((file) => file.name) || [] : []);
    };

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => mutate()} />;
    }

    const filtered = sortFiles((files || []).slice(0, 250)).filter(
        (file) => !search || file.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <ServerContentBlock title={'File Manager'} showFlashKey={'files'}>
            <ErrorBoundary>
                <h1 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>File Manager</h1>
                <div css={tw`mt-4 mb-6`}>
                    <FileManagerBreadcrumbs />
                </div>
                <Can action={'file.create'}>
                    <div className={style.toolbar} ref={toolbar}>
                        <NewDirectoryButton />
                        <NavLink to={`/server/${id}/files/new${window.location.hash}`}>
                            <Button>
                                <DocumentAddIcon className={'w-5 h-5 mr-2 -ml-1'} />
                                New File
                            </Button>
                        </NavLink>
                        <UploadButton />
                        <div className={style.divider} />
                        <MassActionsBar />
                        <FileManagerStatus />
                    </div>
                </Can>
                <Can action={'file.create'}>{floatingBar && <MassActionsBar floating />}</Can>
                <div css={tw`relative mb-4`}>
                    <SearchIcon css={tw`absolute left-4 top-0 bottom-0 my-auto w-5 h-5 text-neutral-400`} />
                    <input
                        type={'text'}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        placeholder={'Search files in this directory...'}
                        css={tw`w-full bg-white border border-neutral-500 rounded-xl shadow-md pl-12 pr-4 py-3.5 text-sm text-neutral-100 placeholder-neutral-400 focus:border-primary-500`}
                    />
                </div>
            </ErrorBoundary>
            {!files ? (
                <Spinner size={'large'} centered />
            ) : (
                <CSSTransition classNames={'fade'} timeout={150} appear in>
                    <div className={style.table}>
                        <div className={style.header_row}>
                            <label css={tw`absolute pl-5 pr-3 flex items-center`}>
                                <FileActionCheckbox
                                    type={'checkbox'}
                                    checked={files.length > 0 && selectedFilesLength === files.length}
                                    onChange={onSelectAllClick}
                                />
                            </label>
                            <div css={tw`flex-1 ml-12 pl-8`}>Name</div>
                            <div css={tw`w-32 mr-4 hidden sm:block`}>Size</div>
                            <div css={tw`w-56 mr-4 hidden md:block`}>Modified</div>
                            <div css={tw`w-20 text-center`}>Actions</div>
                        </div>
                        {files.length > 250 && (
                            <div css={tw`bg-yellow-50 border-b border-yellow-200 p-3`}>
                                <p css={tw`text-yellow-800 text-sm text-center`}>
                                    This directory is too large to display in the browser, limiting the output to the
                                    first 250 files.
                                </p>
                            </div>
                        )}
                        {!filtered.length ? (
                            <p css={tw`text-sm text-neutral-400 text-center py-10`}>
                                {files.length ? 'No files match your search.' : 'This directory seems to be empty.'}
                            </p>
                        ) : (
                            filtered.map((file) => <FileObjectRow key={file.key} file={file} icon={icons[file.name]} />)
                        )}
                    </div>
                </CSSTransition>
            )}
        </ServerContentBlock>
    );
};
