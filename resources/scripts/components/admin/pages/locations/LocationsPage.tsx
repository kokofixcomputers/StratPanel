import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { GlobeIcon, PlusIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import LocationForm from '@/components/admin/pages/locations/LocationForm';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createLocation, LocationInput, useLocations } from '@/api/admin/locations';

const EMPTY: LocationInput = { short: '', long: '' };

/** Admin > Locations: where the nodes are. */
export default () => {
    const { data, error } = useLocations();
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [value, setValue] = useState(EMPTY);
    const [busy, setBusy] = useState(false);

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createLocation(value)
            .then(({ id }) => {
                addFlash({ key: 'admin', type: 'success', message: 'Location was created successfully.' });
                history.push(`/admin/locations/view/${id}`);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setCreating(false);
            })
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={'Locations'}
            subtitle={'All locations that nodes can be assigned to for easier categorization.'}
        >
            <ListHeader
                icon={<GlobeIcon className={'h-6 w-6'} />}
                title={'Location list'}
                count={data ? String(data.locations.length) : undefined}
            >
                {admin.can('locations.create') && (
                    <Button
                        onClick={() => {
                            setValue(EMPTY);
                            setCreating(true);
                        }}
                    >
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                )}
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The locations could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.locations.length === 0 ? (
                    <Empty>There are no locations yet.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Short code', 'Description', 'Nodes', 'Servers']}>
                        {data.locations.map((location) => (
                            <Row key={location.id} onClick={() => history.push(`/admin/locations/view/${location.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{location.id}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>{location.short}</Cell>
                                <Cell className={'text-neutral-300'}>{location.long}</Cell>
                                <Cell>{location.nodes}</Cell>
                                <Cell>{location.servers}</Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>

            <Dialog open={creating} onClose={() => setCreating(false)} title={'Create location'}>
                <LocationForm value={value} onChange={setValue} idPrefix={'new-location'} />
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button onClick={create} disabled={busy || !value.short.trim()}>
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
