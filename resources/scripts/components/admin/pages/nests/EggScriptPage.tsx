import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeftIcon, TerminalIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import EggTabs from '@/components/admin/pages/nests/EggTabs';
import { AreaField, Columns, Notice, SelectField, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { updateEggScript, useEggScript } from '@/api/admin/nests';

/** Admin > Nests > Eggs > Install script: what runs in a container when a server of this egg is installed. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useEggScript(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState({
        script_install: '',
        script_container: '',
        script_entry: '',
        copy_script_from: '',
    });
    const [busy, setBusy] = useState(false);
    const can = admin.can('eggs.update');

    useEffect(() => {
        if (data) {
            setValue({
                script_install: data.script_install,
                script_container: data.script_container,
                script_entry: data.script_entry,
                copy_script_from: data.copy_script_from === null ? '' : String(data.copy_script_from),
            });
        }
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateEggScript(data.id, value)
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'The install script was updated.' });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={data.name}
            subtitle={'The install script of this egg.'}
            actions={
                <AdminLink to={`/admin/nests/view/${data.nest.id}`}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        {data.nest.name}
                    </Button.Text>
                </AdminLink>
            }
        >
            <EggTabs id={data.id} />
            <SectionCard icon={<TerminalIcon className={'h-5 w-5'} />} title={'Install script'}>
                <div className={'space-y-4'}>
                    {data.copying_from && (
                        <Notice>
                            This egg is copying its installation script and container options from{' '}
                            <AdminLink
                                to={`/admin/nests/egg/${data.copying_from.id}`}
                                className={'font-medium underline'}
                            >
                                {data.copying_from.name}
                            </AdminLink>
                            . Any changes you make to this script will not apply unless you select &quot;None&quot; from
                            the box below.
                        </Notice>
                    )}
                    <AreaField
                        id={'egg-script'}
                        label={'Script'}
                        rows={16}
                        mono
                        value={value.script_install}
                        disabled={!can}
                        onChange={(script_install) => setValue({ ...value, script_install })}
                    />
                    <Columns className={'sm:grid-cols-3'}>
                        <SelectField
                            id={'egg-copy-script'}
                            label={'Copy script from'}
                            value={value.copy_script_from}
                            disabled={!can}
                            choices={[
                                { value: '', label: 'None' },
                                ...data.copy_options.map((o) => ({ value: String(o.id), label: o.name })),
                            ]}
                            onChange={(copy_script_from) => setValue({ ...value, copy_script_from })}
                            help={
                                'If selected, the script above is ignored and the script of the selected egg is used.'
                            }
                        />
                        <TextField
                            id={'egg-script-container'}
                            label={'Script container'}
                            value={value.script_container}
                            disabled={!can}
                            onChange={(script_container) => setValue({ ...value, script_container })}
                            help={'The docker container to use when running this script for the server.'}
                        />
                        <TextField
                            id={'egg-script-entry'}
                            label={'Script entrypoint command'}
                            value={value.script_entry}
                            disabled={!can}
                            onChange={(script_entry) => setValue({ ...value, script_entry })}
                            help={'The entrypoint command to use for this script.'}
                        />
                    </Columns>
                    <p className={'text-sm text-neutral-300'}>
                        The following eggs rely on this script:{' '}
                        {data.relied_on_by.length === 0 ? (
                            <em>none</em>
                        ) : (
                            data.relied_on_by.map((egg, i) => (
                                <React.Fragment key={egg.id}>
                                    {i > 0 && ', '}
                                    <AdminLink to={`/admin/nests/egg/${egg.id}`}>
                                        <code>{egg.name}</code>
                                    </AdminLink>
                                </React.Fragment>
                            ))
                        )}
                    </p>
                </div>
                {can && (
                    <div className={'mt-6 flex justify-end'}>
                        <Button onClick={save} disabled={busy}>
                            Save
                        </Button>
                    </div>
                )}
            </SectionCard>
        </AdminPage>
    );
};
