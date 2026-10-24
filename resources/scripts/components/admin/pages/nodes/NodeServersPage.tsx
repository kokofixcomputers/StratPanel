import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ServerIcon } from '@heroicons/react/solid';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import { useNode, useNodeServers } from '@/api/admin/nodes';

/** Admin > Nodes > one node > Servers: the servers that run on it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const [page, setPage] = useState(1);
    const { data: node } = useNode(id);
    const { data, error } = useNodeServers(id, page);
    const history = useHistory();

    if (!node || !data) return error ? null : <Spinner size={'large'} centered />;

    return (
        <NodeFrame id={node.id} name={node.name} subtitle={'All servers currently assigned to this node.'}>
            <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Server list'}>
                {data.servers.length === 0 ? (
                    <Empty>There are no servers on this node.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Server name', 'Owner', 'Service']}>
                        {data.servers.map((server) => (
                            <Row key={server.id} onClick={() => history.push(`/admin/servers/view/${server.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{server.uuid_short}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>
                                    <AdminLink to={`/admin/servers/view/${server.id}`}>{server.name}</AdminLink>
                                </Cell>
                                <Cell>
                                    <AdminLink to={`/admin/users/view/${server.owner.id}`}>
                                        {server.owner.username}
                                    </AdminLink>
                                </Cell>
                                <Cell>
                                    {server.nest} ({server.egg})
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </SectionCard>
            <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-3'} />
        </NodeFrame>
    );
};
