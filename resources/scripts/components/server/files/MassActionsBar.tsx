import React, { useEffect, useState } from 'react';
import { ArchiveIcon, ArrowRightIcon, TrashIcon } from '@heroicons/react/solid';
import { Button } from '@/components/elements/button/index';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import useFileManagerSwr from '@/plugins/useFileManagerSwr';
import useFlash from '@/plugins/useFlash';
import { runArchiveTask } from '@/lib/tasks';
import { ServerContext } from '@/state/server';
import deleteFiles from '@/api/server/files/deleteFiles';
import RenameFileModal from '@/components/server/files/RenameFileModal';
import { Dialog } from '@/components/elements/dialog';

const MassActionsBar = () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    const { mutate } = useFileManagerSwr();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);
    const [showMove, setShowMove] = useState(false);
    const directory = ServerContext.useStoreState((state) => state.files.directory);

    const selectedFiles = ServerContext.useStoreState((state) => state.files.selectedFiles);
    const setSelectedFiles = ServerContext.useStoreActions((actions) => actions.files.setSelectedFiles);

    useEffect(() => {
        if (!loading) setLoadingMessage('');
    }, [loading]);

    // Archiving runs as a background task (see the task menu) so the file manager stays usable meanwhile.
    const onClickCompress = () => {
        clearFlashes('files');
        runArchiveTask(uuid, directory, selectedFiles);
        setSelectedFiles([]);
    };

    const onClickConfirmDeletion = () => {
        setLoading(true);
        setShowConfirm(false);
        clearFlashes('files');
        setLoadingMessage('Deleting files...');

        deleteFiles(uuid, directory, selectedFiles)
            .then(() => {
                mutate((files) => files.filter((f) => selectedFiles.indexOf(f.name) < 0), false);
                setSelectedFiles([]);
            })
            .catch((error) => {
                mutate();
                clearAndAddHttpError({ key: 'files', error });
            })
            .then(() => setLoading(false));
    };

    const none = selectedFiles.length === 0;

    return (
        <>
            <SpinnerOverlay visible={loading} size={'large'} fixed>
                {loadingMessage}
            </SpinnerOverlay>
            <Dialog.Confirm
                title={'Delete Files'}
                open={showConfirm}
                confirm={'Delete'}
                onClose={() => setShowConfirm(false)}
                onConfirmed={onClickConfirmDeletion}
            >
                <p className={'mb-2 text-sm'}>
                    Are you sure you want to delete&nbsp;
                    <span className={'font-semibold text-neutral-50'}>{selectedFiles.length} files</span>? This is a
                    permanent action and the files cannot be recovered.
                </p>
                <ul className={'text-sm text-neutral-300 list-disc list-inside'}>
                    {selectedFiles.slice(0, 15).map((file) => (
                        <li key={file}>{file}</li>
                    ))}
                    {selectedFiles.length > 15 && <li>and {selectedFiles.length - 15} others</li>}
                </ul>
            </Dialog.Confirm>
            {showMove && (
                <RenameFileModal
                    files={selectedFiles}
                    visible
                    appear
                    useMoveTerminology
                    onDismissed={() => setShowMove(false)}
                />
            )}
            <Button.Text disabled={none} onClick={() => setShowMove(true)}>
                <ArrowRightIcon className={'w-4 h-4 mr-2'} />
                Move
            </Button.Text>
            <Button.Text disabled={none} onClick={onClickCompress}>
                <ArchiveIcon className={'w-4 h-4 mr-2'} />
                Archive
            </Button.Text>
            <Button.Danger variant={Button.Variants.Secondary} disabled={none} onClick={() => setShowConfirm(true)}>
                <TrashIcon className={'w-4 h-4 mr-2'} />
                Delete
            </Button.Danger>
        </>
    );
};

export default MassActionsBar;
