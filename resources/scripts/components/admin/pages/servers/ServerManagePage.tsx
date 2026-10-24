import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useParams } from 'react-router-dom';
import { DownloadIcon, PauseIcon, PlayIcon, RefreshIcon, SwitchHorizontalIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import { CheckList, Notice, SelectField, Stack } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { AllocationOption, freeAllocations, manageAction, useManage, useServer } from '@/api/admin/servers';

/** Admin > Servers > one server > Manage: reinstall, the install status, suspension, export and transfer. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server, mutate: refreshServer } = useServer(id);
    const { data, error, mutate } = useManage(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<null | { title: string; text: string; go: () => void }>(null);
    const [transferring, setTransferring] = useState(false);
    const [node, setNode] = useState('');
    const [free, setFree] = useState<AllocationOption[]>([]);
    const [allocation, setAllocation] = useState('');
    const [additional, setAdditional] = useState<number[]>([]);

    useEffect(() => {
        if (!transferring || !data) return;
        const chosen = node || String(data.locations.flatMap((l) => l.nodes)[0]?.id ?? '');
        if (!chosen) return;
        freeAllocations(chosen)
            .then((list) => {
                setFree(list);
                setAllocation(String(list[0]?.id ?? ''));
                setAdditional(list[1] ? [list[1].id] : []);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    }, [transferring, node]);

    if (!server || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<typeof data>, message: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then((next) => {
            addFlash({ key: 'admin', type: 'success', message });
            refreshServer();

            return mutate(next, false);
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => {
                setBusy(false);
                setConfirm(null);
                setTransferring(false);
            });
    };

    const ask = (title: string, text: string, go: () => void) => setConfirm({ title, text, go });

    return (
        <ServerFrame server={server} subtitle={'Additional actions for this server.'}>
            <div className={'grid gap-4 lg:grid-cols-2'}>
                {admin.can('servers.reinstall') && (
                    <SectionCard icon={<RefreshIcon className={'h-5 w-5'} />} title={'Reinstall server'}>
                        <p className={'mb-4 text-sm text-neutral-200'}>
                            This reinstalls the server with the assigned service scripts. Danger! This could overwrite
                            server data.
                        </p>
                        {!data.can_reinstall ? (
                            <Notice>
                                This server is set to skip its install script. Switch off &quot;Skip egg install
                                script&quot; on the startup page to reinstall it.
                            </Notice>
                        ) : data.installed ? (
                            <Button.Danger
                                disabled={busy}
                                onClick={() =>
                                    ask(
                                        'Reinstall this server?',
                                        'The files of the server may be overwritten by the install script.',
                                        () =>
                                            run(manageAction(data.id, 'reinstall'), 'The server is being reinstalled.')
                                    )
                                }
                            >
                                Reinstall server
                            </Button.Danger>
                        ) : (
                            <Notice>The server must install properly before it can be reinstalled.</Notice>
                        )}
                        <div className={'mt-6 border-t border-neutral-500 pt-4'}>
                            <p className={'mb-3 text-sm text-neutral-200'}>
                                To change the install status from uninstalled to installed, or the other way round, use
                                this button.
                            </p>
                            <Button.Text
                                disabled={busy}
                                onClick={() =>
                                    run(
                                        manageAction(data.id, 'toggle'),
                                        'The install status of the server was toggled.'
                                    )
                                }
                            >
                                Toggle install status
                            </Button.Text>
                        </div>
                    </SectionCard>
                )}

                {admin.can('servers.suspend') && (
                    <SectionCard
                        icon={data.suspended ? <PlayIcon className={'h-5 w-5'} /> : <PauseIcon className={'h-5 w-5'} />}
                        title={data.suspended ? 'Unsuspend server' : 'Suspend server'}
                    >
                        <p className={'mb-4 text-sm text-neutral-200'}>
                            {data.suspended
                                ? 'This unsuspends the server and restores normal user access.'
                                : 'This suspends the server, stops any running processes, and immediately blocks the user from accessing their files or managing the server through the panel or API.'}
                        </p>
                        <Button.Text
                            disabled={busy || (!data.suspended && !!data.transfer)}
                            onClick={() =>
                                run(
                                    manageAction(data.id, 'suspension', {
                                        action: data.suspended ? 'unsuspend' : 'suspend',
                                    }),
                                    data.suspended ? 'The server was unsuspended.' : 'The server was suspended.'
                                )
                            }
                        >
                            {data.suspended ? 'Unsuspend server' : 'Suspend server'}
                        </Button.Text>
                    </SectionCard>
                )}

                <SectionCard icon={<DownloadIcon className={'h-5 w-5'} />} title={'Export server'}>
                    <p className={'mb-4 text-sm text-neutral-200'}>
                        Download this server as a file: its settings, egg, variables and schedules. Choose it on the
                        Create Server page of another panel to make the same server there, then pull the files over with
                        the importer in the Jobs tab.
                    </p>
                    <a href={`/admin/servers/view/${data.id}/export`}>
                        <Button>Export server</Button>
                    </a>
                </SectionCard>

                {admin.can('servers.transfer') && (
                    <SectionCard icon={<SwitchHorizontalIcon className={'h-5 w-5'} />} title={'Transfer server'}>
                        {data.transfer ? (
                            <Notice tone={'blue'}>
                                This server is being transferred to another node. The transfer started{' '}
                                {formatDistanceToNow(new Date(data.transfer.started), { addSuffix: true })}.
                            </Notice>
                        ) : (
                            <>
                                <p className={'mb-2 text-sm text-neutral-200'}>
                                    Transfer this server to another node connected to this panel.
                                </p>
                                <p className={'mb-4 text-sm text-red-600'}>
                                    Warning! This feature has not been fully tested and may have bugs.
                                </p>
                                {data.can_transfer ? (
                                    <Button.Text onClick={() => setTransferring(true)}>Transfer server</Button.Text>
                                ) : (
                                    <Notice>
                                        Transferring a server requires more than one node to be configured on your
                                        panel.
                                    </Notice>
                                )}
                            </>
                        )}
                    </SectionCard>
                )}
            </div>

            <Dialog open={transferring} onClose={() => setTransferring(false)} title={'Transfer server'}>
                <Stack>
                    <SelectField
                        id={'transfer-node'}
                        label={'Node'}
                        value={node || String(data.locations.flatMap((l) => l.nodes)[0]?.id ?? '')}
                        groups={data.locations
                            .filter((l) => l.nodes.length > 0)
                            .map((l) => ({
                                label: `${l.long} (${l.short})`,
                                choices: l.nodes.map((n) => ({ value: String(n.id), label: n.name })),
                            }))}
                        onChange={setNode}
                        help={'The node this server will be transferred to.'}
                    />
                    <SelectField
                        id={'transfer-allocation'}
                        label={'Default allocation'}
                        value={allocation}
                        choices={free.map((a) => ({ value: String(a.id), label: a.text }))}
                        onChange={setAllocation}
                        help={'The main allocation that will be assigned to this server.'}
                    />
                    <div>
                        <p className={'mb-1 text-sm font-medium text-neutral-200'}>Additional allocations</p>
                        <CheckList
                            groups={[
                                {
                                    label: 'Free on that node',
                                    items: free
                                        .filter((a) => String(a.id) !== allocation)
                                        .map((a) => ({ id: a.id, label: a.text })),
                                },
                            ]}
                            selected={additional}
                            onChange={setAdditional}
                            empty={'No other free allocation.'}
                        />
                    </div>
                </Stack>
                <Dialog.Footer>
                    <Button.Text onClick={() => setTransferring(false)}>Cancel</Button.Text>
                    <Button
                        disabled={busy || !allocation}
                        onClick={() =>
                            run(
                                manageAction(data.id, 'transfer', {
                                    node_id: Number(node || data.locations.flatMap((l) => l.nodes)[0]?.id),
                                    allocation_id: Number(allocation),
                                    allocation_additional: additional.filter((a) => String(a) !== allocation),
                                }),
                                'The transfer of the server has started.'
                            )
                        }
                    >
                        Confirm
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog.Confirm
                open={!!confirm}
                title={confirm?.title ?? ''}
                confirm={'Continue'}
                onConfirmed={() => confirm?.go()}
                onClose={() => setConfirm(null)}
            >
                {confirm?.text}
            </Dialog.Confirm>
        </ServerFrame>
    );
};
