import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ChipIcon, GlobeIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import LocationForm from '@/components/admin/pages/locations/LocationForm';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { deleteLocation, LocationInput, updateLocation, useLocation } from '@/api/admin/locations';

/** Admin > Locations > one location: its details and its nodes. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useLocation(id);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<LocationInput>({ short: '', long: '' });
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (data) setValue({ short: data.short, long: data.long || '' });
    }, [data]);

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateLocation(Number(id), value)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'Location was updated successfully.' });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () => {
        clearFlashes('admin');
        deleteLocation(Number(id))
            .then(() => history.push('/admin/locations'))
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setDeleting(false));
    };

    const back = (
        <AdminLink to={'/admin/locations'} className={'inline-flex items-center text-sm'}>
            <ArrowLeftIcon className={'mr-1.5 h-4 w-4'} />
            All locations
        </AdminLink>
    );

    if (!data) {
        return (
            <AdminPage title={'Location'} actions={back}>
                {error ? (
                    <p className={'text-sm text-red-600'}>This location could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    return (
        <AdminPage title={data.short} subtitle={data.long || undefined} actions={back}>
            <div className={'grid items-start gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<GlobeIcon className={'h-5 w-5'} />} title={'Location details'}>
                    <LocationForm
                        value={value}
                        onChange={setValue}
                        disabled={!admin.can('locations.update')}
                        idPrefix={'location'}
                    />
                    <div className={'mt-6 flex items-center justify-between gap-3'}>
                        {admin.can('locations.delete') ? (
                            <Button.Danger type={'button'} onClick={() => setDeleting(true)}>
                                Delete
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        {admin.can('locations.update') && (
                            <Button type={'button'} onClick={save} disabled={busy || !value.short.trim()}>
                                {busy ? 'Saving...' : 'Save'}
                            </Button>
                        )}
                    </div>
                </SectionCard>
                <SectionCard icon={<ChipIcon className={'h-5 w-5'} />} title={'Nodes'}>
                    {data.nodes.length === 0 ? (
                        <Empty>No node is in this location.</Empty>
                    ) : (
                        <AdminTable heads={['ID', 'Name', 'FQDN', 'Servers']} className={'-mx-5 -mb-5 -mt-5'}>
                            {data.nodes.map((node) => (
                                <Row key={node.id}>
                                    <Cell>
                                        <code className={'text-xs'}>{node.id}</code>
                                    </Cell>
                                    <Cell>
                                        <AdminLink to={`/admin/nodes/view/${node.id}`}>{node.name}</AdminLink>
                                    </Cell>
                                    <Cell>
                                        <code className={'text-xs'}>{node.fqdn}</code>
                                    </Cell>
                                    <Cell>{node.servers}</Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                </SectionCard>
            </div>

            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.short}`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                A location that still has nodes can not be deleted.
            </Dialog.Confirm>
        </AdminPage>
    );
};
