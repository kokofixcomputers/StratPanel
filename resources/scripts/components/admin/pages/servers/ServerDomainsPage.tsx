import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { GlobeAltIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { Notice, SelectField, Stack, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { addServerDomain, removeServerDomain, useServer, useServerDomains } from '@/api/admin/servers';

/** Admin > Servers > one server > Domains. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server } = useServer(id);
    const { data, error, mutate } = useServerDomains(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [fresh, setFresh] = useState({ domain: '', allocation_id: '' });
    const [removing, setRemoving] = useState<{ id: number; domain: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.domains');

    if (!server || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<typeof data>, message: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then((next) => {
            addFlash({ key: 'admin', type: 'success', message });

            return mutate(next, false);
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => {
                setBusy(false);
                setRemoving(null);
            });
    };

    const allocation =
        fresh.allocation_id || String(data.allocations.find((a) => a.primary)?.id ?? data.allocations[0]?.id ?? '');

    return (
        <ServerFrame server={server} subtitle={'The domains players use to join this server.'}>
            {!data.enabled && (
                <div className={'mb-4'}>
                    <Notice>Custom domains are turned off for this panel, so new domains can not be added.</Notice>
                </div>
            )}
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<GlobeAltIcon className={'h-5 w-5'} />}
                    title={`Domains ${data.domains.length}${data.max > 0 ? ` / ${data.max}` : ''}`}
                >
                    {data.domains.length === 0 ? (
                        <Empty>This server has no domains yet.</Empty>
                    ) : (
                        <AdminTable heads={['Domain', 'Leads to', 'DNS', null]}>
                            {data.domains.map((domain) => (
                                <Row key={domain.id}>
                                    <Cell className={'font-medium text-neutral-50'}>{domain.domain}</Cell>
                                    <Cell>{domain.leads_to ?? 'allocation removed'}</Cell>
                                    <Cell>
                                        <Pill tone={domain.ready ? 'green' : 'yellow'}>
                                            {domain.ready ? 'Ready' : 'Waiting for DNS'}
                                        </Pill>
                                    </Cell>
                                    <Cell>
                                        {can && (
                                            <button
                                                type={'button'}
                                                title={'Remove'}
                                                className={'text-red-500'}
                                                onClick={() => setRemoving(domain)}
                                            >
                                                <TrashIcon className={'h-4 w-4'} />
                                            </button>
                                        )}
                                    </Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                </SectionCard>
                {can && (
                    <SectionCard icon={<PlusIcon className={'h-5 w-5'} />} title={'Add domain'}>
                        <Stack>
                            <TextField
                                id={'domain-name'}
                                label={'Domain'}
                                value={fresh.domain}
                                placeholder={'play.example.com'}
                                onChange={(domain) => setFresh({ ...fresh, domain })}
                            />
                            <SelectField
                                id={'domain-allocation'}
                                label={'Send players to'}
                                value={allocation}
                                choices={data.allocations.map((a) => ({
                                    value: String(a.id),
                                    label: `${a.text}${a.primary ? ' (primary)' : ''}`,
                                }))}
                                onChange={(allocation_id) => setFresh({ ...fresh, allocation_id })}
                            />
                            <p className={'text-xs text-neutral-400'}>
                                The domain needs an A record pointing to {data.target_ip ?? 'the address of this panel'}
                                , where the Minecraft router is listening. As an administrator you can go over the per
                                server domain limit.
                            </p>
                            <Button
                                disabled={busy || !data.enabled || !fresh.domain.trim()}
                                onClick={() =>
                                    run(
                                        addServerDomain(data.id, {
                                            domain: fresh.domain,
                                            allocation_id: allocation,
                                        }).then((next) => {
                                            setFresh({ domain: '', allocation_id: '' });

                                            return next;
                                        }),
                                        'The domain was added.'
                                    )
                                }
                            >
                                Add domain
                            </Button>
                        </Stack>
                    </SectionCard>
                )}
            </div>
            <Dialog.Confirm
                open={!!removing}
                title={`Remove ${removing?.domain ?? ''}?`}
                confirm={'Remove'}
                onConfirmed={() => removing && run(removeServerDomain(data.id, removing.id), 'The domain was removed.')}
                onClose={() => setRemoving(null)}
            >
                Players will no longer be able to join through it.
            </Dialog.Confirm>
        </ServerFrame>
    );
};
