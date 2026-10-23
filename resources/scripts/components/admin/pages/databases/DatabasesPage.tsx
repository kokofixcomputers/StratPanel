import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { DatabaseIcon, PlusIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { Notice } from '@/components/admin/forms';
import HostForm, { HOST_WARNING } from '@/components/admin/pages/databases/HostForm';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createHost, HostInput, useHosts } from '@/api/admin/databases';
import { nodeGroups, useNodeLookup } from '@/api/admin/lookups';

const EMPTY: HostInput = { name: '', host: '', port: '3306', username: '', password: '', node_id: '' };

/** Admin > Database hosts: the database servers that servers get their databases from. */
export default () => {
    const { data, error } = useHosts();
    const nodes = useNodeLookup();
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [value, setValue] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createHost(value)
            .then(({ id }) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: 'Successfully created a new database host on the system.',
                });
                history.push(`/admin/databases/view/${id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setCreating(false);
            })
            .then(() => setBusy(false));
    };

    return (
        <AdminPage title={'Database hosts'} subtitle={'Database hosts that servers can have databases created on.'}>
            <ListHeader
                icon={<DatabaseIcon className={'h-6 w-6'} />}
                title={'Host list'}
                count={data ? String(data.hosts.length) : undefined}
            >
                {admin.can('databases.create') && (
                    <Button
                        onClick={() => {
                            setValue(EMPTY);
                            setCreating(true);
                        }}
                    >
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The database hosts could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.hosts.length === 0 ? (
                    <Empty>There are no database hosts yet.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Name', 'Host', 'Port', 'Username', 'Databases', 'Node']}>
                        {data.hosts.map((host) => (
                            <Row key={host.id} onClick={() => history.push(`/admin/databases/view/${host.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{host.id}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>{host.name}</Cell>
                                <Cell>
                                    <code className={'text-xs'}>{host.host}</code>
                                </Cell>
                                <Cell>
                                    <code className={'text-xs'}>{host.port}</code>
                                </Cell>
                                <Cell>{host.username}</Cell>
                                <Cell>{host.databases}</Cell>
                                <Cell>
                                    {host.node ? (
                                        <AdminLink
                                            to={`/admin/nodes/view/${host.node.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {host.node.name}
                                        </AdminLink>
                                    ) : (
                                        <Pill>None</Pill>
                                    )}
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>

            <Dialog open={creating} onClose={() => setCreating(false)} title={'Create a database host'}>
                <HostForm
                    value={value}
                    onChange={setValue}
                    nodes={nodeGroups(nodes.data)}
                    idPrefix={'new-host'}
                    isNew
                />
                <div className={'mt-4'}>
                    <Notice tone={'red'}>{HOST_WARNING}</Notice>
                </div>
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button onClick={create} disabled={busy || !value.name.trim() || !value.host.trim()}>
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
