import React, { useEffect, useState } from 'react';
import { Link, useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ExternalLinkIcon, ServerIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { Columns, Notice, SelectField, Stack, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { deleteBox, suspendBox, updateBox, useAdminBox, useAdminBoxes } from '@/api/admin/boxes';
import BoxMeters from '@/components/dashboard/boxes/BoxMeters';
import BoxStatus from '@/components/dashboard/boxes/BoxStatus';
import { SHARE_KEYS, shareText } from '@/lib/store';

/** Admin > Boxes > one box: its size, owner, time and servers, and a way into it as its owner sees it. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, mutate, error } = useAdminBox(id);
    const { data: list } = useAdminBoxes('', null, 1);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [servers, setServers] = useState<'refuse' | 'detach' | 'delete'>('refuse');
    const can = admin.can('boxes.update');

    useEffect(() => {
        if (!box) return;
        setValue({
            name: box.name,
            memory: String(box.limits.memory),
            disk: String(box.limits.disk),
            cpu: String(box.limits.cpu),
            allocations: String(box.limits.allocations),
            backups: String(box.limits.backups),
            databases: String(box.limits.databases),
            node: box.node ? String(box.node.id) : '',
            expires: box.expires_at ? box.expires_at.slice(0, 10) : '',
            notes: box.notes || '',
        });
    }, [box]);

    if (!box) return error ? null : <Spinner size={'large'} centered />;

    const set = (key: string) => (v: string) => setValue({ ...value, [key]: v });

    const act = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');
        setBusy(true);

        return work
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const save = () =>
        act(
            updateBox(box.admin_id, {
                name: value.name,
                memory: Number(value.memory),
                disk: Number(value.disk),
                cpu: Number(value.cpu),
                allocations: Number(value.allocations),
                backups: Number(value.backups),
                databases: Number(value.databases),
                node_id: value.node ? Number(value.node) : null,
                expires_at: value.expires ? new Date(`${value.expires}T23:59:59`).toISOString() : null,
                notes: value.notes || null,
            }),
            'The box was saved.'
        );

    const addDays = (days: number) => {
        const from = box.expires_at && new Date(box.expires_at) > new Date() ? new Date(box.expires_at) : new Date();
        from.setDate(from.getDate() + days);
        set('expires')(from.toISOString().slice(0, 10));
    };

    return (
        <AdminPage
            title={box.name}
            subtitle={`A box of ${box.owner?.username ?? 'nobody'}`}
            actions={
                <>
                    <a href={`/boxes/${box.id}`}>
                        <Button.Text>
                            <ExternalLinkIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            Open as the owner sees it
                        </Button.Text>
                    </a>
                    <Link to={'/admin/boxes'}>
                        <Button.Text>
                            <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            All boxes
                        </Button.Text>
                    </Link>
                </>
            }
        >
            <div className={'mb-4 flex flex-wrap items-center justify-between gap-3'}>
                <p className={'text-sm text-neutral-300'}>
                    {box.source === 'order' ? 'Bought in the store.' : 'Made by an administrator, without a payment.'}
                </p>
                <BoxStatus box={box} detail />
            </div>

            <div className={'mb-4'}>
                <BoxMeters limits={box.limits} used={box.used} />
            </div>

            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<ServerIcon className={'h-5 w-5'} />}
                    title={'Size and time'}
                >
                    <Stack>
                        <TextField
                            id={'name'}
                            label={'Name'}
                            value={value.name || ''}
                            disabled={!can}
                            onChange={set('name')}
                        />
                        <Columns>
                            <TextField
                                id={'memory'}
                                type={'number'}
                                label={'Memory (MB)'}
                                value={value.memory || ''}
                                disabled={!can}
                                onChange={set('memory')}
                            />
                            <TextField
                                id={'disk'}
                                type={'number'}
                                label={'Disk (MB)'}
                                value={value.disk || ''}
                                disabled={!can}
                                onChange={set('disk')}
                            />
                            <TextField
                                id={'cpu'}
                                type={'number'}
                                label={'CPU (%)'}
                                value={value.cpu || ''}
                                disabled={!can}
                                onChange={set('cpu')}
                            />
                            <TextField
                                id={'ports'}
                                type={'number'}
                                label={'Ports'}
                                value={value.allocations || ''}
                                disabled={!can}
                                onChange={set('allocations')}
                            />
                            <TextField
                                id={'backups'}
                                type={'number'}
                                label={'Backups'}
                                value={value.backups || ''}
                                disabled={!can}
                                onChange={set('backups')}
                            />
                            <TextField
                                id={'dbs'}
                                type={'number'}
                                label={'Databases'}
                                value={value.databases || ''}
                                disabled={!can}
                                onChange={set('databases')}
                            />
                        </Columns>
                        <p className={'text-xs text-neutral-400'}>
                            A box can not be made smaller than what its servers have been given.
                        </p>
                        <Columns>
                            <SelectField
                                id={'node'}
                                label={'Node'}
                                value={value.node || ''}
                                disabled={!can}
                                onChange={set('node')}
                                choices={[
                                    { value: '', label: 'Any node with room' },
                                    ...(list?.nodes || []).map((n) => ({ value: String(n.id), label: n.name })),
                                ]}
                            />
                            <div>
                                <TextField
                                    id={'expires'}
                                    label={'Runs out on'}
                                    value={value.expires || ''}
                                    disabled={!can}
                                    onChange={set('expires')}
                                    placeholder={'2027-01-31'}
                                    help={'Empty: it does not run out.'}
                                />
                                {can && (
                                    <div className={'mt-2 flex gap-2'}>
                                        {[30, 90, 365].map((days) => (
                                            <Button.Text
                                                key={days}
                                                size={Button.Sizes.Small}
                                                onClick={() => addDays(days)}
                                            >
                                                +{days} days
                                            </Button.Text>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Columns>
                        <TextField
                            id={'notes'}
                            label={'Notes'}
                            value={value.notes || ''}
                            disabled={!can}
                            onChange={set('notes')}
                            help={'Only administrators see this.'}
                        />
                    </Stack>
                    {can && (
                        <div className={'mt-6 flex justify-end'}>
                            <Button onClick={save} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </SectionCard>
                <div className={'space-y-4'}>
                    <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Owner'}>
                        <p className={'text-sm text-neutral-100'}>{box.owner?.username}</p>
                        <p className={'text-xs text-neutral-400'}>{box.owner?.email}</p>
                        {box.owner && (
                            <Link
                                to={`/admin/boxes?owner_id=${box.owner.id}`}
                                className={'mt-2 inline-block text-xs font-semibold text-primary-600 hover:underline'}
                            >
                                All boxes of this person
                            </Link>
                        )}
                    </SectionCard>
                    {can && (
                        <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Manage'}>
                            <Stack>
                                <Button
                                    disabled={busy}
                                    variant={Button.Variants.Secondary}
                                    onClick={() =>
                                        act(
                                            suspendBox(box.admin_id, box.status === 'active'),
                                            box.status === 'active'
                                                ? 'The box was suspended.'
                                                : 'The box is active again.'
                                        )
                                    }
                                >
                                    {box.status === 'active'
                                        ? 'Suspend the box and its servers'
                                        : 'Let the box run again'}
                                </Button>
                                {admin.can('boxes.delete') && (
                                    <Button.Danger
                                        variant={Button.Variants.Secondary}
                                        onClick={() => setDeleting(true)}
                                    >
                                        Delete the box
                                    </Button.Danger>
                                )}
                            </Stack>
                        </SectionCard>
                    )}
                </div>
            </div>

            <h2 className={'mb-3 mt-6 text-lg font-semibold text-neutral-50'}>Servers in this box</h2>
            {box.servers_list.length === 0 ? (
                <Notice tone={'blue'}>There are no servers in this box yet.</Notice>
            ) : (
                <div className={'space-y-2'}>
                    {box.servers_list.map((server) => (
                        <div
                            key={server.uuid}
                            className={
                                'flex flex-wrap items-center gap-4 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-sm'
                            }
                        >
                            <div className={'min-w-[10rem] flex-1'}>
                                <p className={'text-sm font-semibold text-neutral-50'}>{server.name}</p>
                                <p className={'text-xs text-neutral-400'}>
                                    {server.node}
                                    {server.status ? ` · ${server.status}` : ''}
                                </p>
                            </div>
                            <p className={'text-xs text-neutral-300'}>
                                {SHARE_KEYS.map((key) => shareText(key, server.limits[key])).join(' · ')}
                            </p>
                            <Link
                                to={`/admin/servers/view/${server.admin_id}`}
                                className={'text-xs font-semibold text-primary-600 hover:underline'}
                            >
                                Admin page
                            </Link>
                            <a
                                href={`/server/${server.id}`}
                                className={'text-xs font-semibold text-primary-600 hover:underline'}
                            >
                                Open
                            </a>
                        </div>
                    ))}
                </div>
            )}

            <Dialog
                open={deleting}
                onClose={() => setDeleting(false)}
                title={`Delete ${box.name}?`}
                description={'This can not be undone.'}
            >
                <SelectField
                    id={'servers'}
                    label={'The servers in it'}
                    value={servers}
                    onChange={(v) => setServers(v as typeof servers)}
                    choices={[
                        { value: 'refuse', label: 'Do not delete a box that has servers' },
                        { value: 'detach', label: 'Keep the servers, as servers of their own' },
                        { value: 'delete', label: 'Delete the servers with it' },
                    ]}
                />
                <Dialog.Footer>
                    <Button.Text onClick={() => setDeleting(false)}>Cancel</Button.Text>
                    <Button.Danger
                        disabled={busy}
                        onClick={() => {
                            clearFlashes('admin');
                            setBusy(true);
                            deleteBox(box.admin_id, servers)
                                .then(() => history.push('/admin/boxes'))
                                .catch((e) => {
                                    clearAndAddHttpError({ key: 'admin', error: e });
                                    setDeleting(false);
                                })
                                .then(() => setBusy(false));
                        }}
                    >
                        Delete
                    </Button.Danger>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
