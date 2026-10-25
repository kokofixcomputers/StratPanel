import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useHistory } from 'react-router-dom';
import { LockClosedIcon, ServerIcon, ShieldCheckIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { Notice, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import PemField from '@/components/admin/pages/settings/PemField';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { Certificates, DomainCertificate, postSetting, saveSetting, useSetting } from '@/api/admin/settings';

export const ends = (days: number | null, expired: boolean, expiring: boolean, date: string | null) =>
    expired ? 'Expired' : expiring ? `${days} days left` : `${date?.slice(0, 10)} (${days} days)`;

/** Admin > Settings > Certificates: the certificates the panel is served with over https. */
export default () => {
    const admin = useAdmin();
    const history = useHistory();
    const [polling, setPolling] = useState(false);
    const { data, mutate } = useSetting<Certificates>('certificates', { refreshInterval: polling ? 4000 : 0 });
    // Asked again every few seconds while a certificate is being got.
    useEffect(() => setPolling(!!data?.domains.some((d) => d.status === 'pending')), [data]);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [acme, setAcme] = useState<{ enabled: boolean; email: string; staging: boolean; agree: boolean } | null>(
        null
    );
    const [fresh, setFresh] = useState({ name: '', certificate: '', private_key: '', passphrase: '' });
    const [busy, setBusy] = useState(false);
    const can = admin.can('settings.certificates.update');

    if (data && !acme) setAcme({ ...data.acme, agree: false });

    const run = (work: Promise<unknown>, then: (result: any) => void) => {
        clearFlashes('admin');
        setBusy(true);
        work.then(then)
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const ask = (domain: DomainCertificate, method: 'http' | 'dns') =>
        run(postSetting<Certificates>('certificates/letsencrypt/issue', { domain_id: domain.id, method }), (next) => {
            addFlash({
                key: 'admin',
                type: 'success',
                message: `Getting a certificate for ${domain.domain}. ${
                    method === 'dns'
                        ? 'Add the TXT record that is shown, it is checked every few seconds.'
                        : 'This takes a moment, the state of the domain shows how it goes.'
                }`,
            });
            mutate(next, false);
        });

    return (
        <SettingsFrame title={'Certificates'} subtitle={'Serve the panel over https with certificates you add here.'}>
            {!data || !acme ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <div className={'space-y-4 lg:col-span-2'}>
                        <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Certificates'}>
                            {data.certificates.length === 0 ? (
                                <Empty>No certificates yet. Add one on the right.</Empty>
                            ) : (
                                <AdminTable heads={['Name', 'Covers', 'Ends']}>
                                    {data.certificates.map((c) => (
                                        <Row
                                            key={c.id}
                                            onClick={() => history.push(`/admin/settings/certificates/${c.id}`)}
                                        >
                                            <Cell className={'font-medium text-neutral-50'}>
                                                {c.name} {c.is_default && <Pill tone={'primary'}>Default</Pill>}{' '}
                                                {!c.enabled && <Pill>Off</Pill>}{' '}
                                                {c.source === 'letsencrypt' && (
                                                    <Pill>
                                                        {c.acme_method === 'dns'
                                                            ? "Let's Encrypt (DNS)"
                                                            : "Let's Encrypt"}
                                                    </Pill>
                                                )}{' '}
                                                {c.renew_error && <Pill tone={'red'}>Renewal failed</Pill>}{' '}
                                                {c.no_chain && <Pill tone={'yellow'}>No chain</Pill>}
                                            </Cell>
                                            <Cell>
                                                {c.domains.slice(0, 4).join(', ')}
                                                {c.domains.length > 4 && ` +${c.domains.length - 4} more`}
                                            </Cell>
                                            <Cell>
                                                <Pill tone={c.expired ? 'red' : c.expiring ? 'yellow' : 'neutral'}>
                                                    {ends(c.days_left, c.expired, c.expiring, c.not_after)}
                                                </Pill>
                                            </Cell>
                                        </Row>
                                    ))}
                                </AdminTable>
                            )}
                        </SectionCard>

                        <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'How it is served'}>
                            <Stack>
                                <p className={'text-sm text-neutral-200'}>
                                    The panel itself (PHP) can not do https, so a small program next to it does: the
                                    edge listens on port 443, picks the certificate that belongs to the name the visitor
                                    used (wildcards too), and passes the request on to the web server of the panel. It
                                    asks the panel for the certificates every minute, so what you add, replace or delete
                                    here is in use within a minute and nothing has to be restarted.
                                </p>
                                {!data.token_configured ? (
                                    <Notice>
                                        It is not set up on this machine. Run{' '}
                                        <code>sudo bash tools/stratnet/install.sh edge</code> in the folder of the
                                        panel, it installs the program, makes the secret
                                        (PTERODACTYL_CERTIFICATES_TOKEN) and starts it.
                                    </Notice>
                                ) : data.edge === null ? (
                                    <Notice>
                                        The secret is set but the edge has not asked for certificates yet. Is it
                                        running? <code>systemctl status stratosphere-net</code>
                                    </Notice>
                                ) : (
                                    <p className={'text-sm text-neutral-200'}>
                                        <Pill tone={data.edge.recent ? 'green' : 'red'}>
                                            {data.edge.recent ? 'Connected' : 'Not seen lately'}
                                        </Pill>{' '}
                                        the edge last asked{' '}
                                        {formatDistanceToNow(new Date(data.edge.at), { addSuffix: true })} (from{' '}
                                        {data.edge.ip}) and was given {data.edge.count}{' '}
                                        {data.edge.count === 1 ? 'certificate' : 'certificates'}.
                                    </p>
                                )}
                            </Stack>
                        </SectionCard>

                        {data.domains.length > 0 && (
                            <SectionCard
                                icon={<ShieldCheckIcon className={'h-5 w-5'} />}
                                title={'Certificates for added domains'}
                                description={
                                    "The domains that were added to servers. Get a free certificate from Let's Encrypt for one: over port 80 when the domain points at this panel, or with a TXT record when it does not."
                                }
                            >
                                <AdminTable heads={['Domain', 'Server', 'State', null]}>
                                    {data.domains.map((d) => (
                                        <Row key={d.id}>
                                            <Cell className={'font-medium text-neutral-50'}>{d.domain}</Cell>
                                            <Cell>{d.server}</Cell>
                                            <Cell>
                                                {d.status === 'pending' ? (
                                                    <Pill tone={'primary'}>Getting one...</Pill>
                                                ) : d.status === 'issued' || d.covered_by ? (
                                                    <Pill tone={'green'}>{d.covered_by ?? 'Has one'}</Pill>
                                                ) : d.status === 'failed' ? (
                                                    <span title={d.message ?? ''}>
                                                        <Pill tone={'red'}>Failed</Pill>
                                                    </span>
                                                ) : (
                                                    <Pill>None</Pill>
                                                )}
                                                {d.message && d.status === 'failed' && (
                                                    <p className={'mt-1 max-w-xs text-xs text-red-600'}>{d.message}</p>
                                                )}
                                                {d.dns && (
                                                    <p className={'mt-1 max-w-xs break-all text-xs text-neutral-300'}>
                                                        Add this TXT record: <code>{d.dns.name}</code> ={' '}
                                                        <code>{d.dns.value}</code>
                                                    </p>
                                                )}
                                            </Cell>
                                            <Cell>
                                                {can && (
                                                    <div className={'flex justify-end gap-1'}>
                                                        <Button.Text
                                                            disabled={busy || !d.can_request}
                                                            title={d.reason ?? 'Prove the domain over port 80'}
                                                            onClick={() => ask(d, 'http')}
                                                        >
                                                            Get certificate
                                                        </Button.Text>
                                                        <Button.Text
                                                            disabled={busy || !d.can_request_dns}
                                                            title={'Prove the domain with a TXT record'}
                                                            onClick={() => ask(d, 'dns')}
                                                        >
                                                            By DNS
                                                        </Button.Text>
                                                    </div>
                                                )}
                                            </Cell>
                                        </Row>
                                    ))}
                                </AdminTable>
                            </SectionCard>
                        )}

                        <SectionCard
                            icon={<ShieldCheckIcon className={'h-5 w-5'} />}
                            title={"Let's Encrypt"}
                            description={
                                'Adds a button to the Domains tab of a server that gets a free certificate for that domain, with nothing to set up by hand: the panel proves the domain over port 80, adds the certificate here and renews it before it ends. The domain has to point at this machine.'
                            }
                        >
                            <Stack>
                                <ToggleField
                                    label={'Let people get free certificates for their domains'}
                                    checked={acme.enabled}
                                    disabled={!can}
                                    onChange={(enabled) => setAcme({ ...acme, enabled })}
                                />
                                {!data.acme.enabled && acme.enabled && (
                                    <ToggleField
                                        label={"I agree to the Let's Encrypt Subscriber Agreement"}
                                        checked={acme.agree}
                                        disabled={!can}
                                        onChange={(agree) => setAcme({ ...acme, agree })}
                                    />
                                )}
                                <TextField
                                    id={'acme-email'}
                                    type={'email'}
                                    label={'Email address (optional)'}
                                    value={acme.email}
                                    disabled={!can}
                                    onChange={(email) => setAcme({ ...acme, email })}
                                    help={
                                        "Only for notices from Let's Encrypt about certificates that are about to end."
                                    }
                                />
                                <ToggleField
                                    label={"Test mode (Let's Encrypt staging: certificates nothing trusts, no limits)"}
                                    checked={acme.staging}
                                    disabled={!can}
                                    onChange={(staging) => setAcme({ ...acme, staging })}
                                />
                                {data.edge?.http ? (
                                    <p className={'text-xs text-neutral-400'}>Port 80 is answered by the edge.</p>
                                ) : (
                                    <Notice>
                                        Port 80 is not answered by the edge. Set <code>HTTP_LISTEN=:80</code> in{' '}
                                        <code>/etc/stratosphere-net.env</code> (the web server has to move off port 80,
                                        see tools/stratnet/edge/README.md).
                                    </Notice>
                                )}
                            </Stack>
                            {can && (
                                <div className={'mt-6 flex justify-end'}>
                                    <Button
                                        disabled={busy}
                                        onClick={() =>
                                            run(saveSetting<Certificates>('certificates/letsencrypt', acme), (next) => {
                                                addFlash({
                                                    key: 'admin',
                                                    type: 'success',
                                                    message: "The Let's Encrypt settings were saved.",
                                                });
                                                mutate(next, false);
                                                setAcme({ ...next.acme, agree: false });
                                            })
                                        }
                                    >
                                        Save
                                    </Button>
                                </div>
                            )}
                        </SectionCard>
                    </div>

                    <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Add a certificate'}>
                        {can ? (
                            <Stack>
                                <TextField
                                    id={'cert-name'}
                                    label={'Name'}
                                    value={fresh.name}
                                    maxLength={100}
                                    onChange={(name) => setFresh({ ...fresh, name })}
                                />
                                <PemField
                                    id={'cert-pem'}
                                    label={'Certificate'}
                                    value={fresh.certificate}
                                    onChange={(certificate) => setFresh({ ...fresh, certificate })}
                                    help={
                                        'Paste it or choose the file (fullchain.pem). Your own certificate comes first, then the intermediates.'
                                    }
                                />
                                <PemField
                                    id={'cert-key'}
                                    label={'Private key'}
                                    value={fresh.private_key}
                                    onChange={(private_key) => setFresh({ ...fresh, private_key })}
                                    help={'Stored encrypted and never shown again.'}
                                />
                                <TextField
                                    id={'cert-pass'}
                                    type={'password'}
                                    autoComplete={'new-password'}
                                    label={'Passphrase of the key (optional)'}
                                    value={fresh.passphrase}
                                    onChange={(passphrase) => setFresh({ ...fresh, passphrase })}
                                />
                                <Button
                                    disabled={busy || !fresh.name.trim()}
                                    onClick={() =>
                                        run(
                                            postSetting<{ id: number; message: string; warning: string | null }>(
                                                'certificates',
                                                fresh
                                            ),
                                            (created) => {
                                                addFlash({ key: 'admin', type: 'success', message: created.message });
                                                if (created.warning)
                                                    addFlash({
                                                        key: 'admin',
                                                        type: 'warning',
                                                        message: created.warning,
                                                    });
                                                setFresh({
                                                    name: '',
                                                    certificate: '',
                                                    private_key: '',
                                                    passphrase: '',
                                                });
                                                mutate();
                                            }
                                        )
                                    }
                                >
                                    Add
                                </Button>
                            </Stack>
                        ) : (
                            <p className={'text-sm text-neutral-300'}>
                                You may look at the certificates, not change them.
                            </p>
                        )}
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
