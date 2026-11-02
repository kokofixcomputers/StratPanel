import React, { useEffect, useState } from 'react';
import { InformationCircleIcon, LockClosedIcon, ServerIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AdminTable, Cell, Pill, Row } from '@/components/admin/AdminTable';
import { Notice, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { PrivateNetwork, PrivateNetworkNode, saveSetting, useSetting } from '@/api/admin/settings';

interface Form {
    enabled: boolean;
    range: string;
    // By id of the node: whether it takes part, and the UDP port of its tunnel.
    nodes: Record<number, { enabled: boolean; port: string }>;
}

const stateOf = (node: PrivateNetworkNode, on: boolean) => {
    if (!on) return <Pill>Not on it</Pill>;
    if (!node.recent || node.state === null)
        return (
            <span title={'It has not said anything yet. It needs the Wings of this release and a minute to look.'}>
                <Pill tone={'yellow'}>Waiting for the node</Pill>
            </span>
        );
    if (node.state === 'error')
        return (
            <span title={node.message || ''}>
                <Pill tone={'red'}>Problem</Pill>
            </span>
        );

    return <Pill tone={'green'}>{node.state === 'ready' ? 'Working' : 'Off'}</Pill>;
};

/** Admin > Settings > Private network: servers of a person reaching each other on private addresses, between nodes too. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.private.update');
    const { data, mutate } = useSetting<PrivateNetwork>('private-network', { refreshInterval: 5000 });
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<Form | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data && !form)
            setForm({
                enabled: data.enabled,
                range: data.suggested,
                nodes: Object.fromEntries(data.nodes.map((n) => [n.id, { enabled: n.enabled, port: String(n.port) }])),
            });
    }, [data]);

    const save = () => {
        if (!form) return;
        clearFlashes('admin');
        setBusy(true);
        saveSetting('private-network', {
            enabled: form.enabled,
            range: form.range,
            nodes: Object.entries(form.nodes).map(([id, n]) => ({
                id: Number(id),
                enabled: n.enabled,
                port: Number(n.port) || 51820,
            })),
        })
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: form.enabled
                        ? 'The private network is on. The nodes set themselves up within a minute.'
                        : 'The private network is off.',
                });
                setForm(null);

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SettingsFrame
            title={'Private network'}
            subtitle={
                'Let the servers of a person reach each other on private addresses, on every node, without the public internet.'
            }
        >
            {!data || !form ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Private network'}>
                            <Stack>
                                <ToggleField
                                    label={'Turn the private network on'}
                                    help={
                                        'Off by default. When it is on every node that takes part makes an encrypted tunnel to the others by itself, and the owner of a server can join it to the private network from the Network tab with one click.'
                                    }
                                    checked={form.enabled}
                                    disabled={!can}
                                    onChange={(enabled) => setForm({ ...form, enabled })}
                                />
                                <TextField
                                    id={'private-range'}
                                    label={'Range'}
                                    value={form.range}
                                    disabled={!can}
                                    help={
                                        <>
                                            Made for you, leave it or change it. Each node gets a <code>/24</code> out
                                            of it and servers get an address in the slice of their node, so a{' '}
                                            <code>/16</code> serves up to 250 nodes. It has to be a private range (10.x,
                                            172.16-31.x, 192.168.x or 100.64-127.x) that nothing else on your nodes
                                            uses. Changing it later gives every server a new address.
                                        </>
                                    }
                                    onChange={(range) => setForm({ ...form, range })}
                                />
                            </Stack>
                            {form.enabled &&
                                data.nodes.some((n) => form.nodes[n.id]?.enabled && !n.recent) &&
                                data.enabled && (
                                    <div className={'mt-4'}>
                                        <Notice tone={'blue'}>
                                            A node that says nothing yet needs the Stratosphere Wings of this release.
                                            It can take a minute after saving.
                                        </Notice>
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
                        <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Nodes'}>
                            <AdminTable heads={['Node', 'Takes part', 'UDP port', 'Slice', 'State', 'Servers']}>
                                {data.nodes.map((node) => {
                                    const row = form.nodes[node.id] ?? {
                                        enabled: node.enabled,
                                        port: String(node.port),
                                    };

                                    return (
                                        <Row key={node.id}>
                                            <Cell className={'font-medium text-neutral-50'}>
                                                {node.name}
                                                <span className={'block text-xs font-normal text-neutral-400'}>
                                                    {node.fqdn}
                                                </span>
                                            </Cell>
                                            <Cell>
                                                <ToggleField
                                                    label={''}
                                                    checked={row.enabled}
                                                    disabled={!can}
                                                    onChange={(enabled) =>
                                                        setForm({
                                                            ...form,
                                                            nodes: { ...form.nodes, [node.id]: { ...row, enabled } },
                                                        })
                                                    }
                                                />
                                            </Cell>
                                            <Cell>
                                                <input
                                                    aria-label={`UDP port of ${node.name}`}
                                                    type={'number'}
                                                    value={row.port}
                                                    disabled={!can || !row.enabled}
                                                    onChange={(e) =>
                                                        setForm({
                                                            ...form,
                                                            nodes: {
                                                                ...form.nodes,
                                                                [node.id]: { ...row, port: e.currentTarget.value },
                                                            },
                                                        })
                                                    }
                                                    className={
                                                        'w-24 rounded border border-neutral-500 bg-neutral-600 px-2 py-1 text-sm'
                                                    }
                                                />
                                            </Cell>
                                            <Cell>
                                                <span className={'font-mono text-xs'}>
                                                    {data.enabled ? node.subnet ?? '-' : '-'}
                                                </span>
                                            </Cell>
                                            <Cell>{data.enabled ? stateOf(node, row.enabled) : <Pill>Off</Pill>}</Cell>
                                            <Cell>{node.servers}</Cell>
                                        </Row>
                                    );
                                })}
                            </AdminTable>
                        </SectionCard>
                    </div>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                        <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                            <li>
                                Nothing to set up by hand: the nodes make their own keys, the tunnel, the routes and the
                                rules. They need the Stratosphere Wings of this release.
                            </li>
                            <li>
                                Every node has to be reachable by the others on its <b>UDP port</b> (51820 by default)
                                at its address ({'the FQDN of the node'}). The node opens the port in iptables, a cloud
                                firewall has to be told.
                            </li>
                            <li>
                                Only the servers of the same owner reach each other: a server is reached by the other
                                servers of its owner that joined, and by nobody else.
                            </li>
                            <li>
                                A server can only join when its node takes part. The address works from every node, and
                                on the same node it is direct.
                            </li>
                            <li>
                                Turning a node off, or the whole network, takes the tunnel, the network and the rules
                                away from it. Servers stay joined and come back when it is turned on again.
                            </li>
                            <li>{data.joined} servers have joined.</li>
                        </ul>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
