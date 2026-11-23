import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ChipIcon, CogIcon, CurrencyDollarIcon, TrashIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AreaField, Columns, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { deletePackage, savePackage, usePackage, usePackages } from '@/api/admin/boxes';
import { fromMinor, toMinor } from '@/lib/store';

interface Form {
    name: string;
    description: string;
    kind: 'server' | 'box';
    active: boolean;
    sort: string;
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

/** Admin > Packages > Create new, and one package: what it is, what it costs and how much it gives. */
export default () => {
    const params = useParams<{ id?: string }>();
    const id = params.id ? Number(params.id) : null;
    const { data: list } = usePackages();
    const { data: existing, error } = usePackage(id);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<Form | null>(id === null ? EMPTY : null);
    const [busy, setBusy] = useState(false);
    const [asking, setAsking] = useState(false);
    const currency = list?.currency || 'USD';
    const can = admin.can(id === null ? 'packages.create' : 'packages.update');

    useEffect(() => {
        if (!existing || !list) return;
        setForm({
            name: existing.name,
            description: existing.description || '',
            kind: existing.kind,
            active: existing.active,
            sort: String(existing.sort),
            price: fromMinor(existing.price, list.currency),
            period: existing.period_days ? String(existing.period_days) : '',
            memory: String(existing.memory),
            disk: String(existing.disk),
            cpu: String(existing.cpu),
            allocations: String(existing.allocations),
            backups: String(existing.backups),
            databases: String(existing.databases),
            node: existing.node_id ? String(existing.node_id) : '',
            egg: existing.egg_id ? String(existing.egg_id) : '',
        });
    }, [existing, list]);

    if (!form || !list) return error ? null : <Spinner size={'large'} centered />;

    const set = (key: keyof Form) => (value: string | boolean) => setForm({ ...form, [key]: value });

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        savePackage(id, {
            name: form.name,
            description: form.description || null,
            kind: form.kind,
            active: form.active,
            sort: Number(form.sort) || 0,
            price: toMinor(form.price, currency),
            period_days: form.period ? Number(form.period) : null,
            memory: Number(form.memory),
            disk: Number(form.disk),
            cpu: Number(form.cpu),
            allocations: Number(form.allocations),
            backups: Number(form.backups),
            databases: Number(form.databases),
            node_id: form.node ? Number(form.node) : null,
            egg_id: form.kind === 'server' && form.egg ? Number(form.egg) : null,
        })
            .then((saved) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: id === null ? 'The package was created.' : 'The package was updated.',
                });
                if (id === null) history.push(`/admin/packages/view/${saved.id}`);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={id === null ? 'Create package' : form.name || 'Package'}
            subtitle={id === null ? 'Add something to the store.' : 'What people buy, and what it gives them.'}
            actions={
                <AdminLink to={'/admin/packages'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Packages
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'space-y-4'}>
                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Core details'}>
                    <Columns>
                        <Stack>
                            <TextField
                                id={'p-name'}
                                label={'Package name'}
                                value={form.name}
                                disabled={!can}
                                onChange={set('name')}
                                help={'What people see in the store.'}
                            />
                            <SelectField
                                id={'p-kind'}
                                label={'What it is'}
                                value={form.kind}
                                disabled={!can}
                                onChange={set('kind')}
                                choices={[
                                    { value: 'box', label: 'A box (the buyer makes servers in it)' },
                                    { value: 'server', label: 'A server (made when it is bought)' },
                                ]}
                                help={
                                    'A box is shared between the servers the buyer makes. A server is made for them right away.'
                                }
                            />
                        </Stack>
                        <Stack>
                            <AreaField
                                id={'p-description'}
                                label={'Description'}
                                value={form.description}
                                rows={4}
                                disabled={!can}
                                onChange={set('description')}
                                help={'Shown on the card in the store.'}
                            />
                        </Stack>
                    </Columns>
                </SectionCard>

                <SectionCard icon={<CurrencyDollarIcon className={'h-5 w-5'} />} title={'Price and time'}>
                    <Columns className={'sm:grid-cols-3'}>
                        <TextField
                            id={'p-price'}
                            label={`Price (${currency})`}
                            value={form.price}
                            disabled={!can}
                            onChange={set('price')}
                            help={`For one payment, in ${currency}.`}
                        />
                        <TextField
                            id={'p-period'}
                            type={'number'}
                            label={'One payment lasts (days)'}
                            value={form.period}
                            disabled={!can}
                            onChange={set('period')}
                            help={'30 is a month. Empty: it is paid once and never runs out.'}
                        />
                        <TextField
                            id={'p-sort'}
                            type={'number'}
                            label={'Order in the store'}
                            value={form.sort}
                            disabled={!can}
                            onChange={set('sort')}
                            help={'Lower comes first.'}
                        />
                    </Columns>
                    <ToggleField
                        className={'mt-4'}
                        label={'For sale'}
                        checked={form.active}
                        disabled={!can}
                        onChange={set('active')}
                        help={
                            'A package that is not for sale is hidden from the store. What was bought stays as it is and can still be renewed.'
                        }
                    />
                </SectionCard>

                <SectionCard
                    icon={<ChipIcon className={'h-5 w-5'} />}
                    title={'Resources'}
                    description={form.kind === 'box' ? 'What the servers in the box share.' : 'What the server gets.'}
                >
                    <Columns className={'sm:grid-cols-3'}>
                        <TextField
                            id={'p-memory'}
                            type={'number'}
                            label={'Memory (MiB)'}
                            value={form.memory}
                            disabled={!can}
                            onChange={set('memory')}
                            help={'1024 MiB is 1 GiB.'}
                        />
                        <TextField
                            id={'p-disk'}
                            type={'number'}
                            label={'Disk space (MiB)'}
                            value={form.disk}
                            disabled={!can}
                            onChange={set('disk')}
                            help={'10240 MiB is 10 GiB.'}
                        />
                        <TextField
                            id={'p-cpu'}
                            type={'number'}
                            label={'CPU limit (%)'}
                            value={form.cpu}
                            disabled={!can}
                            onChange={set('cpu')}
                            help={'100 is one core.'}
                        />
                        <TextField
                            id={'p-ports'}
                            type={'number'}
                            label={'Ports (allocations)'}
                            value={form.allocations}
                            disabled={!can}
                            onChange={set('allocations')}
                        />
                        <TextField
                            id={'p-backups'}
                            type={'number'}
                            label={'Backups'}
                            value={form.backups}
                            disabled={!can}
                            onChange={set('backups')}
                        />
                        <TextField
                            id={'p-dbs'}
                            type={'number'}
                            label={'Databases'}
                            value={form.databases}
                            disabled={!can}
                            onChange={set('databases')}
                        />
                    </Columns>
                </SectionCard>

                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Where it runs'}>
                    <Columns>
                        <SelectField
                            id={'p-node'}
                            label={'Node'}
                            value={form.node}
                            disabled={!can}
                            onChange={set('node')}
                            choices={[
                                { value: '', label: 'Any node with room' },
                                ...list.nodes.map((n) => ({ value: String(n.id), label: n.name })),
                            ]}
                            help={
                                'Fails when the node has no free port, the order then says why and can be set up again.'
                            }
                        />
                        {form.kind === 'server' && (
                            <SelectField
                                id={'p-egg'}
                                label={'Starts as'}
                                value={form.egg}
                                disabled={!can}
                                onChange={set('egg')}
                                choices={[
                                    { value: '', label: 'The egg new servers get' },
                                    ...list.eggs.map((e) => ({ value: String(e.id), label: e.name })),
                                ]}
                                help={'The buyer installs Minecraft and the rest from the Versions tab.'}
                            />
                        )}
                    </Columns>
                </SectionCard>

                <div className={'flex flex-wrap items-center justify-between gap-3'}>
                    <div>
                        {id !== null && admin.can('packages.delete') && (
                            <Button.Danger variant={Button.Variants.Secondary} onClick={() => setAsking(true)}>
                                <TrashIcon className={'-ml-1 mr-2 h-4 w-4'} />
                                Delete package
                            </Button.Danger>
                        )}
                    </div>
                    {can && (
                        <Button onClick={save} disabled={busy || !form.name.trim()}>
                            {id === null ? 'Create package' : 'Save changes'}
                        </Button>
                    )}
                </div>
            </div>

            <Dialog.Confirm
                open={asking}
                title={`Delete ${form.name}?`}
                confirm={'Delete package'}
                onClose={() => setAsking(false)}
                onConfirmed={() => {
                    setAsking(false);
                    if (id === null) return;
                    deletePackage(id)
                        .then(() => {
                            addFlash({ key: 'admin', type: 'success', message: 'The package was deleted.' });
                            history.push('/admin/packages');
                        })
                        .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
                }}
            >
                What people bought with it stays as it is. It is no longer for sale.
            </Dialog.Confirm>
        </AdminPage>
    );
};
