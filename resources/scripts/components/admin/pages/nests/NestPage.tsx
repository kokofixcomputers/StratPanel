import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, DownloadIcon, PlusIcon, ViewGridIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { AreaField, Stack, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { deleteNest, updateNest, useNest } from '@/api/admin/nests';

/** Admin > Nests > one nest: its name and description, and its eggs. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useNest(id);
    const admin = useAdmin();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState({ name: '', description: '' });
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const can = admin.can('nests.update');

    useEffect(() => {
        if (data) setValue({ name: data.name, description: data.description ?? '' });
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateNest(data.id, value)
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'Nest was updated successfully.' });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () =>
        deleteNest(data.id)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'Nest was deleted successfully.' });
                history.push('/admin/nests');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });

    return (
        <AdminPage
            title={data.name}
            subtitle={data.description ?? undefined}
            actions={
                <AdminLink to={'/admin/nests'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Nests
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'grid gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<ViewGridIcon className={'h-5 w-5'} />} title={'Nest'}>
                    <Stack>
                        <TextField
                            id={'nest-name'}
                            label={'Name'}
                            value={value.name}
                            disabled={!can}
                            onChange={(name) => setValue({ ...value, name })}
                            help={'A descriptive category name that encompasses all of the eggs within the nest.'}
                        />
                        <AreaField
                            id={'nest-description'}
                            label={'Description'}
                            rows={6}
                            value={value.description}
                            disabled={!can}
                            onChange={(description) => setValue({ ...value, description })}
                        />
                    </Stack>
                    <div className={'mt-6 flex justify-between gap-3'}>
                        {admin.can('nests.delete') ? (
                            <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                                Delete nest
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        {can && (
                            <Button onClick={save} disabled={busy || !value.name.trim()}>
                                Save
                            </Button>
                        )}
                    </div>
                </SectionCard>
                <SectionCard icon={<ViewGridIcon className={'h-5 w-5'} />} title={'Details'}>
                    <Stack>
                        <TextField
                            id={'nest-id'}
                            label={'Nest ID'}
                            value={String(data.id)}
                            onChange={() => undefined}
                            disabled
                            help={'A unique ID used for identification of this nest internally and through the API.'}
                        />
                        <TextField
                            id={'nest-author'}
                            label={'Author'}
                            value={data.author}
                            onChange={() => undefined}
                            disabled
                            help={'The author of this nest. Please direct questions and issues to them.'}
                        />
                        <TextField
                            id={'nest-uuid'}
                            label={'UUID'}
                            value={data.uuid}
                            onChange={() => undefined}
                            disabled
                            help={'A UUID that all servers using this nest are assigned for identification purposes.'}
                        />
                    </Stack>
                </SectionCard>
            </div>

            <SectionCard
                className={'mt-4'}
                icon={<ViewGridIcon className={'h-5 w-5'} />}
                title={'Nest eggs'}
                badge={
                    admin.can('eggs.create') && (
                        <AdminLink to={'/admin/nests/egg/new'}>
                            <Button.Text>
                                <PlusIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                New egg
                            </Button.Text>
                        </AdminLink>
                    )
                }
            >
                {data.eggs.length === 0 ? (
                    <Empty>There are no eggs in this nest yet.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Name', 'Description', 'Servers', null]}>
                        {data.eggs.map((egg) => (
                            <Row key={egg.id} onClick={() => history.push(`/admin/nests/egg/${egg.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{egg.id}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>
                                    <span title={egg.author}>{egg.name}</span>
                                </Cell>
                                <Cell className={'text-neutral-300'}>{egg.description}</Cell>
                                <Cell>{egg.servers}</Cell>
                                <Cell>
                                    {admin.can('eggs.export') && (
                                        <a
                                            href={`/admin/nests/egg/${egg.id}/export`}
                                            title={'Export'}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <DownloadIcon className={'h-4 w-4'} />
                                        </a>
                                    )}
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </SectionCard>

            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.name}?`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                A nest can only be deleted when no server uses it. Its eggs are deleted with it.
            </Dialog.Confirm>
        </AdminPage>
    );
};
