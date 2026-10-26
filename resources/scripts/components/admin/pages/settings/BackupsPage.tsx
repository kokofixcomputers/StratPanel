import React, { useState } from 'react';
import {
    ArchiveIcon,
    CloudIcon,
    ClockIcon,
    FolderIcon,
    InformationCircleIcon,
    PencilIcon,
    PlusIcon,
    RefreshIcon,
    ServerIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Pill } from '@/components/admin/AdminTable';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { bytesToString } from '@/lib/formatters';
import {
    BackupDestination,
    BackupDestinations,
    BackupDestinationType,
    deleteSetting,
    postSetting,
    saveSetting,
    useSetting,
} from '@/api/admin/settings';

interface Form {
    id: number | null;
    name: string;
    type: BackupDestinationType;
    enabled: boolean;
    auto_copy: boolean;
    delete_local: boolean;
    keep_last: string;
    keep_days: string;
    max_gb: string;
    config: Record<string, string | boolean>;
    // The secrets that are saved already, left empty they stay as they are.
    has: Record<string, boolean>;
}

const TYPES: Record<BackupDestinationType, string> = {
    s3: 'S3 (Amazon, Backblaze, Wasabi, MinIO, R2...)',
    webdav: 'WebDAV (Nextcloud, ownCloud, a NAS...)',
    folder: 'A folder on the machine of the panel',
};

const blank = (type: BackupDestinationType = 's3'): Form => ({
    id: null,
    name: '',
    type,
    enabled: true,
    auto_copy: true,
    delete_local: false,
    keep_last: '',
    keep_days: '',
    max_gb: '',
    config: {},
    has: {},
});

const fromDestination = (d: BackupDestination): Form => ({
    id: d.id,
    name: d.name,
    type: d.type,
    enabled: d.enabled,
    auto_copy: d.auto_copy,
    delete_local: d.delete_local,
    keep_last: d.keep_last ? String(d.keep_last) : '',
    keep_days: d.keep_days ? String(d.keep_days) : '',
    max_gb: d.max_gb ? String(d.max_gb) : '',
    config: Object.fromEntries(
        Object.entries(d.config).filter(([k, v]) => !k.startsWith('has_') && v !== undefined)
    ) as Record<string, string | boolean>,
    has: { secret: !!d.config.has_secret, password: !!d.config.has_password },
});

const body = (f: Form) => ({
    name: f.name,
    type: f.type,
    enabled: f.enabled,
    auto_copy: f.auto_copy,
    delete_local: f.delete_local,
    keep_last: f.keep_last === '' ? null : Number(f.keep_last),
    keep_days: f.keep_days === '' ? null : Number(f.keep_days),
    max_gb: f.max_gb === '' ? null : Number(f.max_gb),
    config: f.config,
});

const TypeIcon = ({ type }: { type: BackupDestinationType }) =>
    type === 'folder' ? (
        <FolderIcon className={'h-5 w-5'} />
    ) : type === 's3' ? (
        <CloudIcon className={'h-5 w-5'} />
    ) : (
        <ServerIcon className={'h-5 w-5'} />
    );

const kept = (d: BackupDestination): string => {
    const parts = [
        d.keep_last ? `the newest ${d.keep_last}` : '',
        d.keep_days ? `up to ${d.keep_days} days` : '',
        d.max_gb ? `${d.max_gb} GB` : '',
    ].filter(Boolean);

    return parts.length ? `${parts.join(', ')} per server` : 'everything, nothing is deleted';
};

