import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { TrashIcon } from '@heroicons/react/solid';
import BoxFrame from '@/components/admin/pages/boxes/BoxFrame';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import { deleteBox, useAdminBox } from '@/api/admin/boxes';

/** Admin > Boxes > one box > Delete. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, error } = useAdminBox(id);
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [asking, setAsking] = useState<null | 'detach' | 'delete'>(null);
    const [busy, setBusy] = useState(false);

    if (!box) return error ? null : <Spinner size={'large'} centered />;

    const remove = (servers: 'refuse' | 'detach' | 'delete') => {
        clearFlashes('admin');
        setBusy(true);
        deleteBox(box.admin_id, servers)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The box was deleted.' });
                history.push('/admin/boxes');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
                setAsking(null);
            });
    };

    return (
        <BoxFrame box={box} subtitle={'Delete this box from the panel.'}>
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Delete an empty box'}>
                    <p className={'text-sm text-neutral-200'}>
                        Deletes the box when there are no servers in it. A box with servers is refused.
                    </p>
                    <div className={'mt-4'}>
                        <Button.Danger disabled={busy || box.servers > 0} onClick={() => remove('refuse')}>
                            Delete this box
                        </Button.Danger>
                        {box.servers > 0 && (
                            <p className={'mt-2 text-xs text-neutral-400'}>
                                It has {box.servers} server(s), use one of the other two.
                            </p>
                        )}
                    </div>
                </SectionCard>
                <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Delete, keep the servers'}>
                    <p className={'text-sm text-neutral-200'}>
                        Deletes the box. The servers in it stay, as servers of their own with the resources they have
                        now.
                    </p>
                    <div className={'mt-4'}>
                        <Button.Danger disabled={busy} onClick={() => setAsking('detach')}>
                            Delete the box only
                        </Button.Danger>
                    </div>
                </SectionCard>
                <SectionCard icon={<TrashIcon className={'h-5 w-5'} />} title={'Delete with its servers'}>
                    <p className={'text-sm text-neutral-200'}>Deletes the box and every server in it.</p>
                    <p className={'mt-2 text-sm text-red-600'}>
                        Deleting a server is irreversible. All server data (including files and users) is removed from
                        the system.
                    </p>
                    <div className={'mt-4'}>
                        <Button.Danger disabled={busy} onClick={() => setAsking('delete')}>
                            Delete the box and its servers
                        </Button.Danger>
                    </div>
                </SectionCard>
            </div>
            <Dialog.Confirm
                open={asking !== null}
                title={asking === 'delete' ? 'Delete the box and its servers?' : 'Delete the box?'}
                confirm={asking === 'delete' ? 'Delete everything' : 'Delete the box'}
                onClose={() => setAsking(null)}
                onConfirmed={() => asking && remove(asking)}
            >
                {asking === 'delete'
                    ? `${box.name} and its ${box.servers} server(s) are deleted for good, with all their files.`
                    : `${box.name} is deleted. Its ${box.servers} server(s) stay as servers of their own.`}
            </Dialog.Confirm>
        </BoxFrame>
    );
};
