import React, { useContext, useEffect, useState } from 'react';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import Can from '@/components/elements/Can';
import CreateBackupButton from '@/components/server/backups/CreateBackupButton';
import FlashMessageRender from '@/components/FlashMessageRender';
import BackupRow from '@/components/server/backups/BackupRow';
import tw from 'twin.macro';
import { ArchiveIcon } from '@heroicons/react/outline';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import getServerBackups, { Context as ServerBackupContext } from '@/api/swr/getServerBackups';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Pagination from '@/components/elements/Pagination';

const BackupContainer = () => {
    const { page, setPage } = useContext(ServerBackupContext);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const { data: backups, error, isValidating } = getServerBackups();

    const backupLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.backups);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

    useEffect(() => {
        if (!error) {
            clearFlashes('backups');

            return;
        }

        clearAndAddHttpError({ error, key: 'backups' });
    }, [error]);

    if (!backups || (error && isValidating)) {
        return <Spinner size={'large'} centered />;
    }

    return (
        <ServerContentBlock title={'Backups'}>
            <PageHeader title={'Backups'} subtitle={`Create and restore backups of ${serverName}`} />
            <FlashMessageRender byKey={'backups'} css={tw`mb-4`} />
            <ListHeader
                icon={<ArchiveIcon className={'w-6 h-6'} />}
                title={'Backups'}
                count={`${backups.backupCount} / ${backupLimit}`}
            >
                <Can action={'backup.create'}>
                    {backupLimit > 0 && backupLimit > backups.backupCount && <CreateBackupButton />}
                </Can>
            </ListHeader>
            <Pagination data={backups} onPageSelect={setPage}>
                {({ items }) =>
                    !items.length ? (
                        // Don't show any error messages if the server has no backups and the user cannot
                        // create additional ones for the server.
                        !backupLimit ? null : (
                            <EmptyState>
                                {page > 1
                                    ? "Looks like we've run out of backups to show you, try going back a page."
                                    : 'It looks like there are no backups currently stored for this server.'}
                            </EmptyState>
                        )
                    ) : (
                        items.map((backup) => <BackupRow key={backup.uuid} backup={backup} css={tw`mb-3`} />)
                    )
                }
            </Pagination>
            {backupLimit === 0 && (
                <EmptyState>Backups cannot be created for this server because the backup limit is set to 0.</EmptyState>
            )}
        </ServerContentBlock>
    );
};

export default () => {
    const [page, setPage] = useState<number>(1);
    return (
        <ServerBackupContext.Provider value={{ page, setPage }}>
            <BackupContainer />
        </ServerBackupContext.Provider>
    );
};
