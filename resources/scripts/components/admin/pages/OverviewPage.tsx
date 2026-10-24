import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
    ChipIcon,
    ClockIcon,
    DatabaseIcon,
    GlobeAltIcon,
    LightningBoltIcon,
    GlobeIcon,
    ServerIcon,
    UserGroupIcon,
    UsersIcon,
    ViewGridIcon,
} from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Meter, Pill, Row } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import useOverview from '@/api/admin/overview';
import { plural, sizeMiB } from '@/lib/adminFormat';

const ago = (iso: string) => `${formatDistanceToNow(new Date(iso))} ago`;

const Stat = ({
    to,
    icon,
    number,
    label,
    note,
}: {
    to: string;
    icon: React.ReactNode;
    number: number;
    label: string;
    note: string;
}) => (
    <AdminLink
        to={to}
        className={
            'block rounded-xl border border-neutral-500 bg-white p-5 no-underline shadow-md transition-colors hover:bg-neutral-600'
        }
    >
        <div className={'flex items-center justify-between'}>
            <span className={'text-2xs uppercase tracking-wide text-neutral-400'}>{label}</span>
            <span className={'text-primary-600'}>{icon}</span>
        </div>
        <p className={'mt-2 text-3xl font-bold text-neutral-50'}>{number}</p>
        <p className={'mt-1 text-xs text-neutral-400'}>{note}</p>
    </AdminLink>
);

const Capacity = ({
    label,
    usage,
    note,
    icon: Icon,
}: {
    label: string;
    usage: { percent: number; level: any };
    note: string;
    icon: React.ComponentType<{ className?: string }>;
}) => (
    <div className={'mb-4 last:mb-0'}>
        <div className={'flex items-baseline justify-between text-sm'}>
            <span className={'flex items-center gap-2 text-neutral-200'}>
                <Icon className={'h-4 w-4 text-neutral-400'} />
                {label}
            </span>
            <strong className={'text-neutral-50'}>{usage.percent}%</strong>
        </div>
        <div className={'mt-1.5'}>
            <Meter percent={usage.percent} level={usage.level} />
        </div>
        <p className={'mt-1 text-xs text-neutral-400'}>{note}</p>
    </div>
);

