import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CogIcon, DownloadIcon, UploadIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import EggTabs from '@/components/admin/pages/nests/EggTabs';
import { AreaField, Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createEgg, deleteEgg, EggInput, updateEgg, updateEggFromFile, useEgg, useNestLookup } from '@/api/admin/nests';

const EMPTY: EggInput = {
    name: '',
    description: '',
    docker_images: '',
    force_outgoing_ip: false,
    startup: '',
    features: [],
    config_from: '',
    config_stop: '',
    config_logs: '',
    config_files: '',
    config_startup: '',
};

/** Admin > Nests > Eggs > one egg (or a new one): what it is, how it starts and how the daemon manages it. */
export default () => {
    const { id } = useParams<{ id?: string }>();
    const exists = !!id;
    const { data, error, mutate } = useEgg(id);
    const { data: lookup } = useNestLookup();
    const admin = useAdmin();
    const history = useHistory();
    const picker = useRef<HTMLInputElement>(null);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<EggInput>(EMPTY);
    const [nest, setNest] = useState('');
    const [features, setFeatures] = useState('');
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const can = exists ? admin.can('eggs.update') : admin.can('eggs.create');

    useEffect(() => {
        if (!data) return;
        setValue({
            name: data.name,
            description: data.description ?? '',
            docker_images: data.docker_images,
            force_outgoing_ip: data.force_outgoing_ip,
            startup: data.startup,
            features: data.features,
            config_from: data.config_from === null ? '' : String(data.config_from),
            config_stop: data.config_stop,
            config_logs: data.config_logs,
            config_files: data.config_files,
            config_startup: data.config_startup,
        });
        setFeatures(data.features.join(', '));
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (exists && !data) return error ? null : <Spinner size={'large'} centered />;

    const set = (changes: Partial<EggInput>) => setValue({ ...value, ...changes });
    const nestId = Number(nest || lookup?.nests[0]?.id);
    // The eggs a new egg may take its settings from are the ones of the nest chosen above.
    const copyFrom = exists ? data?.siblings ?? [] : lookup?.nests.find((n) => n.id === nestId)?.eggs ?? [];
    const body = (): EggInput => ({
        ...value,
        features: features.split(/[,\s]+/).filter((feature) => feature !== ''),
        ...(exists ? {} : { nest_id: nestId }),
    });

    const run = (work: Promise<unknown>) => {
        clearFlashes('admin');
        setBusy(true);
        work.catch((e) => clearAndAddHttpError({ key: 'admin', error: e })).then(() => setBusy(false));
    };

    const save = () =>
        run(
            exists
                ? updateEgg(data!.id, body()).then((fresh) => {
                      addFlash({ key: 'admin', type: 'success', message: 'Egg was updated successfully.' });
                      return mutate(fresh, false);
                  })
                : createEgg(body()).then((made) => {
                      addFlash({ key: 'admin', type: 'success', message: 'A new egg was created successfully.' });
                      history.push(`/admin/nests/egg/${made.id}`);
                  })
        );

    const remove = () =>
        deleteEgg(data!.id)
            .then(({ nest_id }) => {
                addFlash({ key: 'admin', type: 'success', message: 'The egg was deleted.' });
                history.push(`/admin/nests/view/${nest_id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });

    return (
        <AdminPage
            title={exists ? data!.name : 'New egg'}
            subtitle={exists ? data!.description?.slice(0, 80) ?? undefined : 'An egg is the type of game server.'}
            actions={
                <AdminLink to={exists ? `/admin/nests/view/${data!.nest.id}` : '/admin/nests'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        {exists ? data!.nest.name : 'Nests'}
                    </Button.Text>
                </AdminLink>
            }
        >
            {exists && <EggTabs id={data!.id} />}
            <div className={'space-y-4'}>
                {exists && admin.can('eggs.import') && (
                    <SectionCard
                        icon={<UploadIcon className={'h-5 w-5'} />}
                        title={'Egg file'}
                        description={
                            'To replace the settings of this egg with a new JSON file, choose it and press "Update egg". This will not change any existing servers.'
                        }
                    >
                        <input
                            ref={picker}
                            type={'file'}
                            accept={'application/json,.json'}
                            className={'hidden'}
                            onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (!file) return;
                                run(
                                    updateEggFromFile(data!.id, file).then((fresh) => {
                                        addFlash({
                                            key: 'admin',
                                            type: 'success',
                                            message: 'The egg was updated from the file.',
                                        });
                                        return mutate(fresh, false);
                                    })
                                );
                            }}
                        />
                        <Button.Text disabled={busy} onClick={() => picker.current?.click()}>
                            Choose a file and update this egg
                        </Button.Text>
                    </SectionCard>
                )}

                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Configuration'}>
                    <Columns>
                        <Stack>
                            {!exists && (
                                <SelectField
                                    id={'egg-nest'}
                                    label={'Associated nest'}
                                    value={String(nestId || '')}
                                    choices={(lookup?.nests ?? []).map((n) => ({
                                        value: String(n.id),
                                        label: `${n.name} <${n.author}>`,
                                    }))}
                                    onChange={(n) => {
                                        setNest(n);
                                        set({ config_from: '' });
                                    }}
                                    help={
                                        'Think of a nest as a category. You can put multiple eggs in a nest, but consider putting only eggs that are related to each other in each nest.'
                                    }
                                />
                            )}
                            <TextField
                                id={'egg-name'}
                                label={'Name'}
                                value={value.name}
                                disabled={!can}
                                onChange={(name) => set({ name })}
                                help={
                                    'A simple, human-readable name to use as an identifier for this egg. This is what users see as their game server type.'
                                }
                            />
                            {exists && (
                                <>
                                    <TextField
                                        id={'egg-uuid'}
                                        label={'UUID'}
                                        value={data!.uuid}
                                        disabled
                                        onChange={() => undefined}
                                        help={'The globally unique identifier of this egg, which the daemon uses.'}
                                    />
                                    <TextField
                                        id={'egg-author'}
                                        label={'Author'}
                                        value={data!.author}
                                        disabled
                                        onChange={() => undefined}
                                        help={
                                            'The author of this version of the egg. Uploading a new egg configuration from a different author will change this.'
                                        }
                                    />
                                </>
                            )}
                            <AreaField
                                id={'egg-description'}
                                label={'Description'}
                                rows={exists ? 5 : 8}
                                value={value.description}
                                disabled={!can}
                                onChange={(description) => set({ description })}
                                help={'A description of this egg that is shown throughout the panel as needed.'}
                            />
                            <ToggleField
                                label={'Force outgoing IP'}
                                help={
                                    "Forces all outgoing network traffic to have its source IP NATed to the IP of the server's primary allocation. Required for certain games to work properly when the node has multiple public IP addresses. Enabling this disables internal networking for any servers using this egg, so they can not reach other servers on the same node."
                                }
                                checked={value.force_outgoing_ip}
                                disabled={!can}
                                onChange={(force_outgoing_ip) => set({ force_outgoing_ip })}
                            />
                        </Stack>
                        <Stack>
                            <AreaField
                                id={'egg-images'}
                                label={'Docker images'}
                                rows={4}
                                mono
                                value={value.docker_images}
                                disabled={!can}
                                onChange={(docker_images) => set({ docker_images })}
                                help={
                                    'The docker images available to servers using this egg, one per line. People can choose from the list when there is more than one. Optionally give a display name by putting it first, then a pipe, then the image: Display Name|ghcr.io/my/egg'
                                }
                            />
                            <AreaField
                                id={'egg-startup'}
                                label={'Startup command'}
                                rows={8}
                                mono
                                value={value.startup}
                                disabled={!can}
                                onChange={(startup) => set({ startup })}
                                help={
                                    'The default startup command for new servers using this egg. It can be changed per server.'
                                }
                            />
                            <TextField
                                id={'egg-features'}
                                label={'Features'}
                                value={features}
                                disabled={!can}
                                onChange={setFeatures}
                                help={
                                    'Additional features of the egg, separated by commas or spaces. Useful for configuring additional panel modifications.'
                                }
                            />
                        </Stack>
                    </Columns>
                </SectionCard>

                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Process management'}>
                    <div className={'mb-4'}>
                        <Notice>
                            {exists &&
                                'The following configuration options should not be edited unless you understand how this system works. If wrongly modified it is possible for the daemon to break. '}
                            All fields are required unless you select a separate option from &quot;Copy settings
                            from&quot;, in which case fields may be left blank to use the values from that egg.
                        </Notice>
                    </div>
                    <Columns>
                        <Stack>
                            <SelectField
                                id={'egg-config-from'}
                                label={'Copy settings from'}
                                value={value.config_from}
                                disabled={!can}
                                choices={[
                                    { value: '', label: 'None' },
                                    ...copyFrom.map((o) => ({ value: String(o.id), label: `${o.name} <${o.author}>` })),
                                ]}
                                onChange={(config_from) => set({ config_from })}
                                help={'To default to the settings of another egg, choose it here.'}
                            />
                            <TextField
                                id={'egg-stop'}
                                label={'Stop command'}
                                value={value.config_stop}
                                disabled={!can}
                                onChange={(config_stop) => set({ config_stop })}
                                help={
                                    'The command sent to server processes to stop them gracefully. To send a SIGINT, enter ^C here.'
                                }
                            />
                            <AreaField
                                id={'egg-logs'}
                                label={'Log configuration'}
                                rows={6}
                                mono
                                value={value.config_logs}
                                disabled={!can}
                                onChange={(config_logs) => set({ config_logs })}
                                help={
                                    'A JSON representation of where log files are stored, and whether the daemon should create custom logs.'
                                }
                            />
                        </Stack>
                        <Stack>
                            <AreaField
                                id={'egg-files'}
                                label={'Configuration files'}
                                rows={6}
                                mono
                                value={value.config_files}
                                disabled={!can}
                                onChange={(config_files) => set({ config_files })}
                                help={
                                    'A JSON representation of configuration files to modify and what parts should be changed.'
                                }
                            />
                            <AreaField
                                id={'egg-start-config'}
                                label={'Start configuration'}
                                rows={6}
                                mono
                                value={value.config_startup}
                                disabled={!can}
                                onChange={(config_startup) => set({ config_startup })}
                                help={
                                    'A JSON representation of what values the daemon should look for when booting a server to know it is done.'
                                }
                            />
                        </Stack>
                    </Columns>
                    <div className={'mt-6 flex flex-wrap justify-between gap-3'}>
                        {exists && admin.can('eggs.delete') ? (
                            <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                                Delete egg
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        <div className={'flex gap-3'}>
                            {exists && admin.can('eggs.export') && (
                                <a href={`/admin/nests/egg/${data!.id}/export`}>
                                    <Button.Text>
                                        <DownloadIcon className={'-ml-1 mr-2 h-4 w-4'} />
                                        Export
                                    </Button.Text>
                                </a>
                            )}
                            {can && (
                                <Button onClick={save} disabled={busy || !value.name.trim()}>
                                    {exists ? 'Save' : 'Create'}
                                </Button>
                            )}
                        </div>
                    </div>
                </SectionCard>
            </div>
            {exists && (
                <Dialog.Confirm
                    open={deleting}
                    title={`Delete ${data!.name}?`}
                    confirm={'Delete'}
                    onConfirmed={remove}
                    onClose={() => setDeleting(false)}
                >
                    An egg can only be deleted when no server uses it and no other egg copies its settings.
                </Dialog.Confirm>
            )}
        </AdminPage>
    );
};
