import React from 'react';
import { useParams } from 'react-router-dom';
import {
    CheckCircleIcon,
    ChipIcon,
    ClockIcon,
    CollectionIcon,
    CubeIcon,
    DatabaseIcon,
    FingerPrintIcon,
    GlobeAltIcon,
    HashtagIcon,
    InformationCircleIcon,
    LightningBoltIcon,
    LinkIcon,
    ServerIcon,
    UserIcon,
    TagIcon,
    ViewGridIcon,
} from '@heroicons/react/solid';
import StatCard from '@/components/admin/StatCard';
import Fact from '@/components/admin/Fact';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import AdminLink from '@/components/admin/AdminLink';
import { Pill } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { useServer } from '@/api/admin/servers';

const limit = (value: number, unit = ' MiB') => (value === 0 ? 'Unlimited' : `${value}${unit}`);

/** Admin > Servers > one server: what it is, how it is set up, and who has it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error } = useServer(id);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const state = { active: 'Active', installing: 'Installing', suspended: 'Suspended' }[data.state];

    return (
        <ServerFrame server={data} subtitle={data.description}>
            <div className={'grid grid-cols-2 gap-4 lg:grid-cols-4'}>
                <StatCard title={'Status'} icon={CheckCircleIcon} value={state} />
                <StatCard title={'CPU limit'} icon={ChipIcon} value={data.cpu === 0 ? '∞' : `${data.cpu}%`} />
                <StatCard
                    title={'Memory'}
                    icon={LightningBoltIcon}
                    value={data.memory === 0 ? '∞' : `${data.memory} MiB`}
                />
                <StatCard title={'Disk space'} icon={DatabaseIcon} value={data.disk === 0 ? '∞' : `${data.disk} MiB`} />
            </div>
            <div className={'mt-4 grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<InformationCircleIcon className={'h-5 w-5'} />}
                    title={'Information'}
                >
                    <dl className={'divide-y divide-neutral-500'}>
                        <Fact label={'Internal identifier'} icon={HashtagIcon}>
                            {data.id}
                        </Fact>
                        <Fact label={'External identifier'} icon={LinkIcon}>
                            {data.external_id ?? 'Not set'}
                        </Fact>
                        <Fact label={'UUID / Docker container ID'} icon={FingerPrintIcon}>
                            <code className={'text-xs'}>{data.uuid}</code>
                        </Fact>
                        <Fact label={'Current egg'} icon={CubeIcon}>
                            <AdminLink to={`/admin/nests/view/${data.nest.id}`}>{data.nest.name}</AdminLink> ::{' '}
                            <AdminLink to={`/admin/nests/egg/${data.egg.id}`}>{data.egg.name}</AdminLink>
                        </Fact>
                        <Fact label={'Server name'} icon={TagIcon}>
                            {data.name}
                        </Fact>
                        <Fact label={'CPU limit'} icon={ChipIcon}>
                            {limit(data.cpu, '%').replace('Unlimited', 'Unlimited')}
                        </Fact>
                        <Fact label={'CPU pinning'} icon={ViewGridIcon}>
                            {data.threads || 'Not set'}
                        </Fact>
                        <Fact label={'Memory / swap'} icon={LightningBoltIcon}>
                            {limit(data.memory)} /{' '}
                            {data.swap === 0 ? 'Not set' : data.swap === -1 ? 'Unlimited' : `${data.swap} MiB`}
                        </Fact>
                        <Fact label={'Disk space'} icon={DatabaseIcon}>
                            {limit(data.disk)}
                        </Fact>
                        <Fact label={'Block IO weight'} icon={ClockIcon}>
                            {data.io}
                        </Fact>
                        <Fact label={'Default connection'} icon={GlobeAltIcon}>
                            {data.allocation && (
                                <code className={'text-xs'}>
                                    {data.allocation.ip}:{data.allocation.port}
                                </code>
                            )}
                        </Fact>
                        <Fact label={'Connection alias'} icon={CollectionIcon}>
                            {data.allocation?.has_alias ? (
                                <code className={'text-xs'}>
                                    {data.allocation.alias}:{data.allocation.port}
                                </code>
                            ) : (
                                'No alias assigned'
                            )}
                        </Fact>
                    </dl>
                </SectionCard>
                <div className={'space-y-4'}>
                    <AdminLink to={`/admin/users/view/${data.owner.id}`} className={'block'}>
                        <StatCard
                            title={'Server owner'}
                            icon={UserIcon}
                            value={data.owner.username}
                            sub={data.owner.email}
                        />
                    </AdminLink>
                    <AdminLink to={`/admin/nodes/view/${data.node.id}`} className={'block'}>
                        <StatCard title={'Node'} icon={ServerIcon} value={data.node.name} />
                    </AdminLink>
                    {data.allocation && (
                        <StatCard
                            title={'Connection'}
                            icon={GlobeAltIcon}
                            value={`${data.allocation.alias}:${data.allocation.port}`}
                        />
                    )}
                    {data.state === 'suspended' && <Pill tone={'yellow'}>Suspended</Pill>}
                </div>
            </div>
        </ServerFrame>
    );
};
