import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import NodeForm, { BLANK } from '@/components/admin/pages/nodes/NodeForm';
import { Notice } from '@/components/admin/forms';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { createNode, NodeInput, useNodeForm } from '@/api/admin/nodes';

/** Admin > Nodes > new. */
export default () => {
    const { data } = useNodeForm();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<NodeInput>(BLANK);
    const [busy, setBusy] = useState(false);

    if (!data) return <Spinner size={'large'} centered />;

    if (data.locations.length === 0) {
        return (
            <AdminPage title={'New node'} subtitle={'Create a new node on the system.'}>
                <Notice>
                    A location is needed before a node can be made.{' '}
                    <AdminLink to={'/admin/locations'} className={'font-medium underline'}>
                        Make one first.
                    </AdminLink>
                </Notice>
            </AdminPage>
        );
    }

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createNode({
            ...value,
            location_id: value.location_id || String(data.locations[0].id),
            scheme: data.secure ? 'https' : value.scheme,
        })
            .then((node) => {
                addFlash({
                    key: 'admin',
                    type: 'info',
                    message: 'The node was created. Add its allocations, then set up Wings with the configuration.',
                });
                history.push(`/admin/nodes/view/${node.id}/allocation`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
            });
    };

    return (
        <AdminPage
            title={'New node'}
            subtitle={'Create a new node on the system.'}
            actions={
                <AdminLink to={'/admin/nodes'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Nodes
                    </Button.Text>
                </AdminLink>
            }
        >
            <NodeForm
                value={value}
                onChange={setValue}
                locations={data.locations}
                secure={data.secure}
                exists={false}
            />
            <div className={'mt-4 flex justify-end'}>
                <Button onClick={create} disabled={busy || !value.name.trim() || !value.fqdn.trim()}>
                    Create node
                </Button>
            </div>
        </AdminPage>
    );
};
