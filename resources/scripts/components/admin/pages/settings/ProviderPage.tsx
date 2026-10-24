import React, { useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { ArrowLeftIcon, LoginIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import AdminLink from '@/components/admin/AdminLink';
import { Columns, Notice, Stack, TextField, ToggleField } from '@/components/admin/forms';
import CopyOnClick from '@/components/elements/CopyOnClick';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import http from '@/api/http';
import { deleteSetting, ProviderForm, saveSetting } from '@/api/admin/settings';

const MAPPING: [string, string][] = [
    ['id', 'Unique id'],
    ['email', 'Email address'],
    ['username', 'Username'],
    ['name', 'Full name'],
    ['email_verified', 'Email checked'],
];

type Values = Record<string, string | boolean>;

const toValues = (form: ProviderForm): Values => ({
    name: form.name,
    key: form.key,
    client_id: form.client_id,
    client_secret: '',
    scopes: form.scopes,
    enabled: form.enabled,
    allow_signup: form.allow_signup,
    authorize_url: form.authorize_url,
    token_url: form.token_url,
    userinfo_url: form.userinfo_url,
    ...Object.fromEntries(MAPPING.map(([key]) => [`map_${key}`, form.mapping[key] ?? ''])),
});

/** Admin > Settings > Providers > one provider (or a new one): the application, the service and who can use it. */
export default () => {
    const { id } = useParams<{ id?: string }>();
    const type = new URLSearchParams(useLocation().search).get('type');
    const history = useHistory();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<ProviderForm | null>(null);
    const [values, setValues] = useState<Values>({});
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const exists = !!id;
    const can = admin.can('settings.providers.update');

    const load = () =>
        http
            .get(`/api/client/admin/settings/providers/${exists ? id : `blank?type=${type}`}`)
            .then(({ data }) => {
                setForm(data);
                setValues(toValues(data));
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));

    useEffect(() => {
        setForm(null);
        load();
    }, [id, type]);

    if (!form) return <Spinner size={'large'} centered />;

    const set = (changes: Values) => setValues({ ...values, ...changes });
    const text = (key: string) => String(values[key] ?? '');

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        saveSetting<ProviderForm>(
            exists ? `providers/${id}` : 'providers',
            { ...values, type: form.type },
            exists ? 'patch' : 'post'
        )
            .then((saved) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: exists
                        ? `${saved.name} was saved.`
                        : `${saved.name} was added. Copy the callback address below into the service and switch it on.`,
                });
                if (!exists) history.push(`/admin/settings/providers/${saved.id}`);
                else {
                    setForm(saved);
                    setValues(toValues(saved));
                }
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () => {
        deleteSetting(`providers/${id}`)
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: `${form.name} was removed. Accounts linked to it can sign in with their password only.`,
                });
                history.push('/admin/settings/providers');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });
    };

    return (
        <SettingsFrame
            title={exists ? form.name : `Add ${form.preset.name}`}
            subtitle={`Sign in with ${form.preset.name}.`}
            actions={
                <AdminLink to={'/admin/settings/providers'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Providers
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <div className={'space-y-4 lg:col-span-2'}>
                    <SectionCard
                        icon={<LoginIcon className={'h-5 w-5'} />}
                        title={'The application'}
                        description={`Make an application (an "OAuth app") at the service and give it the callback address on the right. Then enter the client ID and secret it gives you.`}
                    >
                        <Stack>
                            <Columns>
                                <TextField
                                    id={'provider-name'}
                                    label={'Name on the button'}
                                    value={text('name')}
                                    maxLength={60}
                                    disabled={!can}
                                    onChange={(name) => set({ name })}
                                />
                                <TextField
                                    id={'provider-key'}
                                    label={'Key'}
                                    value={text('key')}
                                    maxLength={40}
                                    disabled={!can || exists}
                                    onChange={(key) => set({ key })}
                                    help={`Part of the addresses, lowercase letters, digits and dashes. ${
                                        exists ? 'It can not be changed.' : 'It can not be changed later.'
                                    }`}
                                />
                            </Columns>
                            <Columns>
                                <TextField
                                    id={'provider-client-id'}
                                    label={'Client ID'}
                                    value={text('client_id')}
                                    disabled={!can}
                                    onChange={(client_id) => set({ client_id })}
                                />
                                <TextField
                                    id={'provider-secret'}
                                    type={'password'}
                                    autoComplete={'new-password'}
                                    label={'Client secret'}
                                    value={text('client_secret')}
                                    disabled={!can}
                                    placeholder={
                                        form.secret_saved ? 'A secret is saved, enter a new one to replace it' : ''
                                    }
                                    onChange={(client_secret) => set({ client_secret })}
                                    help={'Stored encrypted, never shown again.'}
                                />
                            </Columns>
                            <TextField
                                id={'provider-scopes'}
                                label={'Scopes'}
                                value={text('scopes')}
                                placeholder={form.default_scopes}
                                disabled={!can}
                                onChange={(scopes) => set({ scopes })}
                                help={
                                    'What the panel asks for, separated by spaces. Leave empty for the default. It needs the email address and a way to tell accounts apart.'
                                }
                            />
                        </Stack>
                    </SectionCard>
                    {form.generic && (
                        <SectionCard icon={<LoginIcon className={'h-5 w-5'} />} title={'The service'}>
                            <Stack>
                                <TextField
                                    id={'provider-authorize'}
                                    label={'Authorization address'}
                                    value={text('authorize_url')}
                                    disabled={!can}
                                    onChange={(authorize_url) => set({ authorize_url })}
                                />
                                <TextField
                                    id={'provider-token'}
                                    label={'Token address'}
                                    value={text('token_url')}
                                    disabled={!can}
                                    onChange={(token_url) => set({ token_url })}
                                />
                                <TextField
                                    id={'provider-userinfo'}
                                    label={'User info address'}
                                    value={text('userinfo_url')}
                                    disabled={!can}
                                    onChange={(userinfo_url) => set({ userinfo_url })}
                                    help={'Answered with JSON about the person when asked with their access token.'}
                                />
                                <Columns>
                                    {MAPPING.map(([key, label]) => (
                                        <TextField
                                            key={key}
                                            id={`provider-map-${key}`}
                                            label={label}
                                            value={text(`map_${key}`)}
                                            disabled={!can}
                                            onChange={(value) => set({ [`map_${key}`]: value })}
                                        />
                                    ))}
                                </Columns>
                                <p className={'text-xs text-neutral-400'}>
                                    The names of the fields in the answer (a.b for a field inside another). The id has
                                    to stay the same for a person forever, it is how they are recognised.
                                </p>
                            </Stack>
                        </SectionCard>
                    )}
                </div>
                <div className={'space-y-4'}>
                    <SectionCard icon={<LoginIcon className={'h-5 w-5'} />} title={'Callback address'}>
                        <CopyOnClick text={form.callback}>
                            <code className={'block break-all rounded bg-neutral-600 p-2 text-xs'}>
                                {form.callback}
                            </code>
                        </CopyOnClick>
                        <p className={'mt-2 text-xs text-neutral-400'}>
                            Enter this as the redirect / callback address at the service. It has to match exactly.
                        </p>
                    </SectionCard>
                    <SectionCard icon={<LoginIcon className={'h-5 w-5'} />} title={'Who can use it'}>
                        <Stack>
                            <ToggleField
                                label={'On: people can sign in and link it'}
                                checked={!!values.enabled}
                                disabled={!can}
                                onChange={(enabled) => set({ enabled })}
                            />
                            <ToggleField
                                label={'People without an account can sign up with it'}
                                help={'Needs self sign up.'}
                                checked={!!values.allow_signup}
                                disabled={!can}
                                onChange={(allow_signup) => set({ allow_signup })}
                            />
                            <Notice tone={'blue'}>
                                An existing account is never found by its email address, people link a provider
                                themselves under Account → Providers.
                            </Notice>
                        </Stack>
                    </SectionCard>
                    {can && (
                        <div className={'flex justify-between gap-3'}>
                            {exists ? (
                                <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                                    Remove
                                </Button.Danger>
                            ) : (
                                <span />
                            )}
                            <Button onClick={save} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            <Dialog.Confirm
                open={deleting}
                title={`Remove ${form.name}?`}
                confirm={'Remove'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                Accounts linked to it lose that way of signing in.
            </Dialog.Confirm>
        </SettingsFrame>
    );
};
