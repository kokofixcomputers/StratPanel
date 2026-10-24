import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CollectionIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { addServerMount, removeServerMount, useServer, useServerMounts } from '@/api/admin/servers';

/** Admin > Servers > one server > Mounts. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server } = useServer(id);
    const { data, error, mutate } = useServerMounts(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.mounts');

    if (!server || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then((fresh) => {
            addFlash({ key: 'admin', type: 'success', message });

            return mutate(fresh as typeof data, false);
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <ServerFrame server={server} subtitle={'Mount points of the node that this server can use.'}>
            <SectionCard icon={<CollectionIcon className={'h-5 w-5'} />} title={'Available mounts'}>
                {data.mounts.length === 0 ? (
                    <Empty>
                        No mount is available for this server (it has to be set for the egg and the node of the server).
                    </Empty>
                ) : (
                    <AdminTable heads={['ID', 'Name', 'Source', 'Target', 'Status', null]}>
                        {data.mounts.map((mount) => (
                            <Row key={mount.id}>
                                <Cell>{mount.id}</Cell>
                                <Cell className={'font-medium text-neutral-50'}>
                                    <AdminLink to={`/admin/mounts/view/${mount.id}`}>{mount.name}</AdminLink>
                                </Cell>
                                <Cell>
                                    <code className={'text-xs'}>{mount.source}</code>
                                </Cell>
                                <Cell>
                                    <code className={'text-xs'}>{mount.target}</code>
                                </Cell>
                                <Cell>
                                    <Pill tone={mount.mounted ? 'green' : 'neutral'}>
                                        {mount.mounted ? 'Mounted' : 'Unmounted'}
                                    </Pill>
                                </Cell>
                                <Cell>
                                    {can &&
                                        (mount.mounted ? (
                                            <Button.Text
                                                disabled={busy}
                                                onClick={() =>
                                                    run(
                                                        removeServerMount(data.id, mount.id),
                                                        'Mount was removed successfully.'
                                                    )
                                                }
                                            >
                                                Unmount
                                            </Button.Text>
                                        ) : (
                                            <Button.Text
                                                disabled={busy}
                                                onClick={() =>
                                                    run(
                                                        addServerMount(data.id, mount.id),
                                                        'Mount was added successfully.'
                                                    )
                                                }
                                            >
                                                Mount
                                            </Button.Text>
                                        ))}
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </SectionCard>
        </ServerFrame>
    );
};
