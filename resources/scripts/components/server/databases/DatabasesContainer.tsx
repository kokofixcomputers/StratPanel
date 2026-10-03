import React, { useEffect, useState } from 'react';
import getServerDatabases from '@/api/server/databases/getServerDatabases';
import { ServerContext } from '@/state/server';
import { httpErrorToHuman } from '@/api/http';
import FlashMessageRender from '@/components/FlashMessageRender';
import DatabaseRow from '@/components/server/databases/DatabaseRow';
import Spinner from '@/components/elements/Spinner';
import CreateDatabaseButton from '@/components/server/databases/CreateDatabaseButton';
import Can from '@/components/elements/Can';
import useFlash from '@/plugins/useFlash';
import tw from 'twin.macro';
import { DatabaseIcon } from '@heroicons/react/outline';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import Fade from '@/components/elements/Fade';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { useDeepMemoize } from '@/plugins/useDeepMemoize';

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const databaseLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.databases);

    const { addError, clearFlashes } = useFlash();
    const [loading, setLoading] = useState(true);

    const databases = useDeepMemoize(ServerContext.useStoreState((state) => state.databases.data));
    const setDatabases = ServerContext.useStoreActions((state) => state.databases.setDatabases);

    useEffect(() => {
        setLoading(!databases.length);
        clearFlashes('databases');

        getServerDatabases(uuid)
            .then((databases) => setDatabases(databases))
            .catch((error) => {
                console.error(error);
                addError({ key: 'databases', message: httpErrorToHuman(error) });
            })
            .then(() => setLoading(false));
    }, []);

    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

    return (
        <ServerContentBlock title={'Databases'}>
            <PageHeader title={'Databases'} subtitle={`Manage databases for ${serverName}`} />
            <FlashMessageRender byKey={'databases'} css={tw`mb-4`} />
            <ListHeader
                icon={<DatabaseIcon className={'w-6 h-6'} />}
                title={'Databases'}
                count={`${databases.length} / ${databaseLimit}`}
            >
                <Can action={'database.create'}>
                    {databaseLimit > 0 && databaseLimit !== databases.length && <CreateDatabaseButton />}
                </Can>
            </ListHeader>
            {!databases.length && loading ? (
                <Spinner size={'large'} centered />
            ) : (
                <Fade timeout={150}>
                    <>
                        {databases.length > 0 ? (
                            databases.map((database) => <DatabaseRow key={database.id} database={database} />)
                        ) : (
                            <EmptyState>
                                {databaseLimit > 0
                                    ? 'It looks like you have no databases.'
                                    : 'Databases cannot be created for this server.'}
                            </EmptyState>
                        )}
                    </>
                </Fade>
            )}
        </ServerContentBlock>
    );
};
