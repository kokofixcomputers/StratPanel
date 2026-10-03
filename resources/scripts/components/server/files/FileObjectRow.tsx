import { encodePathSegments } from '@/helpers';
import { differenceInHours, format, formatDistanceToNow } from 'date-fns';
import React, { memo } from 'react';
import { DocumentIcon, DocumentTextIcon, FolderIcon, LinkIcon, ArchiveIcon } from '@heroicons/react/solid';
import classNames from 'classnames';
import { FileObject } from '@/api/server/files/loadDirectory';
import FileDropdownMenu from '@/components/server/files/FileDropdownMenu';
import { ServerContext } from '@/state/server';
import { NavLink, useRouteMatch } from 'react-router-dom';
import tw from 'twin.macro';
import isEqual from 'react-fast-compare';
import SelectFileCheckbox from '@/components/server/files/SelectFileCheckbox';
import { usePermissions } from '@/plugins/usePermissions';
import { join } from 'pathe';
import { bytesToString } from '@/lib/formatters';
import styles from './style.module.css';

const Clickable: React.FC<{ file: FileObject }> = memo(({ file, children }) => {
    const [canRead] = usePermissions(['file.read']);
    const [canReadContents] = usePermissions(['file.read-content']);
    const directory = ServerContext.useStoreState((state) => state.files.directory);

    const match = useRouteMatch();

    return (file.isFile && (!file.isEditable() || !canReadContents)) || (!file.isFile && !canRead) ? (
        <div className={styles.details}>{children}</div>
    ) : (
        <NavLink
            className={styles.details}
            to={`${match.url}${file.isFile ? '/edit' : ''}#${encodePathSegments(join(directory, file.name))}`}
        >
            {children}
        </NavLink>
    );
}, isEqual);

const FileIcon = ({ file }: { file: FileObject }) => {
    const className = 'w-5 h-5';

    if (!file.isFile) return <FolderIcon className={classNames(className, 'text-primary-600')} />;
    if (file.isSymlink) return <LinkIcon className={classNames(className, 'text-neutral-400')} />;
    if (file.isArchiveType()) return <ArchiveIcon className={classNames(className, 'text-yellow-500')} />;
    if (file.isEditable()) return <DocumentTextIcon className={classNames(className, 'text-neutral-400')} />;

    return <DocumentIcon className={classNames(className, 'text-neutral-400')} />;
};

const FileObjectRow = ({ file }: { file: FileObject }) => {
    const selected = ServerContext.useStoreState((state) => state.files.selectedFiles.indexOf(file.name) >= 0);

    return (
        <div
            className={classNames(styles.file_row, { [styles.selected]: selected })}
            key={file.name}
            onContextMenu={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent(`pterodactyl:files:ctx:${file.key}`, { detail: e.clientX }));
            }}
        >
            <SelectFileCheckbox name={file.name} />
            <Clickable file={file}>
                <div css={tw`flex-none ml-12 mr-3`}>
                    <FileIcon file={file} />
                </div>
                <div css={tw`flex-1 truncate font-medium`}>{file.name}</div>
                <div css={tw`w-32 mr-4 hidden sm:block text-neutral-300`}>
                    {file.isFile ? bytesToString(file.size) : '-'}
                </div>
                <div css={tw`w-56 mr-4 hidden md:block text-neutral-300`} title={file.modifiedAt.toString()}>
                    {Math.abs(differenceInHours(file.modifiedAt, new Date())) > 48
                        ? format(file.modifiedAt, 'M/d/yyyy, h:mm:ss a')
                        : formatDistanceToNow(file.modifiedAt, { addSuffix: true })}
                </div>
            </Clickable>
            <div css={tw`w-20 flex justify-center`}>
                <FileDropdownMenu file={file} />
            </div>
        </div>
    );
};

export default memo(FileObjectRow, (prevProps, nextProps) => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const { isArchiveType, isEditable, ...prevFile } = prevProps.file;
    const { isArchiveType: nextIsArchiveType, isEditable: nextIsEditable, ...nextFile } = nextProps.file;
    /* eslint-enable @typescript-eslint/no-unused-vars */

    return isEqual(prevFile, nextFile);
});
