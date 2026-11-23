import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BoxFrame from '@/components/admin/pages/boxes/BoxFrame';
import BoxForm, { BoxFormValue } from '@/components/admin/pages/boxes/BoxForm';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { updateBox, useAdminBox, useAdminBoxes } from '@/api/admin/boxes';

/** Admin > Boxes > one box > Details: name, size, node and when it runs out. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, mutate, error } = useAdminBox(id);
    const { data: list } = useAdminBoxes('', null, 1);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<BoxFormValue | null>(null);
    const [busy, setBusy] = useState(false);
    const can = admin.can('boxes.update');

    useEffect(() => {
        if (!box) return;
        setValue({
            name: box.name,
            owner: String(box.owner?.id ?? ''),
            node: box.node ? String(box.node.id) : '',
            expires: box.expires_at ? box.expires_at.slice(0, 10) : '',
            notes: box.notes || '',
            memory: String(box.limits.memory),
            disk: String(box.limits.disk),
            cpu: String(box.limits.cpu),
            allocations: String(box.limits.allocations),
            backups: String(box.limits.backups),
            databases: String(box.limits.databases),
        });
    }, [box]);

    if (!box || !value || !list) return error ? null : <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateBox(box.admin_id, {
            name: value.name,
            memory: Number(value.memory),
            disk: Number(value.disk),
            cpu: Number(value.cpu),
            allocations: Number(value.allocations),
            backups: Number(value.backups),
            databases: Number(value.databases),
            node_id: value.node ? Number(value.node) : null,
            expires_at: value.expires ? new Date(`${value.expires}T23:59:59`).toISOString() : null,
            notes: value.notes || null,
        })
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'The box was updated.' });

                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <BoxFrame box={box} subtitle={'A box can not be made smaller than what its servers have been given.'}>
            <div className={'space-y-4'}>
                <BoxForm value={value} onChange={setValue} nodes={list.nodes} ownerEditable={false} disabled={!can} />
                {can && (
                    <div className={'flex justify-end'}>
                        <Button onClick={save} disabled={busy || !value.name.trim()}>
                            Save changes
                        </Button>
                    </div>
                )}
            </div>
        </BoxFrame>
    );
};