/** Admin > Settings > Backups: where copies of backups are kept outside the node, how much of it, and how they come back. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.backups.update');
    const { data, mutate } = useSetting<BackupDestinations>('backups', { refreshInterval: 5000 });
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<Form | null>(null);
    const [busy, setBusy] = useState(false);
    const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
    const [removing, setRemoving] = useState<BackupDestination | null>(null);

    const set = (changes: Partial<Form>) => setForm((f) => (f ? { ...f, ...changes } : f));
    const setConfig = (key: string, value: string | boolean) =>
        setForm((f) => (f ? { ...f, config: { ...f.config, [key]: value } } : f));
    const text = (key: string) => (form && typeof form.config[key] === 'string' ? (form.config[key] as string) : '');

    const run = (work: Promise<unknown>, done?: (result: any) => string | void) => {
        clearFlashes('admin');
        setBusy(true);

        return work
            .then((result) => {
                const message = done?.(result);
                if (message) addFlash({ key: 'admin', type: 'success', message });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const save = () => {
        if (!form) return;
        run(
            form.id === null
                ? saveSetting('backups', body(form), 'post')
                : saveSetting(`backups/${form.id}`, body(form)),
            () => {
                setForm(null);
                setTested(null);

                return 'The destination was saved.';
            }
        );
    };

    const test = () => {
        if (!form) return;
        clearFlashes('admin');
        setBusy(true);
        setTested(null);
        postSetting<{ ok: boolean; message: string }>('backups/test', {
            type: form.type,
            id: form.id,
            config: form.config,
        })
            .then(setTested)
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SettingsFrame
            title={'Backups'}
            subtitle={'Keep copies of backups somewhere other than the node, and decide how much of it is kept.'}
        >
            <Dialog.Confirm
                open={!!removing}
                title={`Delete ${removing?.name ?? ''}`}
                confirm={'Delete it'}
                onConfirmed={() => {
                    const target = removing;
                    setRemoving(null);
                    if (target)
                        run(
                            deleteSetting(`backups/${target.id}`),
                            () => 'The destination and the copies in it were deleted.'
                        );
                }}
                onClose={() => setRemoving(null)}
            >
                The copies of backups kept in {removing?.name} are deleted with it. The backups on the nodes stay.
            </Dialog.Confirm>
            {!data ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        {data.destinations.length === 0 && !form && (
                            <SectionCard icon={<ArchiveIcon className={'h-5 w-5'} />} title={'Only on the nodes'}>
                                <p className={'text-sm text-neutral-300'}>
                                    Backups are kept on the node of the server, and nowhere else. Add a destination to
                                    copy every backup to S3, WebDAV or another folder too.
                                </p>
                            </SectionCard>
                        )}
                        {data.destinations.map((d) => (
                            <SectionCard key={d.id} icon={<TypeIcon type={d.type} />} title={d.name}>
                                <div className={'mb-3 flex flex-wrap items-center gap-2'}>
                                    <Pill tone={d.enabled ? 'green' : 'neutral'}>{d.enabled ? 'On' : 'Off'}</Pill>
                                    <Pill>{d.type === 's3' ? 'S3' : d.type === 'webdav' ? 'WebDAV' : 'Folder'}</Pill>
                                    {d.auto_copy && <Pill tone={'primary'}>Every backup</Pill>}
                                    {d.delete_local && <Pill tone={'yellow'}>Removed from the node after</Pill>}
                                    {d.stats.working > 0 && <Pill tone={'yellow'}>{d.stats.working} copying</Pill>}
                                    {d.stats.failed > 0 && <Pill tone={'red'}>{d.stats.failed} failed</Pill>}
                                </div>
                                <p className={'text-sm text-neutral-200'}>
                                    {d.stats.stored} {d.stats.stored === 1 ? 'copy' : 'copies'} ·{' '}
                                    {bytesToString(d.stats.bytes)}
                                </p>
                                <p className={'mt-1 flex items-center text-xs text-neutral-400'}>
                                    <ClockIcon className={'mr-1 h-4 w-4'} /> Keeps {kept(d)}
                                </p>
                                {can && (
                                    <div className={'mt-4 flex flex-wrap gap-2'}>
                                        <Button
                                            size={Button.Sizes.Small}
                                            variant={Button.Variants.Secondary}
                                            onClick={() => {
                                                setForm(fromDestination(d));
                                                setTested(null);
                                            }}
                                        >
                                            <PencilIcon className={'mr-1 h-4 w-4'} /> Edit
                                        </Button>
                                        <Button
                                            size={Button.Sizes.Small}
                                            variant={Button.Variants.Secondary}
                                            disabled={busy || !d.enabled || data.backups === 0}
                                            onClick={() =>
                                                run(postSetting<{ queued: number }>(`backups/${d.id}/backfill`), (r) =>
                                                    r.queued
                                                        ? `${r.queued} backups are being copied to ${d.name}.`
                                                        : 'Every backup has a copy there already.'
                                                )
                                            }
                                        >
                                            <ArchiveIcon className={'mr-1 h-4 w-4'} /> Copy the existing backups
                                        </Button>
                                        {d.stats.failed > 0 && (
                                            <Button
                                                size={Button.Sizes.Small}
                                                variant={Button.Variants.Secondary}
                                                disabled={busy}
                                                onClick={() =>
                                                    run(
                                                        postSetting<{ queued: number }>(`backups/${d.id}/retry`),
                                                        (r) => `${r.queued} copies are tried again.`
                                                    )
                                                }
                                            >
                                                <RefreshIcon className={'mr-1 h-4 w-4'} /> Try the failed ones again
                                            </Button>
                                        )}
                                        <Button
                                            size={Button.Sizes.Small}
                                            variant={Button.Variants.Secondary}
                                            disabled={busy}
                                            onClick={() =>
                                                run(
                                                    postSetting<{ deleted: number }>(`backups/${d.id}/prune`),
                                                    (r) => `${r.deleted} copies went over the limits and were deleted.`
                                                )
                                            }
                                        >
                                            <ClockIcon className={'mr-1 h-4 w-4'} /> Apply the limits now
                                        </Button>
                                        <Button.Danger
                                            size={Button.Sizes.Small}
                                            variant={Button.Variants.Secondary}
                                            onClick={() => setRemoving(d)}
                                        >
                                            <TrashIcon className={'mr-1 h-4 w-4'} /> Delete
                                        </Button.Danger>
                                    </div>
                                )}
                            </SectionCard>
                        ))}
                        {can && !form && (
                            <Button onClick={() => setForm(blank())}>
                                <PlusIcon className={'mr-1 h-4 w-4'} /> Add a destination
                            </Button>
                        )}
                        {form && (
                            <SectionCard
                                icon={<TypeIcon type={form.type} />}
                                title={form.id === null ? 'Add a destination' : `Edit ${form.name}`}
                            >
                                <Stack>
                                    <Columns>
                                        <TextField
                                            id={'bd-name'}
                                            label={'Name'}
                                            value={form.name}
                                            maxLength={191}
                                            placeholder={'Offsite'}
                                            onChange={(name) => set({ name })}
                                        />
                                        <SelectField
                                            id={'bd-type'}
                                            label={'Where'}
                                            value={form.type}
                                            disabled={form.id !== null}
                                            choices={data.types.map((t) => ({ value: t, label: TYPES[t] }))}
                                            onChange={(type) =>
                                                set({ type: type as BackupDestinationType, config: {}, has: {} })
                                            }
                                        />
                                    </Columns>
                                    {form.type === 's3' && (
                                        <>
                                            <Columns>
                                                <TextField
                                                    id={'bd-bucket'}
                                                    label={'Bucket'}
                                                    value={text('bucket')}
                                                    onChange={(v) => setConfig('bucket', v)}
                                                />
                                                <TextField
                                                    id={'bd-region'}
                                                    label={'Region'}
                                                    value={text('region')}
                                                    placeholder={'us-east-1'}
                                                    onChange={(v) => setConfig('region', v)}
                                                />
                                            </Columns>
                                            <TextField
                                                id={'bd-endpoint'}
                                                type={'url'}
                                                label={'Endpoint'}
                                                value={text('endpoint')}
                                                placeholder={'https://s3.eu-central-003.backblazeb2.com'}
                                                help={
                                                    'Only for services other than Amazon S3, leave it empty for Amazon.'
                                                }
                                                onChange={(v) => setConfig('endpoint', v)}
                                            />
                                            <Columns>
                                                <TextField
                                                    id={'bd-key'}
                                                    label={'Access key'}
                                                    value={text('key')}
                                                    autoComplete={'off'}
                                                    onChange={(v) => setConfig('key', v)}
                                                />
                                                <TextField
                                                    id={'bd-secret'}
                                                    type={'password'}
                                                    label={'Secret key'}
                                                    value={text('secret')}
                                                    autoComplete={'new-password'}
                                                    placeholder={form.has.secret ? 'Saved, leave empty to keep it' : ''}
                                                    onChange={(v) => setConfig('secret', v)}
                                                />
                                            </Columns>
                                            <TextField
                                                id={'bd-prefix'}
                                                label={'Folder in the bucket'}
                                                value={text('prefix')}
                                                placeholder={'stratosphere-backups'}
                                                onChange={(v) => setConfig('prefix', v)}
                                            />
                                            <ToggleField
                                                label={'Path style addresses'}
                                                help={
                                                    'Some services (MinIO) need bucket names in the path instead of in the host name.'
                                                }
                                                checked={!!form.config.path_style}
                                                onChange={(v) => setConfig('path_style', v)}
                                            />
                                        </>
                                    )}
                                    {form.type === 'webdav' && (
                                        <>
                                            <TextField
                                                id={'bd-url'}
                                                type={'url'}
                                                label={'Address of the folder'}
                                                value={text('url')}
                                                placeholder={
                                                    'https://cloud.example.com/remote.php/dav/files/me/backups'
                                                }
                                                help={
                                                    'The folder has to exist, a folder for each server is made in it.'
                                                }
                                                onChange={(v) => setConfig('url', v)}
                                            />
                                            <Columns>
                                                <TextField
                                                    id={'bd-user'}
                                                    label={'User name'}
                                                    value={text('username')}
                                                    autoComplete={'off'}
                                                    onChange={(v) => setConfig('username', v)}
                                                />
                                                <TextField
                                                    id={'bd-password'}
                                                    type={'password'}
                                                    label={'Password'}
                                                    value={text('password')}
                                                    autoComplete={'new-password'}
                                                    placeholder={
                                                        form.has.password ? 'Saved, leave empty to keep it' : ''
                                                    }
                                                    help={'For Nextcloud use an app password.'}
                                                    onChange={(v) => setConfig('password', v)}
                                                />
                                            </Columns>
                                        </>
                                    )}
                                    {form.type === 'folder' && (
                                        <TextField
                                            id={'bd-path'}
                                            label={'Folder'}
                                            value={text('path')}
                                            placeholder={'/mnt/backups'}
                                            help={
                                                'The full path on the machine of the panel, the web user needs to be able to write there. A mounted disk or share works.'
                                            }
                                            onChange={(v) => setConfig('path', v)}
                                        />
                                    )}
                                    <ToggleField
                                        label={'On'}
                                        checked={form.enabled}
                                        onChange={(enabled) => set({ enabled })}
                                    />
                                    <ToggleField
                                        label={'Copy every new backup here'}
                                        help={
                                            'When a backup is complete it is read from the node and written here, in the background.'
                                        }
                                        checked={form.auto_copy}
                                        onChange={(auto_copy) => set({ auto_copy })}
                                    />
                                    <ToggleField
                                        label={'Remove the file from the node once it is stored here'}
                                        help={
                                            'Frees the disk of the node: this destination is then the only place that has the backup. Downloading and restoring read from here. Only for backups made on the node.'
                                        }
                                        checked={form.delete_local}
                                        onChange={(delete_local) => set({ delete_local })}
                                    />
                                    <div>
                                        <p className={'mb-2 text-sm font-medium text-neutral-200'}>How much is kept</p>
                                        <Columns className={'sm:grid-cols-3'}>
                                            <TextField
                                                id={'bd-last'}
                                                type={'number'}
                                                label={'Newest copies'}
                                                value={form.keep_last}
                                                placeholder={'all'}
                                                onChange={(keep_last) => set({ keep_last })}
                                            />
                                            <TextField
                                                id={'bd-days'}
                                                type={'number'}
                                                label={'Days'}
                                                value={form.keep_days}
                                                placeholder={'forever'}
                                                onChange={(keep_days) => set({ keep_days })}
                                            />
                                            <TextField
                                                id={'bd-gb'}
                                                type={'number'}
                                                label={'GB together'}
                                                value={form.max_gb}
                                                placeholder={'no limit'}
                                                onChange={(max_gb) => set({ max_gb })}
                                            />
                                        </Columns>
                                        <p className={'input-help'}>
                                            For each server. Whatever goes over a limit is deleted from here, oldest
                                            first, checked after every copy and every hour. Locked backups are never
                                            deleted.
                                        </p>
                                    </div>
                                    {tested && <Notice tone={tested.ok ? 'blue' : 'red'}>{tested.message}</Notice>}
                                </Stack>
                                <div className={'mt-6 flex justify-end gap-2'}>
                                    <Button
                                        variant={Button.Variants.Secondary}
                                        onClick={() => {
                                            setForm(null);
                                            setTested(null);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button variant={Button.Variants.Secondary} disabled={busy} onClick={test}>
                                        Test it
                                    </Button>
                                    <Button disabled={busy || form.name.trim() === ''} onClick={save}>
                                        Save
                                    </Button>
                                </div>
                            </SectionCard>
                        )}
                    </div>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                        <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                            <li>
                                The node still makes every backup, as it does now. The panel then copies it to each
                                destination that is on.
                            </li>
                            <li>
                                A copy is read from the node and written by the panel, so it uses the bandwidth of the
                                panel machine, and the queue worker has to be running.
                            </li>
                            <li>
                                A backup that was removed from its node is downloaded and restored from a copy. S3 gives
                                a direct link; WebDAV and folders go through the panel.
                            </li>
                            <li>Deleting a backup deletes its copies everywhere.</li>
                            <li>
                                Keys and passwords are stored encrypted and never shown again; leave a field empty when
                                editing to keep it.
                            </li>
                        </ul>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
