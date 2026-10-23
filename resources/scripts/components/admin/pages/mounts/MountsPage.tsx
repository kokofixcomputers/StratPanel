import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { CollectionIcon, PlusIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import MountForm from '@/components/admin/pages/mounts/MountForm';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createMount, MountInput, useMounts } from '@/api/admin/mounts';

const EMPTY: MountInput = {
    name: '',
    description: '',
    source: '',
    target: '',
    read_only: false,
    user_mountable: false,
};

/** Admin > Mounts: folders of a node that servers can use. */
export default () => {
    const { data, error } = useMounts();
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [value, setValue] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createMount(value)
            .then((mount) => {
                addFlash({ key: 'admin', type: 'success', message: 'Mount was created successfully.' });
                history.push(`/admin/mounts/view/${mount.id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setCreating(false);
            })
            .then(() => setBusy(false));
    };

    return (
        <AdminPage title={'Mounts'} subtitle={'Configure and manage additional mount points for servers.'}>
            <ListHeader
                icon={<CollectionIcon className={'h-6 w-6'} />}
                title={'Mount list'}
                count={data ? String(data.mounts.length) : undefined}
            >
                {admin.can('mounts.create') && (
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
                        <p className={'p-6 text-sm text-red-600'}>The mounts could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.mounts.length === 0 ? (
                    <Empty>There are no mounts yet.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Name', 'Source', 'Target', 'Eggs', 'Nodes', 'Servers']}>
                        {data.mounts.map((mount) => (
                            <Row key={mount.id} onClick={() => history.push(`/admin/mounts/view/${mount.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{mount.id}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>{mount.name}</Cell>
                                <Cell>
                                    <code className={'text-xs'}>{mount.source}</code>
                                </Cell>
                                <Cell>
                                    <code className={'text-xs'}>{mount.target}</code>
                                </Cell>
                                <Cell>{mount.eggs}</Cell>
                                <Cell>{mount.nodes}</Cell>
                                <Cell>{mount.servers}</Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>

            <Dialog open={creating} onClose={() => setCreating(false)} title={'Create a mount'}>
                <MountForm value={value} onChange={setValue} idPrefix={'new-mount'} />
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button
                        onClick={create}
                        disabled={busy || !value.name.trim() || !value.source.trim() || !value.target.trim()}
                    >
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
