import React from 'react';
import { useParams } from 'react-router-dom';
import {
    CalendarIcon,
    CheckCircleIcon,
    ChipIcon,
    ClockIcon,
    CubeIcon,
    DatabaseIcon,
    GlobeAltIcon,
    HashtagIcon,
    InformationCircleIcon,
    LightningBoltIcon,
    ServerIcon,
    ShoppingBagIcon,
    TagIcon,
    UserIcon,
} from '@heroicons/react/solid';
import StatCard from '@/components/admin/StatCard';
import Fact from '@/components/admin/Fact';
import AdminLink from '@/components/admin/AdminLink';
import BoxFrame from '@/components/admin/pages/boxes/BoxFrame';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import BoxMeters from '@/components/dashboard/boxes/BoxMeters';
import { useAdminBox } from '@/api/admin/boxes';
import { shareText } from '@/lib/store';

const STATE = { active: 'Active', suspended: 'Suspended', expired: 'Expired' };

/** Admin > Boxes > one box: what it is, what it holds and who has it. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, error } = useAdminBox(id);

    if (!box) return error ? null : <Spinner size={'large'} centered />;

    return (
        <BoxFrame box={box} subtitle={box.notes || undefined}>
            <div className={'grid grid-cols-2 gap-4 lg:grid-cols-4'}>
                <StatCard title={'Status'} icon={CheckCircleIcon} value={STATE[box.status]} />
                <StatCard title={'Memory'} icon={LightningBoltIcon} value={shareText('memory', box.limits.memory)} />
                <StatCard title={'Disk space'} icon={DatabaseIcon} value={shareText('disk', box.limits.disk)} />
                <StatCard title={'CPU limit'} icon={ChipIcon} value={`${box.limits.cpu}%`} />
            </div>
            <div className={'mt-4 grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<InformationCircleIcon className={'h-5 w-5'} />}
                    title={'Information'}
                >
                    <dl className={'divide-y divide-neutral-500'}>
                        <Fact label={'Internal identifier'} icon={HashtagIcon}>
                            {box.admin_id}
                        </Fact>
                        <Fact label={'Box name'} icon={TagIcon}>
                            {box.name}
                        </Fact>
                        <Fact label={'Owner'} icon={UserIcon}>
                            {box.owner && (
                                <AdminLink
                                    to={`/admin/users/view/${box.owner.id}`}
                                    className={'text-primary-600 hover:underline'}
                                >
                                    {box.owner.username}
                                </AdminLink>
                            )}
                        </Fact>
                        <Fact label={'Node'} icon={GlobeAltIcon}>
                            {box.node ? (
                                <AdminLink
                                    to={`/admin/nodes/view/${box.node.id}`}
                                    className={'text-primary-600 hover:underline'}
                                >
                                    {box.node.name}
                                </AdminLink>
                            ) : (
                                'Any node with room'
                            )}
                        </Fact>
                        <Fact label={'Servers'} icon={ServerIcon}>
                            {box.servers}
                        </Fact>
                        <Fact label={'Ports / backups / databases'} icon={CubeIcon}>
                            {box.limits.allocations} / {box.limits.backups} / {box.limits.databases}
                        </Fact>
                        <Fact label={'Where it came from'} icon={ShoppingBagIcon}>
                            {box.source === 'order' ? 'Bought in the store' : 'Made by an administrator'}
                        </Fact>
                        <Fact label={'Runs out'} icon={box.expires_at ? ClockIcon : CalendarIcon}>
                            {box.expires_at ? new Date(box.expires_at).toLocaleDateString() : 'Never'}
                        </Fact>
                    </dl>
                </SectionCard>
                <SectionCard
                    icon={<ChipIcon className={'h-5 w-5'} />}
                    title={'In use'}
                    description={'How much of the box the servers in it have been given.'}
                >
                    <BoxMeters limits={box.limits} used={box.used} compact />
                </SectionCard>
            </div>
        </BoxFrame>
    );
};
