import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon, ViewListIcon } from '@heroicons/react/solid';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { SelectField, Stack, TextField } from '@/components/admin/forms';
import Input from '@/components/elements/Input';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import {
    addAllocations,
    Allocation,
    removeAllocation,
    removeAllocations,
    removeBlock,
    setAlias,
    useAllocations,
    useNode,
} from '@/api/admin/nodes';

/** The alias of an allocation: saved shortly after the typing stops, the way the old page did. */
const Alias = ({ nodeId, allocation, disabled }: { nodeId: number; allocation: Allocation; disabled: boolean }) => {
    const [value, setValue] = useState(allocation.ip_alias ?? '');
    const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

    useEffect(() => {
        if (value === (allocation.ip_alias ?? '')) return;
        setState('saving');
        const timer = setTimeout(
            () =>
                setAlias(nodeId, allocation.id, value)
                    .then(() => setState('saved'))
                    .catch(() => setState('failed')),
            250
        );

        return () => clearTimeout(timer);
    }, [value]);

    return (
        <Input
            value={value}
            placeholder={'none'}
            disabled={disabled}
            aria-label={`Alias of ${allocation.ip}:${allocation.port}`}
            className={state === 'failed' ? 'border-red-500' : state === 'saved' ? 'border-green-500' : undefined}
            onChange={(e) => setValue(e.currentTarget.value)}
        />
    );
};

