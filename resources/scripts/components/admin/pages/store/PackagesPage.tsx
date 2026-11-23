import React, { useState } from 'react';
import { PlusIcon, ShoppingBagIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { AreaField, Columns, SelectField, TextField, ToggleField } from '@/components/admin/forms';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { AdminPackage, deletePackage, savePackage, usePackages } from '@/api/admin/boxes';
import { formatMoney, fromMinor, periodLabel, shareText, toMinor } from '@/lib/store';

interface Form {
    name: string;
    description: string;
    kind: 'server' | 'box';
    active: boolean;
    sort: string;
    // In the major unit (12.50), the panel keeps the smallest one.
    price: string;
    period: string;
    memory: string;
    disk: string;
    cpu: string;
    allocations: string;
    backups: string;
    databases: string;
    node: string;
    egg: string;
}

const EMPTY: Form = {
    name: '',
    description: '',
    kind: 'box',
    active: true,
    sort: '0',
    price: '5.00',
    period: '30',
    memory: '4096',
    disk: '10240',
    cpu: '200',
    allocations: '3',
    backups: '3',
    databases: '1',
    node: '',
    egg: '',
};

/** Admin > Packages: what the store sells, and how much resource each package gives. */
export default () => {
    const { data, error, mutate } = usePackages();
    const currency = data?.currency || 'USD';
    const admin = useAdmin();
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
    const [removing, setRemoving] = useState<AdminPackage | null>(null);
    const [busy, setBusy] = useState(false);

    const open = (pkg?: AdminPackage) =>
        setEditing(
            pkg
                ? {
                      id: pkg.id,
                      form: {
                          name: pkg.name,
                          description: pkg.description || '',
                          kind: pkg.kind,
                          active: pkg.active,
                          sort: String(pkg.sort),
                          price: fromMinor(pkg.price, currency),
                          period: pkg.period_days ? String(pkg.period_days) : '',
                          memory: String(pkg.memory),
                          disk: String(pkg.disk),
                          cpu: String(pkg.cpu),
                          allocations: String(pkg.allocations),
                          backups: String(pkg.backups),
                          databases: String(pkg.databases),
                          node: pkg.node_id ? String(pkg.node_id) : '',
                          egg: pkg.egg_id ? String(pkg.egg_id) : '',
                      },
                  }
                : { id: null, form: EMPTY }
        );

    const set = (key: keyof Form) => (value: string | boolean) =>
        editing && setEditing({ ...editing, form: { ...editing.form, [key]: value } });

    const save = () => {
        if (!editing) return;
        const f = editing.form;
        clearFlashes('admin');
        setBusy(true);
        savePackage(editing.id, {
            name: f.name,
            description: f.description || null,
            kind: f.kind,
            active: f.active,
            sort: Number(f.sort) || 0,
            price: toMinor(f.price, currency),
            period_days: f.period ? Number(f.period) : null,
            memory: Number(f.memory),
            disk: Number(f.disk),
            cpu: Number(f.cpu),
            allocations: Number(f.allocations),
            backups: Number(f.backups),
            databases: Number(f.databases),
            node_id: f.node ? Number(f.node) : null,
            egg_id: f.kind === 'server' && f.egg ? Number(f.egg) : null,
        })
            .then(() => {
                setEditing(null);

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={'Packages'}
            subtitle={
                'What the store sells: servers that are made when they are bought, and boxes people make servers in.'
            }
        >
            <ListHeader
                icon={<ShoppingBagIcon className={'h-6 w-6'} />}
                title={'Package list'}
                count={data ? String(data.packages.length) : undefined}
            >
                {admin.can('packages.create') && (
                    <Button onClick={() => open()}>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create a package
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The packages could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.packages.length === 0 ? (
                    <Empty>No packages yet. The store shows nothing until there is one.</Empty>
                ) : (
                    <AdminTable heads={['Package', 'Type', 'Price', 'Memory', 'Disk', 'CPU', 'Sold', 'For sale']}>
                        {data.packages.map((pkg) => (
                            <Row key={pkg.id} onClick={admin.can('packages.update') ? () => open(pkg) : undefined}>
                                <Cell className={'font-medium text-neutral-50'}>{pkg.name}</Cell>
                                <Cell>{pkg.kind === 'box' ? 'Box' : 'Server'}</Cell>
                                <Cell>
                                    {formatMoney(pkg.price, currency)}
                                    <span className={'text-xs text-neutral-400'}>
                                        {' '}
                                        / {periodLabel(pkg.period_days)}
                                    </span>
                                </Cell>
                                <Cell>{shareText('memory', pkg.memory)}</Cell>
                                <Cell>{shareText('disk', pkg.disk)}</Cell>
                                <Cell>{pkg.cpu}%</Cell>
                                <Cell>{pkg.sold}</Cell>
                                <Cell>
                                    <Pill tone={pkg.active ? 'green' : 'yellow'}>{pkg.active ? 'Yes' : 'Hidden'}</Pill>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>

            <Dialog
                open={!!editing}
                onClose={() => setEditing(null)}
                title={editing?.id ? 'Change the package' : 'Create a package'}
            >
                {editing && (
                    <div className={'max-h-[70vh] space-y-4 overflow-y-auto pr-1'}>
                        <Columns>
                            <TextField id={'p-name'} label={'Name'} value={editing.form.name} onChange={set('name')} />
                            <SelectField
                                id={'p-kind'}
                                label={'What it is'}
                                value={editing.form.kind}
                                onChange={set('kind')}
                                choices={[
                                    { value: 'box', label: 'A box (the buyer makes servers in it)' },
                                    { value: 'server', label: 'A server (made when it is bought)' },
                                ]}
                            />
                        </Columns>
                        <AreaField
                            id={'p-description'}
                            label={'Description'}
                            value={editing.form.description}
                            rows={2}
                            onChange={set('description')}
                        />
                        <Columns>
                            <TextField
                                id={'p-price'}
                                label={`Price (${currency})`}
                                value={editing.form.price}
                                onChange={set('price')}
                            />
                            <TextField
                                id={'p-period'}
                                type={'number'}
                                label={'Lasts (days)'}
                                value={editing.form.period}
                                onChange={set('period')}
                                help={'30 is a month. Empty: paid once, it does not run out.'}
                            />
                        </Columns>
                        <Columns>
                            <TextField
                                id={'p-memory'}
                                type={'number'}
                                label={'Memory (MB)'}
                                value={editing.form.memory}
                                onChange={set('memory')}
                            />
                            <TextField
                                id={'p-disk'}
                                type={'number'}
                                label={'Disk (MB)'}
                                value={editing.form.disk}
                                onChange={set('disk')}
                            />
                            <TextField
                                id={'p-cpu'}
                                type={'number'}
                                label={'CPU (%)'}
                                value={editing.form.cpu}
                                onChange={set('cpu')}
                                help={'100 is one core.'}
                            />
                            <TextField
                                id={'p-ports'}
                                type={'number'}
                                label={'Ports'}
                                value={editing.form.allocations}
                                onChange={set('allocations')}
                            />
                            <TextField
                                id={'p-backups'}
                                type={'number'}
                                label={'Backups'}
                                value={editing.form.backups}
                                onChange={set('backups')}
                            />
                            <TextField
                                id={'p-dbs'}
                                type={'number'}
                                label={'Databases'}
                                value={editing.form.databases}
                                onChange={set('databases')}
                            />
                        </Columns>
                        <Columns>
                            <SelectField
                                id={'p-node'}
                                label={'Node'}
                                value={editing.form.node}
                                onChange={set('node')}
                                choices={[
                                    { value: '', label: 'Any node with room' },
                                    ...(data?.nodes || []).map((n) => ({ value: String(n.id), label: n.name })),
                                ]}
                            />
                            {editing.form.kind === 'server' && (
                                <SelectField
                                    id={'p-egg'}
                                    label={'Starts as'}
                                    value={editing.form.egg}
                                    onChange={set('egg')}
                                    choices={[
                                        { value: '', label: 'The egg new servers get' },
                                        ...(data?.eggs || []).map((e) => ({ value: String(e.id), label: e.name })),
                                    ]}
                                    help={'The buyer installs Minecraft and the rest from the Versions tab.'}
                                />
                            )}
                        </Columns>
                        <Columns>
                            <TextField
                                id={'p-sort'}
                                type={'number'}
                                label={'Order'}
                                value={editing.form.sort}
                                onChange={set('sort')}
                                help={'Lower comes first.'}
                            />
                            <ToggleField
                                label={'For sale'}
                                checked={editing.form.active}
                                onChange={set('active')}
                                help={'A hidden package can not be bought, what was bought stays.'}
                            />
                        </Columns>
                    </div>
                )}
                <Dialog.Footer>
                    {editing?.id && admin.can('packages.delete') && (
                        <Button.Danger
                            variant={Button.Variants.Secondary}
                            onClick={() => {
                                setRemoving(data?.packages.find((p) => p.id === editing.id) || null);
                                setEditing(null);
                            }}
                        >
                            Delete
                        </Button.Danger>
                    )}
                    <Button.Text onClick={() => setEditing(null)}>Cancel</Button.Text>
                    <Button disabled={busy || !editing?.form.name.trim()} onClick={save}>
                        Save
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog.Confirm
                open={!!removing}
                title={`Delete ${removing?.name}?`}
                confirm={'Delete'}
                onClose={() => setRemoving(null)}
                onConfirmed={() => {
                    if (!removing) return;
                    deletePackage(removing.id)
                        .then(() => mutate())
                        .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
                    setRemoving(null);
                }}
            >
                What people bought with it stays as it is. It is no longer for sale.
            </Dialog.Confirm>
        </AdminPage>
    );
};