/** The first page of the admin area: totals, the nodes and what is promised on them, and what happened lately. */
export default () => {
    const { data, error } = useOverview();

    if (!data) {
        return (
            <AdminPage title={'Overview'} subtitle={'A quick glance at your system.'}>
                {error ? (
                    <p className={'text-sm text-red-600'}>The overview could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    const s = data.totals.servers;
    const u = data.totals.users;
    const serverNotes = [
        s.installing ? `${s.installing} installing` : null,
        s.suspended ? `${s.suspended} suspended` : null,
        s.failed ? `${s.failed} failed to install` : null,
    ].filter(Boolean);
    const userNotes = [
        plural(u.admins, 'admin'),
        `${u.two_factor} with 2FA`,
        u.new ? `${u.new} new this week` : null,
    ].filter(Boolean);

    return (
        <AdminPage title={'Overview'} subtitle={'A quick glance at your system.'}>
            <div className={'mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4'}>
                <Stat
                    to={'/admin/servers'}
                    icon={<ServerIcon className={'h-5 w-5'} />}
                    number={s.total}
                    label={'Servers'}
                    note={serverNotes.length ? serverNotes.join(' · ') : 'Nothing needs attention'}
                />
                <Stat
                    to={'/admin/users'}
                    icon={<UsersIcon className={'h-5 w-5'} />}
                    number={u.total}
                    label={'Users'}
                    note={userNotes.join(' · ')}
                />
                <Stat
                    to={'/admin/nodes'}
                    icon={<ChipIcon className={'h-5 w-5'} />}
                    number={data.totals.nodes.total}
                    label={'Nodes'}
                    note={
                        data.totals.nodes.maintenance
                            ? `${data.totals.nodes.maintenance} in maintenance`
                            : 'None in maintenance'
                    }
                />
                <Stat
                    to={'/admin/servers'}
                    icon={<GlobeIcon className={'h-5 w-5'} />}
                    number={data.totals.domains.total}
                    label={'Custom domains'}
                    note={'Added by your users'}
                />
            </div>

            <div className={'mb-6 grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<ChipIcon className={'h-5 w-5'} />}
                    title={'Nodes'}
                    description={'What is promised to servers on each node, against what the node has'}
                >
                    {data.nodes.length === 0 ? (
                        <Empty>
                            There are no nodes yet. Servers run on nodes,{' '}
                            <AdminLink to={'/admin/nodes/new'}>add the first one</AdminLink>.
                        </Empty>
                    ) : (
                        <AdminTable heads={['Node', 'Servers', 'Memory', 'Disk', 'Ports']} className={'-mx-5 -mb-5'}>
                            {data.nodes.map((node) => (
                                <Row key={node.id}>
                                    <Cell>
                                        <AdminLink to={`/admin/nodes/view/${node.id}`}>
                                            <strong>{node.name}</strong>
                                        </AdminLink>{' '}
                                        {node.maintenance && <Pill tone={'yellow'}>Maintenance</Pill>}
                                        <p className={'text-xs text-neutral-400'}>
                                            {node.location || 'No location'} · {node.fqdn}
                                        </p>
                                    </Cell>
                                    <Cell>{node.servers}</Cell>
                                    {(['memory', 'disk'] as const).map((kind) => (
                                        <Cell key={kind} className={'min-w-[9rem]'}>
                                            <Meter percent={node[kind].percent} level={node[kind].level} />
                                            <p className={'mt-1 text-xs text-neutral-400'}>
                                                {sizeMiB(node[kind].used)} of {sizeMiB(node[kind].limit)}
                                            </p>
                                        </Cell>
                                    ))}
                                    <Cell>
                                        {node.allocations.used}/{node.allocations.limit}
                                    </Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                </SectionCard>
                <SectionCard
                    icon={<ViewGridIcon className={'h-5 w-5'} />}
                    title={'Capacity'}
                    description={'Over all nodes'}
                >
                    <Capacity
                        label={'Memory given to servers'}
                        icon={LightningBoltIcon}
                        usage={data.capacity.memory}
                        note={`${sizeMiB(data.capacity.memory.used)} of ${sizeMiB(
                            data.capacity.memory.limit
                        )} on all nodes`}
                    />
                    <Capacity
                        label={'Disk given to servers'}
                        icon={DatabaseIcon}
                        usage={data.capacity.disk}
                        note={`${sizeMiB(data.capacity.disk.used)} of ${sizeMiB(
                            data.capacity.disk.limit
                        )} on all nodes`}
                    />
                    <Capacity
                        label={'Ports in use'}
                        icon={GlobeAltIcon}
                        usage={data.capacity.allocations}
                        note={`${data.capacity.allocations.used} of ${data.capacity.allocations.limit} allocations have a server`}
                    />
                </SectionCard>
            </div>

            <div className={'mb-6 grid gap-4 lg:grid-cols-3'}>
                <SectionCard icon={<ViewGridIcon className={'h-5 w-5'} />} title={'Servers by egg'}>
                    {data.eggs.length === 0 ? (
                        <Empty>No server uses an egg yet.</Empty>
                    ) : (
                        data.eggs.map((egg) => (
                            <div key={egg.id} className={'mb-3 last:mb-0'}>
                                <div className={'flex justify-between text-sm'}>
                                    <AdminLink to={`/admin/nests/egg/view/${egg.id}`}>{egg.name}</AdminLink>
                                    <strong className={'text-neutral-50'}>{egg.servers}</strong>
                                </div>
                                <div className={'mt-1'}>
                                    <Meter percent={s.total ? (egg.servers / s.total) * 100 : 0} level={'ok'} />
                                </div>
                            </div>
                        ))
                    )}
                </SectionCard>
                <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'Newest servers'}>
                    {data.recent_servers.length === 0 ? (
                        <Empty>There are no servers yet.</Empty>
                    ) : (
                        data.recent_servers.map((server) => (
                            <AdminLink
                                key={server.id}
                                to={`/admin/servers/view/${server.id}`}
                                className={'-mx-2 block rounded-lg px-2 py-2 no-underline hover:bg-neutral-600'}
                            >
                                <p className={'text-sm font-medium text-neutral-50'}>{server.name}</p>
                                <p className={'text-xs text-neutral-400'}>
                                    {server.owner || 'No owner'} · {server.node || 'No node'} · {ago(server.created_at)}
                                </p>
                            </AdminLink>
                        ))
                    )}
                </SectionCard>
                <SectionCard icon={<UserGroupIcon className={'h-5 w-5'} />} title={'Newest users'}>
                    {data.recent_users.length === 0 ? (
                        <Empty>There are no users yet.</Empty>
                    ) : (
                        data.recent_users.map((user) => (
                            <AdminLink
                                key={user.id}
                                to={`/admin/users/view/${user.id}`}
                                className={'-mx-2 block rounded-lg px-2 py-2 no-underline hover:bg-neutral-600'}
                            >
                                <p className={'text-sm font-medium text-neutral-50'}>
                                    {user.username} {user.root_admin && <Pill tone={'primary'}>Root admin</Pill>}
                                </p>
                                <p className={'text-xs text-neutral-400'}>
                                    {user.email} · joined {ago(user.created_at)}
                                </p>
                            </AdminLink>
                        ))
                    )}
                </SectionCard>
            </div>

            <SectionCard icon={<ClockIcon className={'h-5 w-5'} />} title={'Recent activity'}>
                {data.activity.length === 0 ? (
                    <Empty>Nothing has been logged yet.</Empty>
                ) : (
                    <AdminTable heads={['When', 'Event', 'Who', 'IP address']} className={'-mx-5 -mb-5'}>
                        {data.activity.map((log, index) => (
                            <Row key={index}>
                                <Cell className={'whitespace-nowrap'}>{ago(log.timestamp)}</Cell>
                                <Cell>
                                    <code className={'text-xs'}>{log.event}</code>
                                </Cell>
                                <Cell>{log.actor || 'System'}</Cell>
                                <Cell className={'text-neutral-400'}>{log.ip}</Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </SectionCard>

            <p className={'mt-6 text-center text-xs text-neutral-400'}>
                <a href={data.links.discord} rel={'noopener noreferrer'} target={'_blank'}>
                    Get help
                </a>
                {' · '}
                <a href={'https://pterodactyl.io'} rel={'noopener noreferrer'} target={'_blank'}>
                    Documentation
                </a>
                {' · '}
                <a href={'https://github.com/pterodactyl/panel'} rel={'noopener noreferrer'} target={'_blank'}>
                    GitHub
                </a>
                {' · '}
                <a href={data.links.donations} rel={'noopener noreferrer'} target={'_blank'}>
                    Support the project
                </a>
            </p>
        </AdminPage>
    );
};
