import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, DatabaseIcon, ServerIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { Notice } from '@/components/admin/forms';
import HostForm, { HOST_WARNING } from '@/components/admin/pages/databases/HostForm';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { deleteHost, HostInput, updateHost, useHost } from '@/api/admin/databases';
import { nodeGroups, useNodeLookup } from '@/api/admin/lookups';

/** Admin > Database hosts > one host: how to reach it, and the databases that were made on it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const [page, setPage] = useState(1);
    const { data, error, mutate } = useHost(id, page);
    const nodes = useNodeLookup();
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<HostInput>({
        name: '',
        host: '',
        port: '',
        username: '',
        password: '',
        node_id: '',
    });
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!data) return;

        const { host } = data;
        setValue({
            name: host.name,
            host: host.host,
            port: String(host.port),
            username: host.username,
            password: '',
            node_id: host.node_id ? String(host.node_id) : '',
        });
    }, [data?.host.id, data?.host.name, data?.host.host, data?.host.port, data?.host.username, data?.host.node_id]);

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateHost(Number(id), value)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'Database host was updated successfully.' });
                setValue((current) => ({ ...current, password: '' }));

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () => {
        clearFlashes('admin');
        deleteHost(Number(id))
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: 'The requested database host has been deleted from the system.',
                });
                history.push('/admin/databases');
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setDeleting(false));
    };

    const back = (
        <AdminLink to={'/admin/databases'} className={'inline-flex items-center text-sm'}>
            <ArrowLeftIcon className={'mr-1.5 h-4 w-4'} />
            All hosts
        </AdminLink>
    );

    if (!data) {
        return (
            <AdminPage title={'Database host'} actions={back}>
                {error ? (
                    <p className={'text-sm text-red-600'}>This host could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    return (
        <AdminPage title={data.host.name} subtitle={`${data.host.host}:${data.host.port}`} actions={back}>
            <SectionCard icon={<DatabaseIcon className={'h-5 w-5'} />} title={'Host details'}>
                <HostForm
                    value={value}
                    onChange={setValue}
                    nodes={nodeGroups(nodes.data)}
                    idPrefix={'host'}
                    isNew={false}
                />
                <div className={'mt-4'}>
                    <Notice tone={'red'}>{HOST_WARNING}</Notice>
                </div>
                <div className={'mt-6 flex items-center justify-between gap-3'}>
                    {admin.can('databases.delete') ? (
                        <Button.Danger type={'button'} onClick={() => setDeleting(true)}>
                            Delete
                        </Button.Danger>
                    ) : (
                        <span />
                    )}
                    {admin.can('databases.update') && (
                        <Button type={'button'} onClick={save} disabled={busy || !value.name.trim()}>
                            {busy ? 'Saving...' : 'Save'}
                        </Button>
                    )}
                </div>
            </SectionCard>

            <SectionCard className={'mt-4'} icon={<ServerIcon className={'h-5 w-5'} />} title={'Databases'}>
                {data.databases.length === 0 ? (
                    <Empty>No server has a database on this host.</Empty>
                ) : (
                    <AdminTable
                        heads={['Server', 'Database', 'Username', 'Connections from', 'Max connections', null]}
                        className={'-mx-5 -mt-5'}
                    >
                        {data.databases.map((database) => (
                            <Row key={database.id}>
                                <Cell>
                                    <AdminLink to={`/admin/servers/view/${database.server.id}`}>
                                        {database.server.name}
                                    </AdminLink>
                                </Cell>
                                <Cell>{database.database}</Cell>
                                <Cell>{database.username}</Cell>
                                <Cell>{database.remote}</Cell>
                                <Cell>{database.max_connections ?? 'Unlimited'}</Cell>
                                <Cell className={'text-right'}>
                                    <AdminLink to={`/admin/servers/view/${database.server.id}/database`}>
                                        Manage
                                    </AdminLink>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
                <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-2'} />
            </SectionCard>

            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.host.name}`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                A database host that still has databases of servers can not be deleted.
            </Dialog.Confirm>
        </AdminPage>
    );
};
