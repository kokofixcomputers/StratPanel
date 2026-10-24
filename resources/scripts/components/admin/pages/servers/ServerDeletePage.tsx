import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { TrashIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import { deleteServer, useServer } from '@/api/admin/servers';

/** Admin > Servers > one server > Delete. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server, error } = useServer(id);
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [asking, setAsking] = useState<null | 'safe' | 'force'>(null);
    const [busy, setBusy] = useState(false);

    if (!server) return error ? null : <Spinner size={'large'} centered />;

    const remove = (force: boolean) => {
        clearFlashes('admin');
        setBusy(true);
        deleteServer(server.id, force)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The server was deleted.' });
                history.push('/admin/servers');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
                setAsking(null);
            });
    };

    return (
        <ServerFrame server={server} subtitle={'Delete this server from the panel.'}>
            <div className={'grid gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Safely delete server'}>
                    <p className={'text-sm text-neutral-200'}>
                        This attempts to delete the server from both the panel and the daemon. If either one reports an
                        error the action is cancelled.
                    </p>
                    <p className={'mt-2 text-sm text-red-600'}>
                        Deleting a server is irreversible. All server data (including files and users) is removed from
                        the system.
                    </p>
                    <div className={'mt-4'}>
                        <Button.Danger onClick={() => setAsking('safe')}>Safely delete this server</Button.Danger>
                    </div>
                </SectionCard>
                <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Force delete server'}>
                    <p className={'text-sm text-neutral-200'}>
                        This attempts to delete the server from both the panel and the daemon. If the daemon does not
                        respond, or reports an error, the deletion goes on.
                    </p>
                    <p className={'mt-2 text-sm text-red-600'}>
                        Deleting a server is irreversible. All server data (including files and users) is removed from
                        the system. This method may leave dangling files on your daemon if it reports an error.
                    </p>
                    <div className={'mt-4'}>
                        <Button.Danger onClick={() => setAsking('force')}>Forcibly delete this server</Button.Danger>
                    </div>
                </SectionCard>
            </div>
            <Dialog.Confirm
                open={asking !== null}
                title={`Delete ${server.name}?`}
                confirm={busy ? 'Deleting...' : 'Delete'}
                onConfirmed={() => remove(asking === 'force')}
                onClose={() => !busy && setAsking(null)}
            >
                There is no going back, all data is removed immediately.
            </Dialog.Confirm>
        </ServerFrame>
    );
};
