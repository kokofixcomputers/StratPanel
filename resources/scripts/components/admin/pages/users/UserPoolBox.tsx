import React, { useEffect, useState } from 'react';
import { ChartBarIcon } from '@heroicons/react/solid';
import SectionCard from '@/components/elements/SectionCard';
import { Button } from '@/components/elements/button/index';
import { TextField } from '@/components/admin/forms';
import { Pill } from '@/components/admin/AdminTable';
import AdminLink from '@/components/admin/AdminLink';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { PoolNumbers, updatePool, UserPool } from '@/api/admin/users';

const FIELDS: { key: keyof PoolNumbers; label: string }[] = [
    { key: 'memory', label: 'Memory (MB)' },
    { key: 'disk', label: 'Disk space (MB)' },
    { key: 'cpu', label: 'CPU (%)' },
    { key: 'allocations', label: 'Allocations' },
    { key: 'backups', label: 'Backups' },
    { key: 'databases', label: 'Databases' },
];

/** What a person may spend on the servers they make themselves; an empty field is the default of the panel. */
export default ({
    userId,
    pool,
    canChange,
    onSaved,
}: {
    userId: number;
    pool: UserPool;
    canChange: boolean;
    onSaved: () => void;
}) => {
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [values, setValues] = useState<Record<keyof PoolNumbers, string>>({
        memory: '',
        disk: '',
        cpu: '',
        allocations: '',
        backups: '',
        databases: '',
    });
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setValues(
            FIELDS.reduce(
                (all, { key }) => ({ ...all, [key]: pool.own[key] === null ? '' : String(pool.own[key]) }),
                {} as Record<keyof PoolNumbers, string>
            )
        );
    }, [pool]);

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updatePool(userId, values)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The resource pool of this person was saved.' });
                onSaved();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SectionCard
            icon={<ChartBarIcon className={'h-5 w-5'} />}
            title={'Resource pool'}
            description={
                'What this person may spend on the servers they create themselves. Leave a field empty for the default of the panel.'
            }
            badge={
                !pool.enabled ? (
                    <Pill>Resource pools are off</Pill>
                ) : pool.unlimited ? (
                    <Pill tone={'yellow'}>Not limited: may create servers in the admin area</Pill>
                ) : undefined
            }
        >
            <div className={'grid gap-4 sm:grid-cols-2 lg:grid-cols-5'}>
                {FIELDS.map(({ key, label }) => (
                    <TextField
                        key={key}
                        id={`pool-${key}`}
                        label={label}
                        type={'number'}
                        value={values[key]}
                        placeholder={String(pool.defaults[key])}
                        disabled={!canChange}
                        onChange={(value) => setValues({ ...values, [key]: value })}
                        help={`uses ${pool.used[key]} of ${pool.limits[key]}`}
                    />
                ))}
            </div>
            <div className={'mt-4 flex items-center justify-between gap-3'}>
                {admin.can('settings.pools.view') ? (
                    <AdminLink to={'/admin/settings/pools'}>Defaults and the switch</AdminLink>
                ) : (
                    <span />
                )}
                {canChange && (
                    <Button type={'button'} onClick={save} disabled={busy}>
                        {busy ? 'Saving...' : 'Save pool'}
                    </Button>
                )}
            </div>
        </SectionCard>
    );
};
