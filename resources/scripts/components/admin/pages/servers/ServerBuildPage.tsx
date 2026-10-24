import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChipIcon, ViewListIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import { CheckList, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { updateBuild, useBuild, useServer } from '@/api/admin/servers';

const text = (value: number | null) => (value === null ? '' : String(value));

/** Admin > Servers > one server > Build configuration: resources, feature limits and allocations. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server } = useServer(id);
    const { data, error, mutate } = useBuild(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<Record<string, string>>({});
    const [oom, setOom] = useState(false);
    const [allocation, setAllocation] = useState('');
    const [add, setAdd] = useState<number[]>([]);
    const [remove, setRemove] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.build');

    useEffect(() => {
        if (!data) return;
        setValue({
            cpu: text(data.cpu),
            threads: data.threads,
            memory: text(data.memory),
            swap: text(data.swap),
            disk: text(data.disk),
            io: text(data.io),
            database_limit: text(data.database_limit),
            allocation_limit: text(data.allocation_limit),
            backup_limit: text(data.backup_limit),
        });
        setOom(data.oom_disabled);
        setAllocation(String(data.allocation_id));
        setAdd([]);
        setRemove([]);
    }, [data]);

    if (!server || !data) return error ? null : <Spinner size={'large'} centered />;

    const set = (key: string) => (v: string) => setValue({ ...value, [key]: v });

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateBuild(data.id, {
            ...value,
            oom_disabled: oom,
            allocation_id: Number(allocation),
            add_allocations: add,
            remove_allocations: remove,
        })
            .then((fresh) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: 'The build configuration of the server was updated.',
                });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const field = (key: string, label: string, help: string, unit?: string) => (
        <TextField
            id={`build-${key}`}
            type={key === 'threads' ? 'text' : 'number'}
            label={unit ? `${label} (${unit})` : label}
            value={value[key] ?? ''}
            disabled={!can}
            onChange={set(key)}
            help={help}
        />
    );

    return (
        <ServerFrame server={server} subtitle={'Control allocations and system resources for this server.'}>
            <div className={'grid gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<ChipIcon className={'h-5 w-5'} />} title={'Resource management'}>
                    <Stack>
                        {field(
                            'cpu',
                            'CPU limit',
                            'Each virtual core (thread) on the system is considered to be 100%. Setting this value to 0 allows the server to use CPU time without restrictions.',
                            '%'
                        )}
                        {field(
                            'threads',
                            'CPU pinning',
                            'Advanced: the specific CPU cores this process can run on, or leave blank to allow all cores. A single number or a comma separated list. Example: 0, 0-1,3, or 0,1,3,4.'
                        )}
                        {field(
                            'memory',
                            'Allocated memory',
                            'The maximum amount of memory allowed for this container. Setting this to 0 allows unlimited memory.',
                            'MiB'
                        )}
                        {field(
                            'swap',
                            'Allocated swap',
                            'Setting this to 0 disables swap space on this server. Setting it to -1 allows unlimited swap.',
                            'MiB'
                        )}
                        {field(
                            'disk',
                            'Disk space limit',
                            'This server will not be allowed to boot if it is using more than this amount of space. If a server goes over this limit while running it is safely stopped and locked until enough space is available. Set to 0 to allow unlimited disk usage.',
                            'MiB'
                        )}
                        {field(
                            'io',
                            'Block IO proportion',
                            'Advanced: the IO performance of this server relative to other running containers on the system. A value between 10 and 1000.'
                        )}
                        <ToggleField
                            label={'OOM killer'}
                            help={'Enabling the OOM killer may cause server processes to exit unexpectedly.'}
                            checked={!oom}
                            disabled={!can}
                            onChange={(enabled) => setOom(!enabled)}
                        />
                    </Stack>
                </SectionCard>
                <div className={'space-y-4'}>
                    <SectionCard icon={<ChipIcon className={'h-5 w-5'} />} title={'Application feature limits'}>
                        <Stack>
                            {field(
                                'database_limit',
                                'Database limit',
                                'The total number of databases a user is allowed to create for this server.'
                            )}
                            {field(
                                'allocation_limit',
                                'Allocation limit',
                                'The total number of allocations a user is allowed to create for this server.'
                            )}
                            {field(
                                'backup_limit',
                                'Backup limit',
                                'The total number of backups that can be created for this server.'
                            )}
                        </Stack>
                    </SectionCard>
                    <SectionCard icon={<ViewListIcon className={'h-5 w-5'} />} title={'Allocation management'}>
                        <Stack>
                            <SelectField
                                id={'build-allocation'}
                                label={'Game port'}
                                value={allocation}
                                disabled={!can}
                                choices={data.assigned.map((a) => ({ value: String(a.id), label: a.text }))}
                                onChange={setAllocation}
                                help={'The default connection address that is used for this game server.'}
                            />
                            <div>
                                <p className={'mb-1 text-sm font-medium text-neutral-200'}>Assign additional ports</p>
                                <CheckList
                                    groups={[
                                        {
                                            label: 'Free on this node',
                                            items: data.unassigned.map((a) => ({ id: a.id, label: a.text })),
                                        },
                                    ]}
                                    selected={add}
                                    onChange={can ? setAdd : () => undefined}
                                    empty={'No free ports on this node.'}
                                />
                                <p className={'input-help'}>
                                    Due to software limitations you can not assign identical ports on different IPs to
                                    the same server.
                                </p>
                            </div>
                            <div>
                                <p className={'mb-1 text-sm font-medium text-neutral-200'}>Remove additional ports</p>
                                <CheckList
                                    groups={[
                                        {
                                            label: 'On this server',
                                            items: data.assigned
                                                .filter((a) => String(a.id) !== allocation)
                                                .map((a) => ({ id: a.id, label: a.text })),
                                        },
                                    ]}
                                    selected={remove}
                                    onChange={can ? setRemove : () => undefined}
                                    empty={'There are no additional ports.'}
                                />
                                <p className={'input-help'}>
                                    Select which ports to remove. To assign a port on a different IP that is already in
                                    use, choose it above and delete it here.
                                </p>
                            </div>
                        </Stack>
                    </SectionCard>
                </div>
            </div>
            {can && (
                <div className={'mt-4 flex justify-end'}>
                    <Button onClick={save} disabled={busy}>
                        Update build configuration
                    </Button>
                </div>
            )}
        </ServerFrame>
    );
};
