import React, { useEffect, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { ArrowLeftIcon, GlobeAltIcon, ShieldCheckIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import AdminLink from '@/components/admin/AdminLink';
import { Pill } from '@/components/admin/AdminTable';
import { Columns, Notice, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import http from '@/api/http';
import { deleteSetting, postSetting, saveSetting, ZoneCertificate, ZoneForm } from '@/api/admin/settings';

interface Verdict {
    ok: boolean;
    message: string;
}

/** Admin > Settings > Domains > one domain (or a new one): the DNS provider the panel adds records at. */
export default () => {
    const { id } = useParams<{ id?: string }>();
    const type = new URLSearchParams(useLocation().search).get('type') ?? 'cloudflare';
    const history = useHistory();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<ZoneForm | null>(null);
    const [values, setValues] = useState({ name: '', domain: '', ttl: '120', enabled: true });
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const exists = !!id;
    const can = admin.can('settings.domains.update');
    const pending = form?.certificate?.status === 'pending';

    // Asked again every few seconds while the certificate is being got.
    useEffect(() => {
        if (!pending || !id) return;
        const timer = setInterval(
            () =>
                http
                    .get(`/api/client/admin/settings/domains/zones/${id}`)
                    .then(({ data }) => setForm(data))
                    .catch(() => undefined),
            4000
        );

        return () => clearInterval(timer);
    }, [pending, id]);

    const fill = (z: ZoneForm) => {
        setForm(z);
        setValues({ name: z.name, domain: z.domain, ttl: String(z.ttl), enabled: z.enabled });
        setCredentials(Object.fromEntries(z.fields.map((f) => [f.key, f.value])));
    };

    useEffect(() => {
        setForm(null);
        http.get(`/api/client/admin/settings/domains/${exists ? `zones/${id}` : `blank?type=${type}`}`)
            .then(({ data }) => fill(data))
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    }, [id, type]);

    if (!form) return <Spinner size={'large'} centered />;

    const run = (work: Promise<unknown>, then: (result: any) => void) => {
        clearFlashes('admin');
        setBusy(true);
        work.then(then)
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const body = { ...values, type: form.type, credentials };
    const say = (v: Verdict) => addFlash({ key: 'admin', type: v.ok ? 'success' : 'warning', message: v.message });

    const save = () =>
        run(
            saveSetting<ZoneForm & Verdict>(
                exists ? `domains/zones/${id}` : 'domains/zones',
                body,
                exists ? 'patch' : 'post'
            ),
            (saved) => {
                say(saved);
                if (!exists) history.push(`/admin/settings/domains/zones/${saved.id}`);
                else fill(saved);
            }
        );

    return (
        <SettingsFrame
            title={exists ? form.domain : `Add a domain at ${form.provider}`}
            subtitle={'A domain the panel hands out names under.'}
            actions={
                <AdminLink to={'/admin/settings/domains'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Domains
                    </Button.Text>
                </AdminLink>
            }
        >
            <SectionCard
                icon={<GlobeAltIcon className={'h-5 w-5'} />}
                title={`Access to ${form.provider}`}
                description={form.help ?? undefined}
            >
                <Stack>
                    <Columns>
                        <TextField
                            id={'zone-domain'}
                            label={'Domain'}
                            value={values.domain}
                            disabled={!can || exists}
                            placeholder={'example.com'}
                            onChange={(domain) => setValues({ ...values, domain })}
                            help={`People take names under it: play.${values.domain || 'example.com'}. ${
                                exists ? 'It can not be changed.' : 'It can not be changed later.'
                            }`}
                        />
                        <TextField
                            id={'zone-name'}
                            label={'Name for you'}
                            value={values.name}
                            maxLength={60}
                            disabled={!can}
                            onChange={(name) => setValues({ ...values, name })}
                            placeholder={'Main domain'}
                        />
                    </Columns>
                    <TextField
                        id={'zone-ttl'}
                        type={'number'}
                        label={'TTL (seconds)'}
                        value={values.ttl}
                        disabled={!can}
                        onChange={(ttl) => setValues({ ...values, ttl })}
                        help={'How long resolvers keep the record. Short means changes show sooner.'}
                    />
                    {form.fields.map((field) => (
                        <TextField
                            key={field.key}
                            id={`zone-${field.key}`}
                            type={field.secret ? 'password' : 'text'}
                            autoComplete={field.secret ? 'new-password' : undefined}
                            label={field.label}
                            value={credentials[field.key] ?? ''}
                            disabled={!can}
                            placeholder={field.secret && field.saved ? 'Saved, enter a new one to replace it' : ''}
                            onChange={(value) => setCredentials({ ...credentials, [field.key]: value })}
                            help={`${field.help ?? ''}${
                                field.secret ? ' Stored encrypted, never shown again.' : ''
                            }`.trim()}
                        />
                    ))}
                    <ToggleField
                        label={'People can take a name under this domain'}
                        help={'The access is checked when you save. If it does not work the domain is switched off.'}
                        checked={values.enabled}
                        disabled={!can}
                        onChange={(enabled) => setValues({ ...values, enabled })}
                    />
                    {exists && (
                        <Notice tone={'blue'}>
                            {form.names} {form.names === 1 ? 'name is' : 'names are'} under this domain.
                        </Notice>
                    )}
                </Stack>
                {can && (
                    <div className={'mt-6 flex flex-wrap justify-between gap-3'}>
                        {exists ? (
                            <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                                Remove
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        <div className={'flex gap-3'}>
                            {exists && (
                                <Button.Text
                                    disabled={busy}
                                    onClick={() => run(postSetting<Verdict>(`domains/zones/${id}/test`), say)}
                                >
                                    Test the access
                                </Button.Text>
                            )}
                            <Button onClick={save} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    </div>
                )}
            </SectionCard>

            {exists && form.certificate && (
                <SectionCard
                    className={'mt-4'}
                    icon={<ShieldCheckIcon className={'h-5 w-5'} />}
                    title={"Certificate from Let's Encrypt"}
                    description={`A free certificate for ${form.domain} and everything under it (*.${form.domain}). The panel adds the TXT records that prove the domain at ${form.provider} itself and removes them again, nothing has to be done by hand. It renews itself before it ends.`}
                    badge={
                        form.certificate.status === 'pending' ? (
                            <Pill tone={'primary'}>Getting one...</Pill>
                        ) : form.certificate.certificate ? (
                            <Pill
                                tone={
                                    form.certificate.certificate.expired
                                        ? 'red'
                                        : form.certificate.certificate.expiring
                                        ? 'yellow'
                                        : 'green'
                                }
                            >
                                {form.certificate.certificate.expired
                                    ? 'Expired'
                                    : `${form.certificate.certificate.days_left} days left`}
                            </Pill>
                        ) : undefined
                    }
                >
                    {form.certificate.status === 'failed' && form.certificate.message && (
                        <div className={'mb-3'}>
                            <Notice tone={'red'}>It did not work: {form.certificate.message}</Notice>
                        </div>
                    )}
                    {form.certificate.certificate && (
                        <p className={'mb-3 text-sm text-neutral-200'}>
                            <AdminLink
                                to={`/admin/settings/certificates/${form.certificate.certificate.id}`}
                                className={'font-medium'}
                            >
                                {form.certificate.certificate.name}
                            </AdminLink>
                            {form.certificate.certificate.not_after &&
                                ` ends ${new Date(form.certificate.certificate.not_after).toLocaleDateString()}`}
                        </p>
                    )}
                    {can && (
                        <Button
                            disabled={busy || !form.certificate.can_request}
                            onClick={() =>
                                run(postSetting<ZoneCertificate>(`domains/zones/${id}/certificate`), (state) => {
                                    addFlash({
                                        key: 'admin',
                                        type: 'success',
                                        message: `Getting a certificate for ${form.domain} and *.${form.domain}. This takes a minute or two, it shows here when it is done.`,
                                    });
                                    setForm({ ...form, certificate: state });
                                })
                            }
                        >
                            <ShieldCheckIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            {form.certificate.certificate ? 'Renew now' : 'Get a certificate'}
                        </Button>
                    )}
                    {!form.certificate.can_request && form.certificate.status !== 'pending' && (
                        <p className={'mt-2 text-xs text-neutral-400'}>
                            Turn on Let&apos;s Encrypt under Settings → Certificates first.
                        </p>
                    )}
                </SectionCard>
            )}
            <Dialog.Confirm
                open={deleting}
                title={`Remove ${form.domain}?`}
                confirm={'Remove'}
                onConfirmed={() =>
                    run(deleteSetting(`domains/zones/${id}`), () => {
                        addFlash({ key: 'admin', type: 'success', message: `${form.domain} was removed.` });
                        history.push('/admin/settings/domains');
                    })
                }
                onClose={() => setDeleting(false)}
            >
                The {form.names} names under it and their DNS records are removed too.
            </Dialog.Confirm>
        </SettingsFrame>
    );
};