/** Admin > Nodes > one node > Allocation: the addresses and ports servers can be given. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const [page, setPage] = useState(1);
    const { data: node } = useNode(id);
    const { data, error, mutate } = useAllocations(id, page);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [chosen, setChosen] = useState<number[]>([]);
    const [fresh, setFresh] = useState({ ip: '', alias: '', ports: '' });
    const [block, setBlock] = useState<string | null>(null);
    const [removing, setRemoving] = useState<Allocation | null>(null);
    const [bulk, setBulk] = useState(false);
    const [busy, setBusy] = useState(false);
    const can = admin.can('nodes.allocations');

    if (!node || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then(() => {
            addFlash({ key: 'admin', type: 'success', message });
            setChosen([]);

            return mutate();
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => {
                setBusy(false);
                setRemoving(null);
                setBulk(false);
                setBlock(null);
            });
    };

    const freeOnes = data.allocations.filter((a) => !a.server).map((a) => a.id);

    return (
        <NodeFrame
            id={node.id}
            name={node.name}
            subtitle={'Control the allocations available to servers on this node.'}
        >
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<ViewListIcon className={'h-5 w-5'} />}
                    title={'Existing allocations'}
                    badge={
                        can && (
                            <div className={'flex gap-2'}>
                                <Button.Text
                                    onClick={() => setChosen(chosen.length === freeOnes.length ? [] : freeOnes)}
                                >
                                    {chosen.length === freeOnes.length && freeOnes.length > 0
                                        ? 'Clear'
                                        : 'Select all free'}
                                </Button.Text>
                                <Button.Danger
                                    variant={Button.Variants.Secondary}
                                    disabled={chosen.length === 0}
                                    onClick={() => setBulk(true)}
                                >
                                    Delete {chosen.length > 0 ? chosen.length : ''}
                                </Button.Danger>
                            </div>
                        )
                    }
                >
                    {data.allocations.length === 0 ? (
                        <Empty>There are no allocations on this node yet.</Empty>
                    ) : (
                        <AdminTable heads={['', 'IP address', 'IP alias', 'Port', 'Assigned to', null]}>
                            {data.allocations.map((allocation) => (
                                <Row key={allocation.id}>
                                    <Cell>
                                        <input
                                            type={'checkbox'}
                                            className={'form-input'}
                                            disabled={!!allocation.server || !can}
                                            checked={chosen.includes(allocation.id)}
                                            aria-label={`Select ${allocation.ip}:${allocation.port}`}
                                            onChange={(e) =>
                                                setChosen(
                                                    e.currentTarget.checked
                                                        ? [...chosen, allocation.id]
                                                        : chosen.filter((c) => c !== allocation.id)
                                                )
                                            }
                                        />
                                    </Cell>
                                    <Cell>
                                        <code className={'text-xs'}>{allocation.ip}</code>
                                    </Cell>
                                    <Cell>
                                        <Alias nodeId={node.id} allocation={allocation} disabled={!can} />
                                    </Cell>
                                    <Cell>{allocation.port}</Cell>
                                    <Cell>
                                        {allocation.server && (
                                            <AdminLink to={`/admin/servers/view/${allocation.server.id}`}>
                                                {allocation.server.name}
                                            </AdminLink>
                                        )}
                                    </Cell>
                                    <Cell>
                                        {can && !allocation.server && (
                                            <button
                                                type={'button'}
                                                title={'Delete'}
                                                className={'text-red-500 hover:text-red-600'}
                                                onClick={() => setRemoving(allocation)}
                                            >
                                                <TrashIcon className={'h-4 w-4'} />
                                            </button>
                                        )}
                                    </Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                    <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-3'} />
                </SectionCard>

                {can && (
                    <SectionCard icon={<PlusIcon className={'h-5 w-5'} />} title={'Assign new allocations'}>
                        <Stack>
                            <TextField
                                id={'alloc-ip'}
                                label={'IP address'}
                                value={fresh.ip}
                                placeholder={data.ips[0] ?? '203.0.113.5'}
                                onChange={(ip) => setFresh({ ...fresh, ip })}
                                help={
                                    data.ips.length > 0
                                        ? `The IP address to assign ports to (one that is used here: ${data.ips.join(
                                              ', '
                                          )}). A CIDR block adds every address in it.`
                                        : 'The IP address to assign ports to. A CIDR block adds every address in it.'
                                }
                            />
                            <TextField
                                id={'alloc-alias'}
                                label={'IP alias'}
                                value={fresh.alias}
                                onChange={(alias) => setFresh({ ...fresh, alias })}
                                help={'If you want to give these allocations a default alias, enter it here.'}
                            />
                            <TextField
                                id={'alloc-ports'}
                                label={'Ports'}
                                value={fresh.ports}
                                placeholder={'25565, 25570-25580'}
                                onChange={(ports) => setFresh({ ...fresh, ports })}
                                help={'Single ports or port ranges, separated by commas or spaces.'}
                            />
                            <div className={'flex justify-between gap-3'}>
                                {data.ips.length > 0 && (
                                    <Button.Danger
                                        variant={Button.Variants.Secondary}
                                        onClick={() => setBlock(data.ips[0])}
                                    >
                                        Delete an IP block
                                    </Button.Danger>
                                )}
                                <Button
                                    disabled={busy || !fresh.ip.trim() || !fresh.ports.trim()}
                                    onClick={() =>
                                        run(
                                            addAllocations(node.id, {
                                                allocation_ip: fresh.ip.trim(),
                                                allocation_alias: fresh.alias.trim(),
                                                allocation_ports: fresh.ports.split(/[,\s]+/).filter((p) => p !== ''),
                                            }).then(() => setFresh({ ip: '', alias: '', ports: '' })),
                                            'The allocations were added.'
                                        )
                                    }
                                >
                                    Submit
                                </Button>
                            </div>
                        </Stack>
                    </SectionCard>
                )}
            </div>

            <Dialog.Confirm
                open={!!removing}
                title={'Delete this allocation?'}
                confirm={'Delete'}
                onConfirmed={() =>
                    removing && run(removeAllocation(node.id, removing.id), 'The allocation was deleted.')
                }
                onClose={() => setRemoving(null)}
            >
                {removing && `${removing.ip}:${removing.port}`}
            </Dialog.Confirm>
            <Dialog.Confirm
                open={bulk}
                title={`Delete ${chosen.length} allocations?`}
                confirm={'Delete'}
                onConfirmed={() => run(removeAllocations(node.id, chosen), 'The allocations were deleted.')}
                onClose={() => setBulk(false)}
            >
                Only allocations that no server uses can be deleted.
            </Dialog.Confirm>
            <Dialog open={block !== null} onClose={() => setBlock(null)} title={'Delete the allocations of an IP'}>
                <SelectField
                    id={'alloc-block'}
                    label={'IP address'}
                    value={block ?? ''}
                    choices={data.ips.map((ip) => ({ value: ip, label: ip }))}
                    onChange={setBlock}
                    help={'Every allocation of this address that no server uses is deleted.'}
                />
                <Dialog.Footer>
                    <Button.Text onClick={() => setBlock(null)}>Close</Button.Text>
                    <Button.Danger
                        disabled={busy}
                        onClick={() =>
                            block &&
                            run(removeBlock(node.id, block), `The unused allocations of ${block} were deleted.`)
                        }
                    >
                        Delete allocations
                    </Button.Danger>
                </Dialog.Footer>
            </Dialog>
        </NodeFrame>
    );
};
