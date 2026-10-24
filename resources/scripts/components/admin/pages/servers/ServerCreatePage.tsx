import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { ArrowLeftIcon, ChipIcon, CogIcon, UploadIcon, ViewListIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import EggFields, { eggDefaults, EggValue } from '@/components/admin/pages/servers/EggFields';
import OwnerSelect from '@/components/admin/pages/servers/OwnerSelect';
import {
    AreaField,
    CheckList,
    Columns,
    Notice,
    SelectField,
    Stack,
    TextField,
    ToggleField,
} from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { readStratserverFile } from '@/lib/stratserverFile';
import {
    AllocationOption,
    createServer,
    findPeople,
    freeAllocations,
    NestChoice,
    useServerForm,
} from '@/api/admin/servers';

interface Core {
    name: string;
    owner_id: string;
    description: string;
    start_on_completion: boolean;
    database_limit: string;
    allocation_limit: string;
    backup_limit: string;
    cpu: string;
    threads: string;
    memory: string;
    swap: string;
    disk: string;
    io: string;
    oom_enabled: boolean;
}

const CORE: Core = {
    name: '',
    owner_id: '',
    description: '',
    start_on_completion: true,
    database_limit: '0',
    allocation_limit: '0',
    backup_limit: '0',
    cpu: '0',
    threads: '',
    memory: '1024',
    swap: '0',
    disk: '5120',
    io: '500',
    oom_enabled: true,
};

/** Admin > Servers > new: everything a server is made with, or the file of a server exported from this or another panel. */
export default () => {
    const { data, error } = useServerForm();
    const history = useHistory();
    const picker = useRef<HTMLInputElement>(null);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [core, setCore] = useState<Core>(CORE);
    const [egg, setEgg] = useState<EggValue | null>(null);
    const [node, setNode] = useState('');
    const [free, setFree] = useState<AllocationOption[]>([]);
    const [allocation, setAllocation] = useState('');
    const [additional, setAdditional] = useState<number[]>([]);
    // Set once the person chose or cleared the additional allocations themselves: then they are not picked for them again.
    const [touched, setTouched] = useState(false);
    const [document, setDocument] = useState<string | null>(null);
    const [say, setSay] = useState<{ text: string; ok: boolean } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data && !egg) setEgg(eggDefaults(data.nests, '', ''));
    }, [data]);

    const nodeId = node || String(data?.locations.flatMap((l) => l.nodes)[0]?.id ?? '');

    // The allocations of the node: the first is the default and one more is picked, for a voice chat or a web map.
    useEffect(() => {
        if (!nodeId) return;
        freeAllocations(nodeId)
            .then((list) => {
                setFree(list);
                setAllocation(String(list[0]?.id ?? ''));
                setAdditional(list[1] && !touched ? [list[1].id] : []);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    }, [nodeId]);

    if (!data || !egg) return error ? null : <Spinner size={'large'} centered />;

    if (data.locations.every((l) => l.nodes.length === 0)) {
        return (
            <AdminPage title={'Create server'} subtitle={'Add a new server to the panel.'}>
                <Notice>
                    A node is needed before a server can be made.{' '}
                    <AdminLink to={'/admin/nodes/new'} className={'font-medium underline'}>
                        Make one first.
                    </AdminLink>
                </Notice>
            </AdminPage>
        );
    }

    const set = (key: keyof Core) => (value: string) => setCore({ ...core, [key]: value });

    const read = (file: File) => {
        setSay({ text: 'Reading the file...', ok: true });
        readStratserverFile(file, (bytes) =>
            setSay({ text: `Reading the file... ${Math.round(bytes / 1048576)} MB`, ok: true })
        )
            .then(async (contents) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let doc: any;
                try {
                    doc = JSON.parse(contents);
                } catch (e) {
                    return setSay({ text: 'That is not an export file.', ok: false });
                }
                if (!doc || doc.format !== 'stratosphere-server' || !doc.server) {
                    return setSay({ text: 'That is not an export file from Stratosphere.', ok: false });
                }

                const server = doc.server;
                const limits = server.limits || {};
                const features = server.feature_limits || {};
                const notes: string[] = [];
                const text = (value: unknown, fallback: string) =>
                    value === null || value === undefined ? fallback : String(value);

                setCore({
                    ...core,
                    name: text(server.name, core.name),
                    description: text(server.description, core.description),
                    memory: text(limits.memory, core.memory),
                    swap: text(limits.swap, core.swap),
                    disk: text(limits.disk, core.disk),
                    io: text(limits.io, core.io),
                    cpu: text(limits.cpu, core.cpu),
                    threads: text(limits.threads, core.threads),
                    database_limit: text(features.databases, core.database_limit),
                    allocation_limit: text(features.allocations, core.allocation_limit),
                    backup_limit: text(features.backups, core.backup_limit),
                    oom_enabled: !server.oom_disabled,
                });

                // The egg: by its uuid, else by its name.
                let found: { nest: NestChoice; egg: NestChoice['eggs'][number] } | null = null;
                const wanted = doc.egg || {};
                data.nests.forEach((nest) =>
                    nest.eggs.forEach((item) => {
                        if (wanted.uuid && item.uuid === wanted.uuid) found = { nest, egg: item };
                        else if (!found && wanted.name && item.name === wanted.name) found = { nest, egg: item };
                    })
                );

                if (found) {
                    const { nest, egg: item } = found as { nest: NestChoice; egg: NestChoice['eggs'][number] };
                    const base = eggDefaults(data.nests, String(nest.id), String(item.id));
                    const known = Object.values(item.docker_images);
                    setEgg({
                        ...base,
                        skip_scripts: !!server.skip_scripts,
                        startup: server.startup || base.startup,
                        image: server.image ? (known.includes(server.image) ? server.image : '') : base.image,
                        custom_image: server.image && !known.includes(server.image) ? server.image : '',
                        environment: { ...base.environment, ...(doc.environment || {}) },
                    });
                } else {
                    notes.push(
                        `The egg "${
                            wanted.name || 'unknown'
                        }" is not on this panel, so pick an egg yourself (import it first under Nests).`
                    );
                }

                setDocument(contents);

                if (server.owner_email) {
                    const people = await findPeople(server.owner_email).catch(() => []);
                    const person = people.find(
                        (p) => p.email.toLowerCase() === String(server.owner_email).toLowerCase()
                    );
                    if (person) setCore((c) => ({ ...c, owner_id: String(person.id) }));
                    else
                        notes.push(
                            `There is no user with the email ${server.owner_email} here, so pick the owner yourself.`
                        );
                }

                setSay({
                    text: `Filled in from "${server.name || 'the file'}". ${notes.join(
                        ' '
                    )} Pick the owner, node and allocation, then create it.`,
                    ok: notes.length === 0,
                });
            })
            .catch((e) => setSay({ text: e.message, ok: false }));
    };

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        const { oom_enabled, ...rest } = core;
        createServer({
            ...rest,
            oom_disabled: !oom_enabled,
            node_id: nodeId,
            allocation_id: allocation,
            allocation_additional: additional.filter((a) => String(a) !== allocation).map(String),
            nest_id: egg.nest_id,
            egg_id: egg.egg_id,
            skip_scripts: egg.skip_scripts,
            image: egg.image || egg.custom_image,
            custom_image: egg.custom_image,
            startup: egg.startup,
            environment: egg.environment,
            import_document: document ?? undefined,
        })
            .then(({ id, schedules }) => {
                addFlash({ key: 'admin', type: 'success', message: 'The server was created.' });
                if (schedules > 0)
                    addFlash({
                        key: 'admin',
                        type: 'info',
                        message: `${schedules} schedule(s) from the export file were added to the server.`,
                    });
                history.push(`/admin/servers/view/${id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
            });
    };

    return (
        <AdminPage
            title={'Create server'}
            subtitle={'Add a new server to the panel.'}
            actions={
                <AdminLink to={'/admin/servers'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Servers
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'space-y-4'}>
                <SectionCard
                    icon={<UploadIcon className={'h-5 w-5'} />}
                    title={'Import a server'}
                    description={
                        "Moving a server from another panel? Choose the file made by Export with files in the server's Settings (or Export server on its Manage page). The form below is filled in with its settings, egg, variables and schedules; pick the owner, node and allocation and create it."
                    }
                >
                    <input
                        ref={picker}
                        type={'file'}
                        accept={'.json,.tar.gz,.tgz'}
                        className={'hidden'}
                        onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            e.currentTarget.value = '';
                            if (file) read(file);
                        }}
                    />
                    <Button.Text onClick={() => picker.current?.click()}>Choose an export file</Button.Text>
                    {say && <p className={`mt-3 text-sm ${say.ok ? 'text-green-600' : 'text-red-600'}`}>{say.text}</p>}
                </SectionCard>

                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Core details'}>
                    <Columns>
                        <Stack>
                            <TextField
                                id={'new-name'}
                                label={'Server name'}
                                value={core.name}
                                onChange={set('name')}
                                help={'Letters, numbers, spaces and _ - .'}
                            />
                            <OwnerSelect
                                id={'new-owner'}
                                label={'Server owner'}
                                value={core.owner_id}
                                onChange={set('owner_id')}
                                help={'The email address of the server owner.'}
                            />
                        </Stack>
                        <Stack>
                            <AreaField
                                id={'new-description'}
                                label={'Server description'}
                                rows={3}
                                value={core.description}
                                onChange={set('description')}
                                help={'A brief description of this server.'}
                            />
                            <ToggleField
                                label={'Start server when installed'}
                                checked={core.start_on_completion}
                                onChange={(on) => setCore({ ...core, start_on_completion: on })}
                            />
                        </Stack>
                    </Columns>
                </SectionCard>

                <SectionCard icon={<ViewListIcon className={'h-5 w-5'} />} title={'Allocation management'}>
                    <Columns className={'sm:grid-cols-3'}>
                        <SelectField
                            id={'new-node'}
                            label={'Node'}
                            value={nodeId}
                            groups={data.locations
                                .filter((l) => l.nodes.length > 0)
                                .map((l) => ({
                                    label: `${l.long} (${l.short})`,
                                    choices: l.nodes.map((n) => ({ value: String(n.id), label: n.name })),
                                }))}
                            onChange={setNode}
                            help={'The node this server is deployed to.'}
                        />
                        <SelectField
                            id={'new-allocation'}
                            label={'Default allocation'}
                            value={allocation}
                            choices={free.map((a) => ({ value: String(a.id), label: a.text }))}
                            onChange={setAllocation}
                            help={'The main allocation that is assigned to this server.'}
                        />
                        <div>
                            <p className={'mb-1 text-sm font-medium text-neutral-200'}>Additional allocation(s)</p>
                            <CheckList
                                groups={[
                                    {
                                        label: 'Free on this node',
                                        items: free
                                            .filter((a) => String(a.id) !== allocation)
                                            .map((a) => ({ id: a.id, label: a.text })),
                                    },
                                ]}
                                selected={additional}
                                onChange={(next) => {
                                    setTouched(true);
                                    setAdditional(next);
                                }}
                                empty={'No other free allocation.'}
                            />
                            <p className={'input-help'}>
                                Extra allocations for this server on creation. One is picked for you so a server starts
                                with two, for example for Simple Voice Chat or BlueMap. You can change or clear it.
                            </p>
                        </div>
                    </Columns>
                </SectionCard>

                <SectionCard icon={<ChipIcon className={'h-5 w-5'} />} title={'Application feature limits'}>
                    <Columns className={'sm:grid-cols-3'}>
                        <TextField
                            id={'new-db'}
                            type={'number'}
                            label={'Database limit'}
                            value={core.database_limit}
                            onChange={set('database_limit')}
                            help={'The total number of databases a user may create for this server.'}
                        />
                        <TextField
                            id={'new-alloc'}
                            type={'number'}
                            label={'Allocation limit'}
                            value={core.allocation_limit}
                            onChange={set('allocation_limit')}
                            help={'The total number of allocations a user may create for this server.'}
                        />
                        <TextField
                            id={'new-backup'}
                            type={'number'}
                            label={'Backup limit'}
                            value={core.backup_limit}
                            onChange={set('backup_limit')}
                            help={'The total number of backups that can be created for this server.'}
                        />
                    </Columns>
                </SectionCard>

                <SectionCard icon={<ChipIcon className={'h-5 w-5'} />} title={'Resource management'}>
                    <Columns>
                        <TextField
                            id={'new-cpu'}
                            type={'number'}
                            label={'CPU limit (%)'}
                            value={core.cpu}
                            onChange={set('cpu')}
                            help={
                                '0 means no limit. To determine a value take the number of threads and multiply it by 100: on a quad core system without hyperthreading there is 400% available.'
                            }
                        />
                        <TextField
                            id={'new-threads'}
                            label={'CPU pinning'}
                            value={core.threads}
                            onChange={set('threads')}
                            help={
                                'Advanced: the specific CPU threads this process may run on, or leave blank to allow all. A single number or a comma separated list: 0, 0-1,3, or 0,1,3,4.'
                            }
                        />
                        <TextField
                            id={'new-memory'}
                            type={'number'}
                            label={'Memory (MiB)'}
                            value={core.memory}
                            onChange={set('memory')}
                            help={'The maximum amount of memory allowed for this container. 0 means unlimited.'}
                        />
                        <TextField
                            id={'new-swap'}
                            type={'number'}
                            label={'Swap (MiB)'}
                            value={core.swap}
                            onChange={set('swap')}
                            help={'0 disables swap space on this server, -1 allows unlimited swap.'}
                        />
                        <TextField
                            id={'new-disk'}
                            type={'number'}
                            label={'Disk space (MiB)'}
                            value={core.disk}
                            onChange={set('disk')}
                            help={'The server will not boot if it uses more than this. 0 means unlimited.'}
                        />
                        <TextField
                            id={'new-io'}
                            type={'number'}
                            label={'Block IO weight'}
                            value={core.io}
                            onChange={set('io')}
                            help={
                                'Advanced: the IO performance of this server relative to other running containers. A value between 10 and 1000.'
                            }
                        />
                    </Columns>
                    <div className={'mt-4'}>
                        <ToggleField
                            label={'Enable OOM killer'}
                            help={
                                'Terminates the server if it breaches the memory limits. Enabling the OOM killer may cause server processes to exit unexpectedly.'
                            }
                            checked={core.oom_enabled}
                            onChange={(on) => setCore({ ...core, oom_enabled: on })}
                        />
                    </div>
                </SectionCard>

                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Egg, image and startup'}>
                    <EggFields
                        nests={data.nests}
                        value={egg}
                        onChange={setEgg}
                        scriptsHelp={
                            'If the selected egg has an install script, it runs during the install. To skip that step, switch this on.'
                        }
                    />
                </SectionCard>

                <div className={'flex justify-end'}>
                    <Button
                        onClick={create}
                        disabled={busy || !core.name.trim() || !core.owner_id || !allocation || !egg.egg_id}
                    >
                        Create server
                    </Button>
                </div>
            </div>
        </AdminPage>
    );
};
