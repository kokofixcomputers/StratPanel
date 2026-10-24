import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import NodeForm, { toInput } from '@/components/admin/pages/nodes/NodeForm';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { NodeInput, updateNode, useNode, useNodeForm } from '@/api/admin/nodes';

/** Admin > Nodes > one node > Settings. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useNode(id);
    const { data: form } = useNodeForm();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<NodeInput | null>(null);
    const [busy, setBusy] = useState(false);
    const can = admin.can('nodes.update');

    useEffect(() => {
        if (data) setValue(toInput(data));
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (!data || !value) return error ? null : <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateNode(data.id, value)
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'The node was updated.' });
                return mutate(fresh, false);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                // The settings are kept even when the node could not be told, so look again.
                return mutate();
            })
            .then(() => setBusy(false));
    };

    return (
        <NodeFrame id={data.id} name={data.name} subtitle={'Change the settings of this node.'}>
            {form ? (
                <NodeForm
                    value={value}
                    onChange={setValue}
                    locations={form.locations}
                    secure={form.secure}
                    exists
                    disabled={!can}
                />
            ) : (
                <Spinner centered />
            )}
            {can && (
                <div className={'mt-4 flex justify-end'}>
                    <Button onClick={save} disabled={busy || !value.name.trim() || !value.fqdn.trim()}>
                        Save changes
                    </Button>
                </div>
            )}
        </NodeFrame>
    );
};
