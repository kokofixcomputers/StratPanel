import React, { useEffect, useState } from 'react';
import { GlobeAltIcon, InformationCircleIcon, ServerIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { deleteSetting, saveSetting, Tunnels, useSetting } from '@/api/admin/settings';

interface Form {
    enabled: boolean;
    provider: string;
    token: string;
    clear_token: boolean;
    max: string;
    // A token for a node, empty keeps the one it has.
    nodes: Record<number, string>;
}

const TOKEN_HELP: Record<string, React.ReactNode> = {
    ngrok: (
        <>
            From dashboard.ngrok.com, under Your Authtoken. TCP tunnels need an ngrok account with a verified payment
            method, the free plan works once that is set.
        </>
    ),
    pinggy: (
        <>
            From dashboard.pinggy.io. It can stay empty to use Pinggy without an account, check what your Pinggy plan
            allows for TCP tunnels.
        </>
    ),
    playit: (
        <>
            The secret key of an agent, from playit.gg (Agents). The playit package, which has <code>playitd</code>, has
            to be installed on every node that opens tunnels.
        </>
    ),
};

const NODE_HELP: Record<string, string> = {
    ngrok: 'A free ngrok account lets one agent be online at a time. A node with its own account (and so its own token) opens tunnels next to the other nodes; a node without one uses the token above.',
    pinggy: 'A node with its own Pinggy token uses it, a node without one uses the token above.',
    playit: 'A node with its own agent secret key uses it, a node without one uses the key above. Every agent has its own tunnels on the account.',
};

/** Admin > Settings > Tunnels: opening servers to the internet through ngrok, Pinggy or playit.gg, without port forwarding. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.tunnels.update');
    const { data, mutate } = useSetting<Tunnels>('tunnels', { refreshInterval: 5000 });
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<Form | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data && !form)
            setForm({
                enabled: data.enabled,
                provider: data.provider,
                token: '',
                clear_token: false,
                max: String(data.max),
                nodes: {},
            });
    }, [data]);

    const set = (changes: Partial<Form>) => setForm((f) => (f ? { ...f, ...changes } : f));

    const run = (work: Promise<unknown>, done: string) => {
        clearFlashes('admin');
        setBusy(true);

        return work
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: done });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const save = () => {
        if (!form) return;
        run(
            saveSetting('tunnels', {
                enabled: form.enabled,
                provider: form.provider,
                token: form.token,
                clear_token: form.clear_token,
                max: Number(form.max) || 1,
                node_tokens: Object.entries(form.nodes)
                    .filter(([, token]) => token !== '')
                    .map(([id, token]) => ({ id: Number(id), token })),
            }),
            'Tunnel settings were saved.'
        ).then(() => setForm(null));
    };

    return (
        <SettingsFrame
            title={'Tunnels'}
            subtitle={
                'Let people open their servers to the internet through ngrok, Pinggy or playit.gg, without port forwarding.'
            }
        >
            {!data || !form ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        <SectionCard icon={<GlobeAltIcon className={'h-5 w-5'} />} title={'Tunnel service'}>
                            <Stack>
                                <ToggleField
                                    label={'Let people open tunnels'}
                                    help={
                                        'Off by default. When it is on, the owner of a server can open one of its ports to the internet from the Network tab with one click, and gets an address to give to players.'
                                    }
                                    checked={form.enabled}
                                    disabled={!can}
                                    onChange={(enabled) => set({ enabled })}
                                />
                                <SelectField
                                    id={'tunnel-provider'}
                                    label={'Service'}
                                    value={form.provider}
                                    disabled={!can}
                                    choices={data.providers.map((p) => ({ value: p.id, label: p.name }))}
                                    help={
                                        'Changing it closes every tunnel and opens them again through the new service, with its token.'
                                    }
                                    onChange={(provider) => set({ provider })}
                                />
                                <TextField
                                    id={'tunnel-token'}
                                    type={'password'}
                                    label={data.providers.find((p) => p.id === form.provider)?.token ?? 'Token'}
                                    value={form.token}
                                    autoComplete={'new-password'}
                                    disabled={!can}
                                    placeholder={data.token_set ? 'Saved, leave empty to keep it' : ''}
                                    help={TOKEN_HELP[form.provider]}
                                    onChange={(token) => set({ token, clear_token: false })}
                                />
                                {data.token_set && can && (
                                    <ToggleField
                                        label={'Remove the saved token'}
                                        checked={form.clear_token}
                                        onChange={(clear_token) => set({ clear_token, token: '' })}
                                    />
                                )}
                                <Columns>
                                    <TextField
                                        id={'tunnel-max'}
                                        type={'number'}
                                        label={'Tunnels for each server'}
                                        value={form.max}
                                        disabled={!can}
                                        help={'How many ports of one server can be open at once.'}
                                        onChange={(max) => set({ max })}
                                    />
                                </Columns>
                            </Stack>
                            {data.token_set === false &&
                                form.enabled &&
                                data.providers.find((p) => p.id === form.provider)?.required && (
                                    <div className={'mt-4'}>
                                        <Notice>Tunnels stay off until a token is saved.</Notice>
                                    </div>
                                )}
                            {can && (
                                <div className={'mt-6 flex justify-end'}>
                                    <Button disabled={busy} onClick={save}>
                                        Save
                                    </Button>
                                </div>
                            )}
                        </SectionCard>
                        <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Tokens of nodes'}>
                            <p className={'mb-4 text-sm text-neutral-300'}>{NODE_HELP[form.provider]}</p>
                            <Stack>
                                {data.nodes.map((node) => (
                                    <TextField
                                        key={node.id}
                                        id={`tunnel-node-${node.id}`}
                                        type={'password'}
                                        label={node.name}
                                        value={form.nodes[node.id] ?? ''}
                                        autoComplete={'new-password'}
                                        disabled={!can}
                                        placeholder={node.has_token ? 'Its own token is saved' : 'Uses the token above'}
                                        onChange={(token) => set({ nodes: { ...form.nodes, [node.id]: token } })}
                                    />
                                ))}
                            </Stack>
                        </SectionCard>
                        <SectionCard icon={<GlobeAltIcon className={'h-5 w-5'} />} title={'Open tunnels'}>
                            {data.tunnels.length === 0 ? (
                                <Empty>No tunnels are open.</Empty>
                            ) : (
                                <AdminTable heads={['Server', 'Node', 'Port', 'Address', null]}>
                                    {data.tunnels.map((t) => (
                                        <Row key={t.id}>
                                            <Cell className={'font-medium text-neutral-50'}>{t.server}</Cell>
                                            <Cell>{t.node}</Cell>
                                            <Cell>{t.port}</Cell>
                                            <Cell>
                                                {t.status === 'active' ? (
                                                    <span className={'font-mono text-xs'}>{t.address}</span>
                                                ) : t.status === 'pending' ? (
                                                    <Pill tone={'yellow'}>Opening</Pill>
                                                ) : (
                                                    <span title={t.error || ''}>
                                                        <Pill tone={'red'}>Failed</Pill>
                                                    </span>
                                                )}
                                            </Cell>
                                            <Cell>
                                                {can && (
                                                    <Button.Danger
                                                        size={Button.Sizes.Small}
                                                        variant={Button.Variants.Secondary}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            run(
                                                                deleteSetting(`tunnels/${t.id}`),
                                                                'The tunnel was closed.'
                                                            )
                                                        }
                                                    >
                                                        Close
                                                    </Button.Danger>
                                                )}
                                            </Cell>
                                        </Row>
                                    ))}
                                </AdminTable>
                            )}
                        </SectionCard>
                    </div>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                        <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                            <li>
                                {form.provider === 'ngrok' &&
                                    'The node opens the tunnel: Wings has the ngrok agent built in, nothing is installed on the machine.'}
                                {form.provider === 'pinggy' &&
                                    'The node opens the tunnel: Wings connects to Pinggy over SSH, nothing is installed on the machine.'}
                                {form.provider === 'playit' &&
                                    'The node makes the tunnel on your playit.gg account and runs playitd while a tunnel is open: install the playit package on every node.'}{' '}
                                Nodes need the Stratosphere Wings of this release.
                            </li>
                            <li>
                                Players connect through the service, so there is a little more delay than a port that is
                                forwarded. The address is on the Network tab and in the connection menu of the server.
                            </li>
                            <li>
                                Minecraft Java (TCP) is what is tunnelled. Bedrock (UDP) and voice chat plugins that
                                need UDP are not.
                            </li>
                            <li>
                                The address of a free plan can change when the tunnel is opened again, for example when
                                the node restarts. The new one shows up by itself.
                            </li>
                            <li>Turning tunnels off, or closing one here, closes it on the node within a moment.</li>
                        </ul>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
