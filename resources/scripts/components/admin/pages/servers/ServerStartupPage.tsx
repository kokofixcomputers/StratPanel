import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CogIcon } from '@heroicons/react/solid';
import ServerFrame from '@/components/admin/pages/servers/ServerFrame';
import EggFields, { eggDefaults, EggValue } from '@/components/admin/pages/servers/EggFields';
import { Notice } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { updateStartup, useServer, useStartup } from '@/api/admin/servers';

/** Admin > Servers > one server > Startup: the command, the egg, the image and the variables. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: server } = useServer(id);
    const { data, error, mutate } = useStartup(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState<EggValue | null>(null);
    const [busy, setBusy] = useState(false);
    const can = admin.can('servers.startup');

    useEffect(() => {
        if (!data) return;
        const base = eggDefaults(data.nests, String(data.nest_id), String(data.egg_id));
        const known = Object.values(
            data.nests.find((n) => n.id === data.nest_id)?.eggs.find((e) => e.id === data.egg_id)?.docker_images ?? {}
        );
        setValue({
            ...base,
            startup: data.startup,
            skip_scripts: data.skip_scripts,
            // The image is one of the list, or a custom one.
            image: known.includes(data.image) ? data.image : '',
            custom_image: known.includes(data.image) ? '' : data.image,
            environment: { ...base.environment, ...data.environment },
        });
    }, [data]);

    if (!server || !data || !value) return error ? null : <Spinner size={'large'} centered />;

    const changesEgg = String(data.egg_id) !== value.egg_id || String(data.nest_id) !== value.nest_id;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateStartup(data.id, {
            startup: value.startup,
            nest_id: Number(value.nest_id),
            egg_id: Number(value.egg_id),
            skip_scripts: value.skip_scripts,
            docker_image: value.custom_image || value.image,
            environment: value.environment,
        })
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'The startup of the server was changed.' });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <ServerFrame server={server} subtitle={'Control the startup command and its variables.'}>
            <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Startup configuration'}>
                <div className={'mb-4'}>
                    <Notice>
                        Changing the nest or the egg makes the server run a re-install: it is stopped immediately and
                        then installed again. This is destructive in many cases. If you do not want the service scripts
                        to run, tick &quot;Skip egg install script&quot;.
                    </Notice>
                </div>
                <EggFields
                    nests={data.nests}
                    value={value}
                    onChange={setValue}
                    disabled={!can}
                    scriptsHelp={
                        'If the selected egg has an install script, it runs during the install. To skip that step, switch this on.'
                    }
                />
                {changesEgg && (
                    <div className={'mt-4'}>
                        <Notice tone={'red'}>You chose another egg: saving re-installs this server.</Notice>
                    </div>
                )}
                {can && (
                    <div className={'mt-6 flex justify-end'}>
                        <Button onClick={save} disabled={busy}>
                            Save modifications
                        </Button>
                    </div>
                )}
            </SectionCard>
        </ServerFrame>
    );
};
