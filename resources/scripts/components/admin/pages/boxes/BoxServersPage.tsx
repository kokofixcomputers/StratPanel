import React from 'react';
import { useParams } from 'react-router-dom';
import { ServerIcon } from '@heroicons/react/solid';
import BoxFrame from '@/components/admin/pages/boxes/BoxFrame';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import Spinner from '@/components/elements/Spinner';
import { useAdminBox } from '@/api/admin/boxes';
import { shareText } from '@/lib/store';

/** Admin > Boxes > one box > Servers: what is in the box, with the share each server has. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, error } = useAdminBox(id);

    if (!box) return error ? null : <Spinner size={'large'} centered />;

    return (
        <BoxFrame box={box} subtitle={'The servers made in this box and how much of it each one has.'}>
            <ListHeader
                icon={<ServerIcon className={'h-6 w-6'} />}
                title={'Servers in this box'}
                count={String(box.servers_list.length)}
            />
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {box.servers_list.length === 0 ? (
                    <Empty>
                        There are no servers in this box yet. {box.owner?.username} makes them from their Boxes page.
                    </Empty>
                ) : (
                    <AdminTable
                        heads={['Server name', 'Node', 'Connection', 'Memory', 'Disk', 'CPU', 'Ports', 'Status', null]}
                    >
                        {box.servers_list.map((server) => (
                            <Row key={server.uuid}>
                                <Cell className={'font-medium text-neutral-50'}>{server.name}</Cell>
                                <Cell>{server.node}</Cell>
                                <Cell className={'font-mono text-xs'}>{server.address}</Cell>
                                <Cell>{shareText('memory', server.limits.memory)}</Cell>
                                <Cell>{shareText('disk', server.limits.disk)}</Cell>
                                <Cell>{server.limits.cpu}%</Cell>
                                <Cell>{server.limits.allocations}</Cell>
                                <Cell>
                                    <Pill
                                        tone={
                                            server.status === 'suspended'
                                                ? 'yellow'
                                                : server.status
                                                ? 'primary'
                                                : 'green'
                                        }
                                    >
                                        {server.status === 'suspended'
                                            ? 'Suspended'
                                            : server.status
                                            ? 'Installing'
                                            : 'Active'}
                                    </Pill>
                                </Cell>
                                <Cell className={'text-right'}>
                                    <AdminLink
                                        to={`/admin/servers/view/${server.admin_id}`}
                                        className={'text-xs font-semibold text-primary-600 hover:underline'}
                                    >
                                        Manage
                                    </AdminLink>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
        </BoxFrame>
    );
};
