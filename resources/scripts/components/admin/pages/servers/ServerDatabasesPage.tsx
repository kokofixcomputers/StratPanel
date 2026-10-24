import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DatabaseIcon, KeyIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { Notice, SelectField, Stack, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Sensitive from '@/components/elements/Sensitive';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import {
    createServerDatabase,
    deleteServerDatabase,
    resetServerDatabasePassword,
    ServerDatabase,
    useServer,
    useServerDatabases,
} from '@/api/admin/servers';

/** Admin > Servers > one server > Database. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server } = useServer(id);
    const { data, error, mutate } = useServerDatabases(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [fresh, setFresh] = useState({ database_host_id: '', database: '', remote: '%', max_connections: '' });
    const [removing, setRemoving] = useState<ServerDatabase | null>(null);
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.databases');

    if (!server || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then(() => {
            addFlash({ key: 'admin', type: 'success', message });

            return mutate();
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => {
                setBusy(false);
                setRemoving(null);
            });
    };

    return (
        <ServerFrame server={server} subtitle={'Manage the databases of this server.'}>
            <div className={'mb-4'}>
                <Notice tone={'blue'}>
                    Database passwords can be seen when visiting this server on the front-end.
                </Notice>
            </div>
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<DatabaseIcon className={'h-5 w-5'} />}
                    title={'Active databases'}
                >
                    {data.databases.length === 0 ? (
                        <Empty>This server has no databases yet.</Empty>
                    ) : (
                        <AdminTable
                            heads={['Database', 'Username', 'Connections from', 'Host', 'Max connections', null]}
                        >
                            {data.databases.map((database) => (
                                <Row key={database.id}>
                                    <Cell>{database.database}</Cell>
                                    <Cell>{database.username}</Cell>
                                    <Cell>{database.remote}</Cell>
                                    <Cell>
                                        <Sensitive>{database.host}</Sensitive>
                                    </Cell>
                                    <Cell>{database.max_connections ?? 'Unlimited'}</Cell>
                                    <Cell>
                                        {can && (
                                            <div className={'flex gap-2'}>
                                                <button
                                                    type={'button'}
                                                    title={'Reset the password'}
                                                    className={'text-primary-600'}
                                                    disabled={busy}
                                                    onClick={() =>
                                                        run(
                                                            resetServerDatabasePassword(data.id, database.id),
                                                            'The password of this database was reset.'
                                                        )
                                                    }
                                                >
                                                    <KeyIcon className={'h-4 w-4'} />
                                                </button>
                                                <button
                                                    type={'button'}
                                                    title={'Delete'}
                                                    className={'text-red-500'}
                                                    onClick={() => setRemoving(database)}
                                                >
                                                    <TrashIcon className={'h-4 w-4'} />
                                                </button>
                                            </div>
                                        )}
                                    </Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                </SectionCard>
                {can && (
                    <SectionCard icon={<PlusIcon className={'h-5 w-5'} />} title={'Create new database'}>
                        <Stack>
                            <SelectField
                                id={'db-host'}
                                label={'Database host'}
                                value={fresh.database_host_id || String(data.hosts[0]?.id ?? '')}
                                choices={data.hosts.map((h) => ({ value: String(h.id), label: h.name }))}
                                onChange={(database_host_id) => setFresh({ ...fresh, database_host_id })}
                                help={'The database server this database is made on.'}
                            />
                            <TextField
                                id={'db-name'}
                                label={`Database (s${data.id}_)`}
                                value={fresh.database}
                                maxLength={24}
                                onChange={(database) => setFresh({ ...fresh, database })}
                            />
                            <TextField
                                id={'db-remote'}
                                label={'Connections'}
                                value={fresh.remote}
                                onChange={(remote) => setFresh({ ...fresh, remote })}
                                help={
                                    'The IP address that connections are allowed from, in standard MySQL notation. If unsure leave it as %.'
                                }
                            />
                            <TextField
                                id={'db-max'}
                                type={'number'}
                                label={'Concurrent connections'}
                                value={fresh.max_connections}
                                onChange={(max_connections) => setFresh({ ...fresh, max_connections })}
                                help={
                                    'The maximum number of concurrent connections from this user to the database. Leave empty for unlimited.'
                                }
                            />
                            <p className={'text-xs text-neutral-400'}>
                                A username and password for this database are generated randomly after you submit.
                            </p>
                            <Button
                                disabled={busy || !fresh.database.trim() || data.hosts.length === 0}
                                onClick={() =>
                                    run(
                                        createServerDatabase(data.id, {
                                            ...fresh,
                                            database_host_id: fresh.database_host_id || String(data.hosts[0].id),
                                        }).then(() => setFresh({ ...fresh, database: '' })),
                                        'The database was created.'
                                    )
                                }
                            >
                                Create database
                            </Button>
                        </Stack>
                    </SectionCard>
                )}
            </div>
            <Dialog.Confirm
                open={!!removing}
                title={'Delete this database?'}
                confirm={'Delete'}
                onConfirmed={() =>
                    removing && run(deleteServerDatabase(data.id, removing.id), 'The database was deleted.')
                }
                onClose={() => setRemoving(null)}
            >
                There is no going back, all data is removed immediately.
            </Dialog.Confirm>
        </ServerFrame>
    );
};
