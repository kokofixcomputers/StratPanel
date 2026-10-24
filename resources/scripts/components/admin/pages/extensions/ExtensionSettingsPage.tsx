import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CogIcon,
    HashtagIcon,
    InformationCircleIcon,
    LightningBoltIcon,
    LinkIcon,
    TagIcon,
    UserIcon,
} from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import Fact from '@/components/admin/Fact';
import AdminLink from '@/components/admin/AdminLink';
import { AreaField, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { saveExtensionSettings, useExtensionSettings } from '@/api/admin/extensions';

type Values = Record<string, string | number | boolean>;

/** Admin > Extensions > settings: the form an extension declares in its extension.json. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useExtensionSettings(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [values, setValues] = useState<Values>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data) setValues(data.values);
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const can = admin.can('extensions.manage');
    const set = (key: string, value: string | number | boolean) => setValues({ ...values, [key]: value });

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        saveExtensionSettings(id, values)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: `${data.name} was set.` });
                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={data.name}
            subtitle={'Settings of this extension.'}
            actions={
                <AdminLink to={'/admin/extensions'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Back
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard className={'lg:col-span-2'} icon={<CogIcon className={'h-5 w-5'} />} title={'Settings'}>
                    <Stack>
                        {data.settings.map((setting) => {
                            const fieldId = `setting-${setting.key}`;
                            const value = values[setting.key] ?? '';

                            switch (setting.type) {
                                case 'boolean':
                                    return (
                                        <ToggleField
                                            key={setting.key}
                                            label={setting.label}
                                            help={setting.help}
                                            disabled={!can}
                                            checked={value === true || value === 'true' || value === 1 || value === '1'}
                                            onChange={(checked) => set(setting.key, checked)}
                                        />
                                    );
                                case 'textarea':
                                    return (
                                        <AreaField
                                            key={setting.key}
                                            id={fieldId}
                                            label={setting.label}
                                            help={setting.help}
                                            rows={setting.rows}
                                            disabled={!can}
                                            value={String(value)}
                                            onChange={(v) => set(setting.key, v)}
                                        />
                                    );
                                case 'select':
                                    return (
                                        <SelectField
                                            key={setting.key}
                                            id={fieldId}
                                            label={setting.label}
                                            help={setting.help}
                                            disabled={!can}
                                            value={String(value)}
                                            choices={Object.entries(setting.options ?? {}).map(([v, label]) => ({
                                                value: v,
                                                label,
                                            }))}
                                            onChange={(v) => set(setting.key, v)}
                                        />
                                    );
                                default:
                                    return (
                                        <TextField
                                            key={setting.key}
                                            id={fieldId}
                                            label={setting.label}
                                            help={setting.help}
                                            disabled={!can}
                                            type={
                                                setting.type === 'number'
                                                    ? 'number'
                                                    : setting.type === 'password'
                                                    ? 'password'
                                                    : 'text'
                                            }
                                            autoComplete={setting.type === 'password' ? 'new-password' : undefined}
                                            placeholder={
                                                setting.type === 'password' && setting.saved
                                                    ? 'A value is saved, type a new one to replace it'
                                                    : setting.placeholder
                                            }
                                            value={String(value)}
                                            onChange={(v) => set(setting.key, v)}
                                        />
                                    );
                            }
                        })}
                    </Stack>
                    {can && (
                        <div className={'mt-6 flex justify-end'}>
                            <Button onClick={save} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </SectionCard>
                <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'About'}>
                    <dl className={'divide-y divide-neutral-500'}>
                        <Fact label={'Version'} icon={TagIcon}>
                            {data.version}
                        </Fact>
                        {data.author && (
                            <Fact label={'Author'} icon={UserIcon}>
                                {data.author}
                            </Fact>
                        )}
                        {data.homepage && (
                            <Fact label={'Website'} icon={LinkIcon}>
                                <a href={data.homepage} target={'_blank'} rel={'noopener noreferrer'}>
                                    {data.homepage}
                                </a>
                            </Fact>
                        )}
                        <Fact label={'Id'} icon={HashtagIcon}>
                            <code>{data.id}</code>
                        </Fact>
                        <Fact label={'State'} icon={LightningBoltIcon}>
                            {data.enabled ? 'On' : 'Off'}
                        </Fact>
                    </dl>
                </SectionCard>
            </div>
        </AdminPage>
    );
};
