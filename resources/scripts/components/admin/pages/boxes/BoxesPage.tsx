import React, { useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { CubeIcon, PlusIcon, SearchIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Meter, Pill, Row } from '@/components/admin/AdminTable';
import { Columns, SelectField, TextField } from '@/components/admin/forms';
import OwnerSelect from '@/components/admin/pages/servers/OwnerSelect';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { createBox, useAdminBoxes } from '@/api/admin/boxes';
import { percentOf, shareText } from '@/lib/store';

const STATUS: Record<string, [string, 'green' | 'yellow' | 'red']> = {
    active: ['Active', 'green'],
    suspended: ['Suspended', 'yellow'],
    expired: ['Expired', 'red'],
};

const START = {
    name: '',
    memory: '4096',
    disk: '10240',
    cpu: '200',
    allocations: '3',
    backups: '3',
    databases: '1',
    node: '',
    days: '',
};

/** Admin > Boxes: every box, and making one for a person without a payment. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const ownerId = new URLSearchParams(useLocation().search).get('owner_id');
    const { data, error, mutate } = useAdminBoxes(search, ownerId, page);
    const admin = useAdmin();
    const history = useHistory();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState(START);
    const [owner, setOwner] = useState('');
    const [busy, setBusy] = useState(false);

    const set = (key: keyof typeof START) => (value: string) => setForm({ ...form, [key]: value });

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createBox({
            user_id: Number(owner),
            name: form.name,
            node_id: form.node ? Number(form.node) : null,
            memory: Number(form.memory),
            disk: Number(form.disk),
            cpu: Number(form.cpu),
            allocations: Number(form.allocations),
            backups: Number(form.backups),
            databases: Number(form.databases),
            expires_at: form.days ? new Date(Date.now() + Number(form.days) * 86400000).toISOString() : null,
        })
            .then((box) => {
                mutate();
                history.push(`/admin/boxes/view/${box.admin_id}`);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={'Boxes'}
            subtitle={'Resources that people make their own servers in. A box does not need the store.'}
        >
            <ListHeader
                icon={<CubeIcon className={'h-6 w-6'} />}
                title={ownerId ? 'Boxes of one person' : 'Box list'}
                count={data ? String(data.pagination.total) : undefined}
            >
                <div className={'relative'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400'
                        }
                    />
                    <Input
                        type={'search'}
                        value={search}
                        placeholder={'Search boxes'}
                        aria-label={'Search boxes'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                {ownerId && (
                    <Link to={'/admin/boxes'}>
                        <Button.Text>Show all boxes</Button.Text>
                    </Link>
                )}
                {admin.can('boxes.create') && (
                    <Button
                        onClick={() => {
                            setForm(START);
                            setOwner(ownerId || '');
                            setCreating(true);
                        }}
                    >
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create a box
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The boxes could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.boxes.length === 0 ? (
                    <Empty>{search ? 'No box matches that.' : 'There are no boxes yet.'}</Empty>
                ) : (
                    <AdminTable heads={['Box', 'Owner', 'Servers', 'Memory', 'Disk', 'Source', 'Status']}>
                        {data.boxes.map((box) => (
                            <Row key={box.id} onClick={() => history.push(`/admin/boxes/view/${box.admin_id}`)}>
                                <Cell className={'font-medium text-neutral-50'}>{box.name}</Cell>
                                <Cell>{box.owner?.username}</Cell>
                                <Cell>{box.servers}</Cell>
                                <Cell className={'min-w-[8rem]'}>
                                    <p className={'mb-1 text-xs text-neutral-300'}>
                                        {shareText('memory', box.used.memory)} /{' '}
                                        {shareText('memory', box.limits.memory)}
                                    </p>
                                    <Meter percent={percentOf(box.used.memory, box.limits.memory)} level={'ok'} />
                                </Cell>
                                <Cell className={'min-w-[8rem]'}>
                                    <p className={'mb-1 text-xs text-neutral-300'}>
                                        {shareText('disk', box.used.disk)} / {shareText('disk', box.limits.disk)}
                                    </p>
                                    <Meter percent={percentOf(box.used.disk, box.limits.disk)} level={'ok'} />
                                </Cell>
                                <Cell>{box.source === 'order' ? 'Bought' : 'Given'}</Cell>
                                <Cell>
                                    <Pill tone={STATUS[box.status][1]}>{STATUS[box.status][0]}</Pill>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
                {data && data.pagination.totalPages > 1 && (
                    <PaginationFooter pagination={data.pagination} onPageSelect={setPage} />
                )}
            </div>

            <Dialog
                open={creating}
                onClose={() => setCreating(false)}
                title={'Create a box'}
                description={
                    'The person gets it without paying. They make servers inside it and choose how much of it each one gets.'
                }
            >
                <div className={'space-y-4'}>
                    <OwnerSelect id={'box-owner'} label={'Owner'} value={owner} onChange={setOwner} />
                    <TextField id={'box-name'} label={'Name'} value={form.name} onChange={set('name')} />
                    <Columns>
                        <TextField
                            id={'box-memory'}
                            type={'number'}
                            label={'Memory (MB)'}
                            value={form.memory}
                            onChange={set('memory')}
                        />
                        <TextField
                            id={'box-disk'}
                            type={'number'}
                            label={'Disk (MB)'}
                            value={form.disk}
                            onChange={set('disk')}
                        />
                        <TextField
                            id={'box-cpu'}
                            type={'number'}
                            label={'CPU (%)'}
                            value={form.cpu}
                            onChange={set('cpu')}
                            help={'100 is one core.'}
                        />
                        <TextField
                            id={'box-ports'}
                            type={'number'}
                            label={'Ports'}
                            value={form.allocations}
                            onChange={set('allocations')}
                        />
                        <TextField
                            id={'box-backups'}
                            type={'number'}
                            label={'Backups'}
                            value={form.backups}
                            onChange={set('backups')}
                        />
                        <TextField
                            id={'box-dbs'}
                            type={'number'}
                            label={'Databases'}
                            value={form.databases}
                            onChange={set('databases')}
                        />
                    </Columns>
                    <Columns>
                        <SelectField
                            id={'box-node'}
                            label={'Node'}
                            value={form.node}
                            onChange={set('node')}
                            choices={[
                                { value: '', label: 'Any node with room' },
                                ...(data?.nodes || []).map((n) => ({ value: String(n.id), label: n.name })),
                            ]}
                        />
                        <TextField
                            id={'box-days'}
                            type={'number'}
                            label={'Ends after (days)'}
                            value={form.days}
                            onChange={set('days')}
                            help={'Empty: it does not end.'}
                        />
                    </Columns>
                </div>
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button disabled={busy || !owner || !form.name.trim()} onClick={create}>
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
