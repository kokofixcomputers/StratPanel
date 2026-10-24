import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
    ChartBarIcon,
    ChipIcon,
    CloudDownloadIcon,
    DesktopComputerIcon,
    DocumentTextIcon,
    ExclamationCircleIcon,
    GlobeAltIcon,
    InformationCircleIcon,
    ServerIcon,
    TagIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import Fact from '@/components/admin/Fact';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import { Meter, Pill } from '@/components/admin/AdminTable';
import { Notice } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { deleteNode, updateWings, useNode, useSystemInformation } from '@/api/admin/nodes';

/** Admin > Nodes > one node: what Wings says, how full the node is, and deleting it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error } = useNode(id);
    const { data: system } = useSystemInformation(id);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [deleting, setDeleting] = useState(false);
    const [updating, setUpdating] = useState(false);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const remove = () => {
        clearFlashes('admin');
        deleteNode(data.id)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The node was deleted.' });
                history.push('/admin/nodes');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });
    };

    const update = () => {
        clearFlashes('admin');
        updateWings(data.id)
            .then((r) => addFlash({ key: 'admin', type: 'success', message: r.message }))
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setUpdating(false));
    };

    const behind = data.wings_latest && system?.version && system.version.replace(/^v/, '') !== data.wings_latest;

    return (
        <NodeFrame id={data.id} name={data.name} subtitle={data.location.long}>
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <div className={'space-y-4 lg:col-span-2'}>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Information'}>
                        <dl className={'divide-y divide-neutral-500'}>
                            <Fact label={'Daemon version'} icon={TagIcon}>
                                {system?.online ? (
                                    system.version
                                ) : (
                                    <Pill tone={'red'}>{system ? 'Offline' : 'Asking...'}</Pill>
                                )}{' '}
                                {data.wings_latest && (
                                    <span className={'text-xs text-neutral-400'}>(latest: {data.wings_latest})</span>
                                )}{' '}
                                {behind && admin.can('nodes.software') && (
                                    <Button.Text onClick={() => setUpdating(true)}>
                                        <CloudDownloadIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                        Update Wings
                                    </Button.Text>
                                )}
                            </Fact>
                            {system?.online && system.system && (
                                <>
                                    <Fact label={'System information'} icon={DesktopComputerIcon}>
                                        {system.system.type} ({system.system.arch}) {system.system.release}
                                    </Fact>
                                    <Fact label={'Total CPU threads'} icon={ChipIcon}>
                                        {system.system.cpus}
                                    </Fact>
                                </>
                            )}
                            {system && !system.online && (
                                <Fact label={'Error'} icon={ExclamationCircleIcon}>
                                    <span className={'text-red-600'}>{system.error}</span>
                                </Fact>
                            )}
                            <Fact label={'Address'} icon={GlobeAltIcon}>
                                <code className={'text-xs'}>
                                    {data.scheme}://{data.fqdn}:{data.daemonListen}
                                </code>
                            </Fact>
                            {data.description && (
                                <Fact label={'Description'} icon={DocumentTextIcon}>
                                    {data.description}
                                </Fact>
                            )}
                        </dl>
                    </SectionCard>
                    {admin.can('nodes.delete') && (
                        <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Delete node'}>
                            <p className={'text-sm text-neutral-200'}>
                                Deleting a node is irreversible and immediately removes it from the panel. There must be
                                no servers on this node to continue.
                            </p>
                            <div className={'mt-4'}>
                                <Button.Danger onClick={() => setDeleting(true)} disabled={data.servers > 0}>
                                    {data.servers > 0
                                        ? `${data.servers} ${data.servers === 1 ? 'server is' : 'servers are'} on it`
                                        : 'Yes, delete this node'}
                                </Button.Danger>
                            </div>
                        </SectionCard>
                    )}
                </div>
                <SectionCard icon={<ChartBarIcon className={'h-5 w-5'} />} title={'At a glance'}>
                    <div className={'space-y-4'}>
                        {data.maintenance_mode && <Notice>This node is under maintenance.</Notice>}
                        {(['disk', 'memory'] as const).map((key) => (
                            <div key={key}>
                                <div className={'mb-1 flex justify-between text-sm'}>
                                    <span className={'text-neutral-300'}>
                                        {key === 'disk' ? 'Disk space allocated' : 'Memory allocated'}
                                    </span>
                                    <span className={'text-neutral-100'}>
                                        {data.usage[key].value.toLocaleString()} /{' '}
                                        {data.usage[key].max.toLocaleString()} MiB
                                    </span>
                                </div>
                                <Meter percent={data.usage[key].percent} level={data.usage[key].level} />
                            </div>
                        ))}
                        <Fact label={'Total servers'} icon={ServerIcon}>
                            {data.servers}
                        </Fact>
                    </div>
                </SectionCard>
            </div>
            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.name}?`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                This can not be undone.
            </Dialog.Confirm>
            <Dialog.Confirm
                open={updating}
                title={`Update Wings on ${data.name}?`}
                confirm={'Update'}
                onConfirmed={update}
                onClose={() => setUpdating(false)}
            >
                The node downloads the newest Wings, checks it and restarts Wings. Servers keep running.
            </Dialog.Confirm>
        </NodeFrame>
    );
};
