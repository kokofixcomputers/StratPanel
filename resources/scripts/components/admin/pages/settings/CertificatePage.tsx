import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CalendarIcon,
    ClockIcon,
    FingerPrintIcon,
    GlobeAltIcon,
    LockClosedIcon,
    OfficeBuildingIcon,
    RefreshIcon,
} from '@heroicons/react/solid';
import Fact from '@/components/admin/Fact';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import AdminLink from '@/components/admin/AdminLink';
import { Pill } from '@/components/admin/AdminTable';
import { Stack, TextField, ToggleField } from '@/components/admin/forms';
import PemField from '@/components/admin/pages/settings/PemField';
import { ends } from '@/components/admin/pages/settings/CertificatesPage';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { CertificateDetail, deleteSetting, saveSetting, useSetting } from '@/api/admin/settings';

/** Admin > Settings > Certificates > one certificate: what it covers, its settings, renewing it, deleting it. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const history = useHistory();
    const admin = useAdmin();
    const { data, mutate } = useSetting<CertificateDetail>(`certificates/${id}`);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [values, setValues] = useState({ name: '', enabled: true, is_default: false });
    const [renew, setRenew] = useState({ certificate: '', private_key: '', passphrase: '' });
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const can = admin.can('settings.certificates.update');

    useEffect(() => {
        if (data) setValues({ name: data.name, enabled: data.enabled, is_default: data.is_default });
    }, [data]);

    if (!data) return <Spinner size={'large'} centered />;

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        saveSetting<CertificateDetail>(`certificates/${id}`, { ...values, ...renew })
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: `${fresh.name} was saved.` });
                setRenew({ certificate: '', private_key: '', passphrase: '' });

                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () =>
        deleteSetting(`certificates/${id}`)
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: `${data.name} was deleted. It is no longer used within a minute.`,
                });
                history.push('/admin/settings/certificates');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });

    return (
        <SettingsFrame
            title={data.name}
            subtitle={'A certificate for https.'}
            actions={
                <AdminLink to={'/admin/settings/certificates'}>
                    <Button.Text>
                        <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Certificates
                    </Button.Text>
                </AdminLink>
            }
        >
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <div className={'space-y-4 lg:col-span-2'}>
                    <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Certificate'}>
                        <dl className={'divide-y divide-neutral-500'}>
                            <Fact label={'Covers'} icon={GlobeAltIcon}>
                                {data.domains.join(', ')}
                            </Fact>
                            <Fact label={'Issued by'} icon={OfficeBuildingIcon}>
                                {data.issuer || 'unknown'}
                            </Fact>
                            <Fact label={'Valid from'} icon={ClockIcon}>
                                {data.not_before ? new Date(data.not_before).toLocaleString() : ''}
                            </Fact>
                            <Fact label={'Ends'} icon={CalendarIcon}>
                                {data.not_after ? new Date(data.not_after).toLocaleString() : ''}{' '}
                                {(data.expired || data.expiring) && (
                                    <Pill tone={data.expired ? 'red' : 'yellow'}>
                                        {ends(data.days_left, data.expired, data.expiring, data.not_after)}
                                    </Pill>
                                )}
                            </Fact>
                            <Fact label={'Fingerprint'} icon={FingerPrintIcon}>
                                <code className={'text-xs'}>{data.fingerprint}</code>
                            </Fact>
                        </dl>
                    </SectionCard>
                    {can && (
                        <SectionCard
                            icon={<RefreshIcon className={'h-5 w-5'} />}
                            title={'Renew'}
                            description={
                                'When the certificate was renewed, add the new one here. It keeps its name, whether it is on and whether it is the default. Leave empty to change nothing.'
                            }
                        >
                            <Stack>
                                <PemField
                                    id={'renew-cert'}
                                    label={'New certificate'}
                                    value={renew.certificate}
                                    onChange={(certificate) => setRenew({ ...renew, certificate })}
                                />
                                <PemField
                                    id={'renew-key'}
                                    label={'Private key'}
                                    value={renew.private_key}
                                    onChange={(private_key) => setRenew({ ...renew, private_key })}
                                />
                                <TextField
                                    id={'renew-pass'}
                                    type={'password'}
                                    autoComplete={'new-password'}
                                    label={'Passphrase of the key (optional)'}
                                    value={renew.passphrase}
                                    onChange={(passphrase) => setRenew({ ...renew, passphrase })}
                                />
                            </Stack>
                        </SectionCard>
                    )}
                </div>
                <div className={'space-y-4'}>
                    <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Settings'}>
                        <Stack>
                            <TextField
                                id={'cert-name'}
                                label={'Name'}
                                value={values.name}
                                maxLength={100}
                                disabled={!can}
                                onChange={(name) => setValues({ ...values, name })}
                            />
                            <ToggleField
                                label={'On: panel-edge uses it'}
                                checked={values.enabled}
                                disabled={!can}
                                onChange={(enabled) => setValues({ ...values, enabled })}
                            />
                            <ToggleField
                                label={'Default'}
                                help={'Used for names no certificate covers, and for the IP address.'}
                                checked={values.is_default}
                                disabled={!can}
                                onChange={(is_default) => setValues({ ...values, is_default })}
                            />
                        </Stack>
                    </SectionCard>
                    {can && (
                        <div className={'flex justify-between gap-3'}>
                            <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                                Delete
                            </Button.Danger>
                            <Button onClick={save} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            <Dialog.Confirm
                open={deleting}
                title={`Delete ${data.name}?`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                Visitors of the names it covers get an error until another certificate covers them.
            </Dialog.Confirm>
        </SettingsFrame>
    );
};
