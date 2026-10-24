import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useParams } from 'react-router-dom';
import { LockClosedIcon, ServerIcon, UploadIcon } from '@heroicons/react/solid';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import { Pill } from '@/components/admin/AdminTable';
import { Notice, SelectField, Stack, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import {
    chooseCertificate,
    enableHttps,
    NodeCertificateState,
    pushCertificate,
    useNode,
    useNodeCertificate,
} from '@/api/admin/nodes';

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className={'flex justify-between gap-4 py-2 text-sm'}>
        <dt className={'text-neutral-400'}>{label}</dt>
        <dd className={'min-w-0 break-words text-right text-neutral-100'}>{children}</dd>
    </div>
);

const SOURCES: Record<string, string> = {
    pushed: 'the panel (this page)',
    file: 'a file on the node',
};

/** Admin > Nodes > one node > Certificate: the https certificate the node uses, and giving it one. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: node } = useNode(id);
    const { data, error, mutate } = useNodeCertificate(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [choice, setChoice] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [needsConfirmation, setNeedsConfirmation] = useState(false);
    const [busy, setBusy] = useState(false);
    const can = admin.can('nodes.certificate');

    useEffect(() => {
        if (data) {
            setChoice(
                data.node.certificate_auto && data.node.certificate_id === null
                    ? 'auto'
                    : String(data.node.certificate_id ?? '')
            );
        }
    }, [data]);

    if (!node || !data) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<NodeCertificateState>, message?: string) => {
        clearFlashes('admin');
        setBusy(true);
        work.then((fresh) => {
            addFlash({
                key: 'admin',
                type: fresh.ok === false ? 'warning' : 'success',
                message: fresh.message ?? message ?? '',
            });

            return mutate(fresh, false);
        })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                if (e?.response?.data?.needs_confirmation) setNeedsConfirmation(true);
            })
            .then(() => setBusy(false));
    };

    const live = data.live;
    const certificate = live.certificate;
    const showConfirm = needsConfirmation || data.node.scheme !== 'https' || !data.node.pushed_at;

    return (
        <NodeFrame id={node.id} name={node.name} subtitle={'The https certificate of this node.'}>
            <div className={'grid gap-4 lg:grid-cols-2'}>
                <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'What the node has'}>
                    {live.error ? (
                        <Notice tone={'red'}>
                            The node could not be asked: {live.error}
                            <br />
                            The certificate needs the Stratosphere version of Wings, which has the /api/certificates
                            route.
                        </Notice>
                    ) : !live.present || !certificate ? (
                        <p className={'text-sm text-neutral-200'}>
                            It has no certificate. Browsers will not trust it over https until it gets one.
                        </p>
                    ) : (
                        <dl className={'divide-y divide-neutral-500'}>
                            <Fact label={'Covers'}>{certificate.names.join(', ')}</Fact>
                            <Fact label={'From'}>
                                {SOURCES[certificate.source] ??
                                    'a temporary certificate nothing trusts, made by the node until it gets one'}
                            </Fact>
                            <Fact label={'Ends'}>
                                {new Date(certificate.not_after).toLocaleString()}{' '}
                                {new Date(certificate.not_after) < new Date() && <Pill tone={'red'}>Expired</Pill>}
                            </Fact>
                            <Fact label={'Fingerprint'}>
                                <code className={'text-xs'}>{certificate.fingerprint}</code>
                            </Fact>
                        </dl>
                    )}
                    {data.assigned && certificate && certificate.fingerprint !== data.assigned.fingerprint && (
                        <div className={'mt-3'}>
                            <Notice>This is not the certificate that is chosen here, press Push now.</Notice>
                        </div>
                    )}
                </SectionCard>

                <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={'The panel and this node'}>
                    <p className={'text-sm text-neutral-200'}>
                        The panel reaches this node over {data.node.scheme} at {data.node.fqdn}:{data.node.port}.
                    </p>
                    {data.node.pushed_at && (
                        <p className={'mt-2 text-sm text-neutral-300'}>
                            Last given a certificate{' '}
                            {formatDistanceToNow(new Date(data.node.pushed_at), { addSuffix: true })}.
                        </p>
                    )}
                    {data.node.error && (
                        <div className={'mt-3'}>
                            <Notice tone={'red'}>Last problem: {data.node.error}</Notice>
                        </div>
                    )}
                </SectionCard>

                <SectionCard icon={<LockClosedIcon className={'h-5 w-5'} />} title={'Certificate for this node'}>
                    <Stack>
                        <SelectField
                            id={'node-cert-choice'}
                            label={'Use'}
                            value={choice}
                            disabled={!can}
                            choices={[
                                { value: '', label: 'None' },
                                {
                                    value: 'auto',
                                    label: `The one that covers ${data.node.fqdn}${
                                        data.candidate ? ` (now: ${data.candidate.name})` : ' (none does yet)'
                                    }`,
                                },
                                ...data.certificates.map((c) => ({
                                    value: String(c.id),
                                    label: `${c.name} (${c.domains.join(', ')})${
                                        c.covers ? '' : ' - does not cover this node'
                                    }`,
                                })),
                            ]}
                            onChange={setChoice}
                            help={
                                'The certificates are the ones added under Settings → Certificates. "The one that covers" follows renewals by itself: a new certificate is given to the node within the hour.'
                            }
                        />
                        {can && (
                            <div className={'flex justify-end'}>
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        run(
                                            chooseCertificate(node.id, choice),
                                            `The choice was saved.${
                                                node.scheme === 'https'
                                                    ? ' A changed certificate is given to the node within the hour, or press Push now.'
                                                    : ''
                                            }`
                                        )
                                    }
                                >
                                    Save
                                </Button>
                            </div>
                        )}
                    </Stack>
                </SectionCard>

                {can && (
                    <SectionCard icon={<UploadIcon className={'h-5 w-5'} />} title={'Give it to the node'}>
                        <Stack>
                            <p className={'text-sm text-neutral-200'}>
                                The certificate and its private key are sent to the node, it uses them from the next
                                connection on, nothing is restarted.
                                {data.node.scheme !== 'https' && ' This node is reached over http now.'}
                            </p>
                            {showConfirm && (
                                <ToggleField
                                    label={'Give it without checking who answers'}
                                    help={`The first time, the key is sent to whatever is at ${data.node.fqdn}: fine on a network you trust, not over the open internet if you are not sure the name is yours.`}
                                    checked={confirm}
                                    onChange={setConfirm}
                                />
                            )}
                            <div className={'flex flex-wrap justify-between gap-3'}>
                                <Button.Text
                                    disabled={busy || !data.assigned}
                                    title={
                                        'Gives it the certificate and then switches the panel to https for this node when that works'
                                    }
                                    onClick={() => run(enableHttps(node.id, confirm))}
                                >
                                    Enable https on this node
                                </Button.Text>
                                <Button
                                    disabled={busy || !data.assigned}
                                    onClick={() => run(pushCertificate(node.id, confirm))}
                                >
                                    Push now
                                </Button>
                            </div>
                        </Stack>
                    </SectionCard>
                )}
            </div>
        </NodeFrame>
    );
};
