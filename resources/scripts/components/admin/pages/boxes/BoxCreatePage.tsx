import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import BoxForm, { BoxFormValue, EMPTY_BOX } from '@/components/admin/pages/boxes/BoxForm';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { createBox, useAdminBoxes } from '@/api/admin/boxes';

/** Admin > Boxes > Create new: a box for a person, without any payment. */
export default () => {
    const history = useHistory();
    const { data } = useAdminBoxes('', null, 1);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<BoxFormValue>(EMPTY_BOX);
    const [busy, setBusy] = useState(false);

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createBox({
            user_id: Number(value.owner),
            name: value.name,
            node_id: value.node ? Number(value.node) : null,
            memory: Number(value.memory),
            disk: Number(value.disk),
            cpu: Number(value.cpu),
            allocations: Number(value.allocations),
            backups: Number(value.backups),
            databases: Number(value.databases),
            expires_at: value.expires ? new Date(`${value.expires}T23:59:59`).toISOString() : null,
            notes: value.notes || null,
        })
            .then((box) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: 'The box was created, the owner sees it right away.',
                });
                history.push(`/admin/boxes/view/${box.admin_id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
            });
    };

    return (
        <AdminPage
            title={'Create box'}
            subtitle={'Give a person a box of resources, without a payment.'}
            actions={
                <AdminLink to={'/admin/boxes'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Boxes
                    </Button.Text>
                </AdminLink>
            }
        >
            {!data ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'space-y-4'}>
                    <BoxForm value={value} onChange={setValue} nodes={data.nodes} ownerEditable />
                    <div className={'flex justify-end'}>
                        <Button onClick={create} disabled={busy || !value.name.trim() || !value.owner}>
                            Create box
                        </Button>
                    </div>
                </div>
            )}
        </AdminPage>
    );
};
