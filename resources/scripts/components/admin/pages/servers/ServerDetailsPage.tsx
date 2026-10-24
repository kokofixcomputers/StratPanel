import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PencilAltIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import OwnerSelect from '@/components/admin/pages/servers/OwnerSelect';
import { AreaField, Stack, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { updateDetails, useServer } from '@/api/admin/servers';

/** Admin > Servers > one server > Details: the name, the owner and the external id. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useServer(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState({ name: '', description: '', external_id: '', owner_id: '' });
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.update');

    useEffect(() => {
        if (data) {
            setValue({
                name: data.name,
                description: data.description,
                external_id: data.external_id ?? '',
                owner_id: String(data.owner.id),
            });
        }
    }, [data]);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateDetails(data.id, { ...value, owner_id: Number(value.owner_id) })
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'The details of the server were updated.' });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <ServerFrame server={data} subtitle={'Edit the details of this server.'}>
            <SectionCard icon={<PencilAltIcon className={'h-5 w-5'} />} title={'Base information'}>
                <Stack>
                    <TextField
                        id={'server-name'}
                        label={'Server name'}
                        value={value.name}
                        disabled={!can}
                        onChange={(name) => setValue({ ...value, name })}
                        help={'Letters, numbers, spaces and _ - .'}
                    />
                    <TextField
                        id={'server-external'}
                        label={'External identifier'}
                        value={value.external_id}
                        disabled={!can}
                        onChange={(external_id) => setValue({ ...value, external_id })}
                        help={
                            'Leave empty to not assign an external identifier for this server. It should be unique to this server and not be in use by any other server.'
                        }
                    />
                    <OwnerSelect
                        id={'server-owner'}
                        label={'Server owner'}
                        value={value.owner_id}
                        disabled={!can}
                        onChange={(owner_id) => setValue({ ...value, owner_id })}
                        help={
                            'Change the owner of this server by choosing another person. If you do this a new daemon security token is generated automatically.'
                        }
                    />
                    <AreaField
                        id={'server-description'}
                        label={'Server description'}
                        rows={3}
                        value={value.description}
                        disabled={!can}
                        onChange={(description) => setValue({ ...value, description })}
                        help={'A brief description of this server.'}
                    />
                </Stack>
                {can && (
                    <div className={'mt-6 flex justify-end'}>
                        <Button onClick={save} disabled={busy || !value.name.trim() || !value.owner_id}>
                            Update details
                        </Button>
                    </div>
                )}
            </SectionCard>
        </ServerFrame>
    );
};
