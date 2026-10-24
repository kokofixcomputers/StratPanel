import React, { useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { PlusIcon, UploadIcon, ViewGridIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { AreaField, Notice, SelectField, Stack, TextField } from '@/components/admin/forms';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createNest, importEgg, useNestLookup, useNests } from '@/api/admin/nests';

/** Admin > Nests: the categories of eggs, and a way to import an egg from a file. */
export default () => {
    const { data, error } = useNests();
    const { data: lookup } = useNestLookup();
    const admin = useAdmin();
    const history = useHistory();
    const picker = useRef<HTMLInputElement>(null);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [importing, setImporting] = useState(false);
    const [value, setValue] = useState({ name: '', description: '' });
    const [nest, setNest] = useState('');
    const [upload, setUpload] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);

    const run = (work: Promise<unknown>, close: () => void) => {
        clearFlashes('admin');
        setBusy(true);
        work.catch((e) => {
            clearAndAddHttpError({ key: 'admin', error: e });
            close();
        }).then(() => setBusy(false));
    };

    const create = () =>
        run(
            createNest(value).then((made) => {
                addFlash({ key: 'admin', type: 'success', message: `Nest ${made.name} was created.` });
                history.push(`/admin/nests/view/${made.id}`);
            }),
            () => setCreating(false)
        );

    const doImport = () =>
        upload &&
        run(
            importEgg(Number(nest || lookup?.nests[0]?.id), upload).then(({ id }) => {
                addFlash({ key: 'admin', type: 'success', message: 'The egg was imported.' });
                history.push(`/admin/nests/egg/${id}`);
            }),
            () => setImporting(false)
        );

    return (
        <AdminPage title={'Nests'} subtitle={'All nests currently available on this panel.'}>
            <div className={'mb-4'}>
                <Notice tone={'red'}>
                    Eggs are a powerful feature of Stratosphere that allow for extreme flexibility and configuration.
                    Please note that while powerful, modifying an egg wrongly can very easily brick your servers and
                    cause more problems. Please avoid editing our default eggs unless you are absolutely sure of what
                    you are doing.
                </Notice>
            </div>
            <ListHeader
                icon={<ViewGridIcon className={'h-6 w-6'} />}
                title={'Configured nests'}
                count={data ? String(data.nests.length) : undefined}
            >
                {admin.can('eggs.import') && (
                    <Button.Text onClick={() => setImporting(true)}>
                        <UploadIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Import egg
                    </Button.Text>
                )}
                {admin.can('nests.create') && (
                    <Button
                        onClick={() => {
                            setValue({ name: '', description: '' });
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
                        <p className={'p-6 text-sm text-red-600'}>The nests could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.nests.length === 0 ? (
                    <Empty>There are no nests yet.</Empty>
                ) : (
                    <AdminTable heads={['ID', 'Name', 'Description', 'Eggs', 'Servers']}>
                        {data.nests.map((row) => (
                            <Row key={row.id} onClick={() => history.push(`/admin/nests/view/${row.id}`)}>
                                <Cell>
                                    <code className={'text-xs'}>{row.id}</code>
                                </Cell>
                                <Cell className={'font-medium text-neutral-50'}>
                                    <span title={row.author}>{row.name}</span>
                                </Cell>
                                <Cell className={'text-neutral-300'}>{row.description}</Cell>
                                <Cell>{row.eggs}</Cell>
                                <Cell>{row.servers}</Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>

            <Dialog open={creating} onClose={() => setCreating(false)} title={'Create a nest'}>
                <Stack>
                    <TextField
                        id={'nest-name'}
                        label={'Name'}
                        value={value.name}
                        onChange={(name) => setValue({ ...value, name })}
                        help={'A descriptive category name that encompasses all of the eggs within the nest.'}
                    />
                    <AreaField
                        id={'nest-description'}
                        label={'Description'}
                        rows={5}
                        value={value.description}
                        onChange={(description) => setValue({ ...value, description })}
                    />
                </Stack>
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button onClick={create} disabled={busy || !value.name.trim()}>
                        Create
                    </Button>
                </Dialog.Footer>
            </Dialog>

            <Dialog open={importing} onClose={() => setImporting(false)} title={'Import an egg'}>
                <Stack>
                    <div>
                        <p className={'mb-1 text-sm font-medium text-neutral-200'}>Egg file</p>
                        <input
                            ref={picker}
                            type={'file'}
                            accept={'application/json,.json'}
                            className={'hidden'}
                            onChange={(e) => setUpload(e.currentTarget.files?.[0] ?? null)}
                        />
                        <Button.Text onClick={() => picker.current?.click()}>
                            {upload ? upload.name : 'Choose the .json file'}
                        </Button.Text>
                    </div>
                    <SelectField
                        id={'import-nest'}
                        label={'Associated nest'}
                        value={nest || String(lookup?.nests[0]?.id ?? '')}
                        choices={(lookup?.nests ?? []).map((n) => ({
                            value: String(n.id),
                            label: `${n.name} <${n.author}>`,
                        }))}
                        onChange={setNest}
                        help={'The nest this egg will belong to. To put it in a new nest, create that nest first.'}
                    />
                </Stack>
                <Dialog.Footer>
                    <Button.Text onClick={() => setImporting(false)}>Cancel</Button.Text>
                    <Button onClick={doImport} disabled={busy || !upload}>
                        Import
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};
