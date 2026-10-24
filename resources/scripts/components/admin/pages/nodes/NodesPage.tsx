import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
    CloudDownloadIcon,
    EyeIcon,
    EyeOffIcon,
    HeartIcon,
    LockClosedIcon,
    LockOpenIcon,
    PlusIcon,
    SearchIcon,
    ServerIcon,
    ExclamationIcon,
} from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { NodeRow, updateAllWings, useNodes, useSystemInformation } from '@/api/admin/nodes';

/** Whether Wings on a node answers, and which version it is (asked again every few seconds). */
const Health = ({ node, latest }: { node: NodeRow; latest: string | null }) => {
    const { data } = useSystemInformation(node.id);
    const old = latest && data?.version && data.version.replace(/^v/, '') !== latest;

    return (
        <>
            <Cell>
                <span title={data ? (data.online ? `Wings ${data.version}` : data.error) : 'Asking...'}>
                    <HeartIcon
                        className={`h-4 w-4 ${
                            data ? (data.online ? 'text-green-600' : 'text-red-500') : 'text-neutral-400'
                        }`}
                    />
                </span>
            </Cell>
            <Cell className={'text-neutral-300'}>
                {data?.online ? data.version : '—'}{' '}
                {old && (
                    <span title={`Newest is ${latest}`}>
                        <Pill tone={'yellow'}>old</Pill>
                    </span>
                )}
            </Cell>
        </>
    );
};

/** Admin > Nodes: the machines servers run on. */
export default () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const { data, error } = useNodes(search, page);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [updating, setUpdating] = useState(false);
    const [running, setRunning] = useState(false);

    const updateAll = () => {
        clearFlashes('admin');
        setRunning(true);
        updateAllWings()
            .then(({ results }) =>
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: results.map((r) => `${r.name}: ${r.message}`).join(' ') || 'There are no nodes.',
                })
            )
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => {
                setRunning(false);
                setUpdating(false);
            });
    };

    return (
        <AdminPage title={'Nodes'} subtitle={'All nodes available on the system.'}>
            <ListHeader
                icon={<ServerIcon className={'h-6 w-6'} />}
                title={'Node list'}
                count={data ? String(data.pagination.total) : undefined}
            >
                <div className={'relative'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400'
                        }
                    />
                    <Input
                        type={'search'}
                        value={search}
                        placeholder={'Search nodes'}
                        aria-label={'Search nodes'}
                        style={{ paddingLeft: '2.25rem' }}
                        onChange={(e) => {
                            setSearch(e.currentTarget.value);
                            setPage(1);
                        }}
                    />
                </div>
                {data?.wings_latest && admin.can('nodes.software') && (
                    <Button.Text onClick={() => setUpdating(true)} title={`Newest Wings is ${data.wings_latest}`}>
                        <CloudDownloadIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Update Wings
                    </Button.Text>
                )}
                {admin.can('nodes.create') && (
                    <Button onClick={() => history.push('/admin/nodes/new')}>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The nodes could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.nodes.length === 0 ? (
                    <Empty>{search ? 'No node matches that.' : 'There are no nodes yet.'}</Empty>
                ) : (
                    <AdminTable heads={['', 'Name', 'Location', 'Memory', 'Disk', 'Wings', 'Servers', 'SSL', 'Public']}>
                        {data.nodes.map((node) => (
                            <Row key={node.id} onClick={() => history.push(`/admin/nodes/view/${node.id}`)}>
                                <Health node={node} latest={data.wings_latest} />
                                <Cell className={'font-medium text-neutral-50'}>
                                    {node.maintenance && (
                                        <span title={'Maintenance'}>
                                            <ExclamationIcon
                                                className={'-mt-0.5 mr-1 inline h-4 w-4 text-yellow-500'}
                                            />
                                        </span>
                                    )}
                                    {node.name}
                                </Cell>
                                <Cell>{node.location}</Cell>
                                <Cell>{node.memory} MiB</Cell>
                                <Cell>{node.disk} MiB</Cell>
                                <Cell>{node.servers}</Cell>
                                <Cell>
                                    {node.secure ? (
                                        <LockClosedIcon className={'h-4 w-4 text-green-600'} title={'https'} />
                                    ) : (
                                        <LockOpenIcon className={'h-4 w-4 text-red-500'} title={'http'} />
                                    )}
                                </Cell>
                                <Cell>
                                    {node.public ? (
                                        <EyeIcon className={'h-4 w-4'} />
                                    ) : (
                                        <EyeOffIcon className={'h-4 w-4'} />
                                    )}
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
            {data && <PaginationFooter pagination={data.pagination} onPageSelect={setPage} className={'mt-3'} />}
            <Dialog.Confirm
                open={updating}
                title={'Update every node?'}
                confirm={running ? 'Updating...' : 'Update'}
                onConfirmed={updateAll}
                onClose={() => !running && setUpdating(false)}
            >
                Each node downloads the newest Wings, checks it and restarts Wings. Servers keep running.
            </Dialog.Confirm>
        </AdminPage>
    );
};
