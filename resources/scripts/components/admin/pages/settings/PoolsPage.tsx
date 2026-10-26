import React from 'react';
import { InformationCircleIcon, ChartBarIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { Pools } from '@/api/admin/settings';

interface Values {
    enabled: boolean;
    memory: string;
    disk: string;
    cpu: string;
    allocations: string;
    backups: string;
    databases: string;
}

const FIELDS: {
    key: 'memory' | 'disk' | 'cpu' | 'allocations' | 'backups' | 'databases';
    label: string;
    help: string;
}[] = [
    { key: 'memory', label: 'Memory (MB)', help: '4096 is 4 GB.' },
    { key: 'disk', label: 'Disk space (MB)', help: '10240 is 10 GB.' },
    { key: 'cpu', label: 'CPU (%)', help: '100% is one core, 200% is two.' },
    { key: 'allocations', label: 'Allocations', help: 'Ports in total. A server uses at least one.' },
    {
        key: 'backups',
        label: 'Backups',
        help: 'How many backups the servers of a person may keep in total (their backup limits added up).',
    },
    {
        key: 'databases',
        label: 'Databases',
        help: 'How many databases the servers of a person may have in total (their database limits added up).',
    },
];

/** Admin > Settings > Resource pools: an amount to spend on servers instead of a number of servers. */
export default () => {
    const admin = useAdmin();
    const { data, values, set, busy, save } = useSettingForm<Pools, Values>(
        'pools',
        (d) => ({
            enabled: d.enabled,
            memory: String(d.defaults.memory),
            disk: String(d.defaults.disk),
            cpu: String(d.defaults.cpu),
            allocations: String(d.defaults.allocations),
            backups: String(d.defaults.backups),
            databases: String(d.defaults.databases),
        }),
        'Resource pool settings were saved.'
    );
    const can = admin.can('settings.pools.update');

    return (
        <SettingsFrame
            title={'Resource pools'}
            subtitle={'Give people an amount to spend on servers instead of a number of servers.'}
        >
            {!data || !values ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        <SectionCard icon={<ChartBarIcon className={'h-5 w-5'} />} title={'Resource pools'}>
                            <ToggleField
                                label={'Pay the servers people create from a resource pool'}
                                help={
                                    'Off by default. When it is on, the servers people create for themselves (the "Create a server" page) are paid from a pool: so much memory, disk space, CPU, allocations, backups and databases in total. They can make as many servers as fit, and the wizard shows what is left after the server they are making. The limit on the number of servers no longer applies. Everybody has the defaults below, unless you give a person their own pool on their user page.'
                                }
                                checked={values.enabled}
                                disabled={!can}
                                onChange={(enabled) => set({ enabled })}
                            />
                        </SectionCard>
                        <SectionCard icon={<ChartBarIcon className={'h-5 w-5'} />} title={'What a person gets'}>
                            <Stack>
                                <Columns>
                                    {FIELDS.map((field) => (
                                        <TextField
                                            key={field.key}
                                            id={`pool-${field.key}`}
                                            type={'number'}
                                            label={field.label}
                                            help={field.help}
                                            value={values[field.key]}
                                            disabled={!can}
                                            onChange={(value) => set({ [field.key]: value } as Partial<Values>)}
                                        />
                                    ))}
                                </Columns>
                            </Stack>
                            {can && (
                                <div className={'mt-6 flex justify-end'}>
                                    <Button onClick={() => save()} disabled={busy}>
                                        Save
                                    </Button>
                                </div>
                            )}
                        </SectionCard>
                    </div>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                        <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                            <li>
                                What a person has used is counted from the servers they own, wherever they were made, so
                                deleting a server gives its share back.
                            </li>
                            <li>
                                The defaults apply to everybody without a pool of their own, so changing them changes
                                what all of them get. A person&apos;s own pool is on their page in Users.
                            </li>
                            <li>
                                People who may create servers in the admin area (root admins and roles with
                                servers.create) are never limited by a pool.
                            </li>
                            <li>
                                A person who already has more servers than the pool allows keeps them, they just can not
                                make more until they are under it.
                            </li>
                            <li>Allocations they add to a server on the Network page are paid from the pool too.</li>
                            <li>
                                Right now {data.own} {data.own === 1 ? 'person has' : 'people have'} a pool of their
                                own.
                            </li>
                        </ul>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
