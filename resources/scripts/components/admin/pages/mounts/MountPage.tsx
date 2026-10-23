import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ChipIcon, CollectionIcon, ViewGridIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { CheckList, TextField } from '@/components/admin/forms';
import MountForm from '@/components/admin/pages/mounts/MountForm';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { useEggLookup, useNodeLookup } from '@/api/admin/lookups';
import {
    addEggs,
    addNodes,
    deleteMount,
    MountInput,
    removeEgg,
    removeNode,
    updateMount,
    useMount,
} from '@/api/admin/mounts';

/** Admin > Mounts > one mount: its details, the eggs and the nodes it is for. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useMount(id);
    const eggs = useEggLookup();
    const nodes = useNodeLookup();
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<MountInput>({
        name: '',
        description: '',
        source: '',
        target: '',
        read_only: false,
        user_mountable: false,
    });
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [adding, setAdding] = useState<null | 'eggs' | 'nodes'>(null);
    const [picked, setPicked] = useState<number[]>([]);

    useEffect(() => {
        if (!data) return;

        setValue({
            name: data.name,
            description: data.description || '',
            source: data.source,
            target: data.target,
            read_only: data.read_only,
            user_mountable: data.user_mountable,
        });
    }, [data?.id, data?.name, data?.description, data?.source, data?.target, data?.read_only, data?.user_mountable]);

    const fail = (e: any) => clearAndAddHttpError({ key: 'admin', error: e });
    const ok = (message: string) => addFlash({ key: 'admin', type: 'success', message });

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateMount(Number(id), value)
            .then(() => {
                ok('Mount was updated successfully.');

                return mutate();
            })
            .catch(fail)
            .then(() => setBusy(false));
    };

    const remove = () => {
        clearFlashes('admin');
        deleteMount(Number(id))
            .then(() => history.push('/admin/mounts'))
            .catch(fail)
            .then(() => setDeleting(false));
    };

    const add = () => {
        if (!adding || picked.length === 0) return;
        clearFlashes('admin');
        (adding === 'eggs' ? addEggs(Number(id), picked) : addNodes(Number(id), picked))
            .then(() => {
                ok('Mount was updated successfully.');

                return mutate();
            })
            .catch(fail)
            .then(() => setAdding(null));
    };

    const detach = (kind: 'egg' | 'node', itemId: number) => {
        clearFlashes('admin');
        (kind === 'egg' ? removeEgg(Number(id), itemId) : removeNode(Number(id), itemId))
            .then(() => mutate())
            .catch(fail);
    };

    const back = (
        <AdminLink to={'/admin/mounts'} className={'inline-flex items-center text-sm'}>
            <ArrowLeftIcon className={'mr-1.5 h-4 w-4'} />
            All mounts
        </AdminLink>
    );

    if (!data) {
        return (
            <AdminPage title={'Mount'} actions={back}>
                {error ? (
                    <p className={'text-sm text-red-600'}>This mount could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    const canEdit = admin.can('mounts.update');

    return (
        <AdminPage title={data.name} subtitle={data.description || undefined} actions={back}>
            <div className={'grid items-start gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<CollectionIcon className={'h-5 w-5'} />} title={'Mount details'}>
                    <div className={'mb-4'}>
                        <TextField
                            id={'mount-uuid'}
                            label={'Unique ID'}
                            value={data.uuid}
                            onChange={() => undefined}
                            disabled
                        />
                    </div>
                    <MountForm value={value} onChange={setValue} idPrefix={'mount'} disabled={!canEdit} />
                    <div className={'mt-6 flex items-center justify-between gap-3'}>
                        {admin.can('mounts.delete') ? (
                            <Button.Danger type={'button'} onClick={() => setDeleting(true)}>
                                Delete
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        {canEdit && (
                            <Button type={'button'} onClick={save} disabled={busy || !value.name.trim()}>
                                {busy ? 'Saving...' : 'Save'}
                            </Button>
                        )}
                    </div>
                </SectionCard>
                <div className={'space-y-4'}>
                    <SectionCard
                        icon={<ViewGridIcon className={'h-5 w-5'} />}
                        title={'Eggs'}
                        description={'The servers of these eggs can use the mount'}
                        badge={
                            canEdit ? (
                                <Button
                                    type={'button'}
                                    onClick={() => {
                                        setPicked([]);
                                        setAdding('eggs');
                                    }}
                                >
                                    Add eggs
                                </Button>
                            ) : undefined
                        }
                    >
                        {data.eggs.length === 0 ? (
                            <Empty>No egg yet.</Empty>
                        ) : (
                            <AdminTable heads={['ID', 'Name', null]} className={'-mx-5 -mb-5 -mt-5'}>
                                {data.eggs.map((egg) => (
                                    <Row key={egg.id}>
                                        <Cell>
                                            <code className={'text-xs'}>{egg.id}</code>
                                        </Cell>
                                        <Cell>
                                            <AdminLink to={`/admin/nests/egg/view/${egg.id}`}>{egg.name}</AdminLink>
                                        </Cell>
                                        <Cell className={'text-right'}>
                                            {canEdit && (
                                                <Button.Text
                                                    type={'button'}
                                                    variant={Options.Variant.Secondary}
                                                    onClick={() => detach('egg', egg.id)}
                                                >
                                                    Remove
                                                </Button.Text>
                                            )}
                                        </Cell>
                                    </Row>
                                ))}
                            </AdminTable>
                        )}
                    </SectionCard>
                    <SectionCard
                        icon={<ChipIcon className={'h-5 w-5'} />}
                        title={'Nodes'}
                        description={'The mount can be used on these nodes'}
                        badge={
                            canEdit ? (
                                <Button
                                    type={'button'}
                                    onClick={() => {
                                        setPicked([]);
                                        setAdding('nodes');
                                    }}
                                >
                                    Add nodes
                                </Button>
                            ) : undefined
                        }
                    >
                        {data.nodes.length === 0 ? (
                            <Empty>No node yet.</Empty>
                        ) : (
                            <AdminTable heads={['ID', 'Name', 'FQDN', null]} className={'-mx-5 -mb-5 -mt-5'}>
                                {data.nodes.map((node) => (
                                    <Row key={node.id}>
                                        <Cell>
                                            <code className={'text-xs'}>{node.id}</code>
                                        </Cell>
                                        <Cell>
                                            <AdminLink to={`/admin/nodes/view/${node.id}`}>{node.name}</AdminLink>
                                        </Cell>
                                        <Cell>
                                            <code className={'text-xs'}>{node.fqdn}</code>
                                        </Cell>
                                        <Cell className={'text-right'}>
                                            {canEdit && (
                                                <Button.Text
                                                    type={'button'}
                                                    variant={Options.Variant.Secondary}
                                                    onClick={() => detach('node', node.id)}
                                                >
                                                    Remove
                                                </Button.Text>
                                            )}
                                        </Cell>
                                    </Row>
                                ))}
                            </AdminTable>
                        )}
                    </SectionCard>
                </div>
            </div>

            <Dialog
                open={!!adding}
                onClose={() => setAdding(null)}
                title={adding === 'eggs' ? 'Add eggs' : 'Add nodes'}
            >
                <CheckList
                    groups={
                        adding === 'eggs'
                            ? (eggs.data || []).map((nest) => ({
                                  label: nest.name,
                                  items: nest.eggs.map((egg) => ({ id: egg.id, label: egg.name })),
                              }))
                            : (nodes.data || []).map((location) => ({
                                  label: location.short,
                                  items: location.nodes.map((node) => ({ id: node.id, label: node.name })),
                              }))
                    }
                    selected={picked}
                    onChange={setPicked}
                    taken={adding === 'eggs' ? data.eggs.map((egg) => egg.id) : data.nodes.map((node) => node.id)}
                />
                <Dialog.Footer>
                    <Button.Text onClick={() => setAdding(null)}>Cancel</Button.Text>
                    <Button onClick={add} disabled={picked.length === 0}>
                        Add
                    </Button>
                </Dialog.Footer>
            </Dialog>
            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.name}`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                Servers that use this mount lose it.
            </Dialog.Confirm>
        </AdminPage>
    );
};
