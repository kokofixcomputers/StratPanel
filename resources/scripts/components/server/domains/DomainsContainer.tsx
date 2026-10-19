import React, { useCallback, useEffect, useState } from 'react';
import tw from 'twin.macro';
import styled, { keyframes } from 'styled-components/macro';
import copy from 'copy-to-clipboard';
import {
    ArrowRightIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardCopyIcon,
    ExclamationIcon,
    PlusIcon,
    RefreshIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import { GlobeAltIcon } from '@heroicons/react/outline';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Modal from '@/components/elements/Modal';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import Label from '@/components/elements/Label';
import LegacyButton from '@/components/elements/Button';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Can from '@/components/elements/Can';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { isProxyServer } from '@/components/server/versions/detectCurrent';
import { forcedServerByHost, ProxyHosts, readProxyHosts, setForcedHost } from '@/lib/proxyHosts';
import {
    checkDomainName,
    createDomain,
    createManagedDomain,
    deleteDomain,
    NameCheck,
    DomainList,
    getDomains,
    requestDomainCertificate,
    ServerDomain,
} from '@/api/server/domains';
import { anyPending, cleanLabel, httpsSummary, validLabel } from '@/lib/domainHttps';

const slide = keyframes`
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
`;

/** A bar with a block sliding across it, for work that has no known progress. */
const SlidingBar = styled.div`
    ${tw`relative h-1.5 w-full overflow-hidden rounded-full bg-neutral-600`};

    &::after {
        content: '';
        ${tw`absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary-600`};
        animation: ${slide} 1.4s ease-in-out infinite;
    }
`;

/** The name part of the record: the subdomain for subdomains, or @ for the root of a domain. */
export const recordName = (domain: string): string => {
    const labels = domain.split('.');

    return labels.length <= 2 ? '@' : labels.slice(0, -2).join('.');
};

const RecordField = ({ label, value }: { label: string; value: string }) => (
    <div css={tw`min-w-0`}>
        <p css={tw`text-xs uppercase tracking-wide text-neutral-400 mb-1`}>{label}</p>
        <button
            type={'button'}
            title={'Copy'}
            onClick={() => copy(value)}
            css={tw`inline-flex max-w-full items-center rounded-lg border border-neutral-500 bg-white px-3 py-1.5 font-mono text-sm text-neutral-50 hover:border-primary-500`}
        >
            <span css={tw`truncate`}>{value}</span>
            <ClipboardCopyIcon css={tw`w-3.5 h-3.5 ml-2 flex-shrink-0 text-neutral-400`} />
        </button>
    </div>
);

/** What the panel finds when it looks the domain up, so a wrong or slow record can be told apart. */
const DnsNote = ({ domain }: { domain: ServerDomain }) => (
    <p css={tw`mt-2 text-xs text-neutral-400`}>
        {domain.dns.resolvesTo.length === 0 ? (
            <>The panel finds no address for this domain yet.</>
        ) : (
            <>
                The panel sees <span css={tw`font-mono`}>{domain.dns.resolvesTo.join(', ')}</span>
                {domain.dns.expected.length > 0 && (
                    <>
                        , it expects <span css={tw`font-mono`}>{domain.dns.expected.join(' or ')}</span>
                    </>
                )}
                . If the domain works in your browser, the panel may be looking from behind another address (set{' '}
                <code>PTERODACTYL_DOMAINS_TARGET_IP</code> to the public address).
            </>
        )}
    </p>
);

const RecordPanel = ({
    domain,
    targetIp,
    onCheck,
}: {
    domain: ServerDomain;
    targetIp: string;
    onCheck: () => Promise<unknown>;
}) => {
    const [checking, setChecking] = useState(false);

    return (
        <div css={tw`border-t border-neutral-500 bg-neutral-700/40 rounded-b-xl px-4 py-4`}>
            {domain.managed ? (
                domain.dnsOk ? (
                    <p css={tw`flex items-center text-sm font-medium text-green-700`}>
                        <CheckCircleIcon css={tw`w-5 h-5 mr-2`} />
                        Ready, players can join with this name. The panel set up the DNS for you.
                    </p>
                ) : (
                    <div>
                        <p css={tw`text-sm font-medium text-yellow-700 mb-2`}>Almost there...</p>
                        <SlidingBar role={'progressbar'} aria-label={'Waiting for DNS'} />
                        <p css={tw`mt-2 text-xs text-neutral-400`}>
                            The panel added the DNS record. It can take a minute or two to reach everyone; this page
                            checks again by itself.
                        </p>
                        <DnsNote domain={domain} />
                    </div>
                )
            ) : domain.dnsOk ? (
                <p css={tw`flex items-center text-sm font-medium text-green-700 mb-4`}>
                    <CheckCircleIcon css={tw`w-5 h-5 mr-2`} />
                    DNS is ready, players can join with this domain.
                </p>
            ) : (
                <div css={tw`mb-4`}>
                    <p css={tw`text-sm font-medium text-yellow-700 mb-2`}>Waiting for DNS...</p>
                    <SlidingBar role={'progressbar'} aria-label={'Waiting for DNS'} />
                    <DnsNote domain={domain} />
                    <p css={tw`mt-2 text-xs text-neutral-400`}>
                        Add this record at your domain provider. This page checks again every 30 seconds, DNS changes
                        can take a few minutes to arrive.
                    </p>
                </div>
            )}
            {!domain.managed && (
                <>
                    <div css={tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
                        <RecordField label={'Type'} value={'A'} />
                        <RecordField label={'Name / Host'} value={recordName(domain.domain)} />
                        <RecordField label={'Value / Points to'} value={targetIp || 'the address of this panel'} />
                        <RecordField label={'TTL'} value={'Auto (or 300)'} />
                    </div>
                    <p css={tw`mt-3 text-xs text-neutral-400`}>
                        Full name: <span css={tw`font-mono`}>{domain.domain}</span>. Some providers want the full name
                        instead of just the host part.
                    </p>
                </>
            )}
            {!domain.dnsOk && !domain.managed && (
                <Button.Text
                    css={tw`mt-3`}
                    disabled={checking}
                    onClick={() => {
                        setChecking(true);
                        onCheck().finally(() => setChecking(false));
                    }}
                >
                    <RefreshIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                    {checking ? 'Checking...' : 'Check now'}
                </Button.Text>
            )}
        </div>
    );
};

const Step = ({ index, children }: { index: number; children: React.ReactNode }) => (
    <li css={tw`flex items-start`}>
        <span
            css={tw`flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-snow text-xs font-semibold flex-shrink-0 mt-0.5`}
        >
            {index}
        </span>
        <div css={tw`ml-3 text-sm text-neutral-200`}>{children}</div>
    </li>
);

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const { addFlash, clearFlashes } = useFlash();

    const [list, setList] = useState<DomainList | null>(null);
    const [adding, setAdding] = useState(false);
    const [domain, setDomain] = useState('');
    // The two ways: bring a domain, or take a name under a domain of the admin (the panel makes the DNS record).
    const [mode, setMode] = useState<'own' | 'managed'>('own');
    const [label, setLabel] = useState('');
    const [zoneId, setZoneId] = useState(0);
    const [nameCheck, setNameCheck] = useState<'idle' | 'checking' | NameCheck>('idle');
    const [allocationId, setAllocationId] = useState<number>(0);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState<ServerDomain | null>(null);
    const [error, setError] = useState('');
    // On a proxy a domain can also lead players to one of the servers behind it.
    const [proxy, setProxy] = useState<ProxyHosts | null>(null);
    const [target, setTarget] = useState('');
    const [expanded, setExpanded] = useState<number[]>([]);

    const loadProxy = useCallback(async () => {
        setProxy((await isProxyServer(uuid).catch(() => false)) ? await readProxyHosts(uuid).catch(() => null) : null);
    }, [uuid]);

    useEffect(() => {
        loadProxy();
    }, [loadProxy]);

    const forced = proxy ? forcedServerByHost(proxy.config) : {};

    // Velocity only reads forced hosts again on a reload.
    const applyForcedHost = async (host: string, server: string | null) => {
        if (await setForcedHost(uuid, host, server)) {
            if ((status === 'running' || status === 'starting') && instance)
                instance.send('send command', 'velocity reload');
            await loadProxy();
        }
    };

    const load = useCallback(
        () =>
            getDomains(uuid)
                .then(setList)
                .catch((e) => addFlash({ key: 'domains', type: 'error', message: httpErrorToHuman(e) })),
        [uuid]
    );

    useEffect(() => {
        load();
    }, [load]);

    // A certificate that is being requested takes a moment, look again until it is there (or failed).
    useEffect(() => {
        if (!list || !anyPending(list.domains)) return;

        const timer = setInterval(load, 4000);

        return () => clearInterval(timer);
    }, [list, load]);

    const replace = (updated: ServerDomain) =>
        setList(
            (current) =>
                current && { ...current, domains: current.domains.map((d) => (d.id === updated.id ? updated : d)) }
        );

    const getCertificate = (d: ServerDomain, method: 'http' | 'dns' = 'http') => {
        clearFlashes('domains');
        requestDomainCertificate(uuid, d.id, method)
            .then(replace)
            .catch((e) => addFlash({ key: 'domains', type: 'error', message: httpErrorToHuman(e) }));
    };

    // DNS changes take a while to spread, keep checking for domains that are not pointing at us yet.
    useEffect(() => {
        if (!list || list.domains.every((d) => d.dnsOk)) return;

        const timer = setInterval(load, 30000);

        return () => clearInterval(timer);
    }, [list, load]);

    const canOwn = !!list?.enabled;
    const zones = list?.zones ?? [];
    const canManaged = zones.length > 0;
    const zone = zones.find((z) => z.id === zoneId);

    // Whether the name is free, asked when typing stops.
    useEffect(() => {
        if (!adding || mode !== 'managed' || !zoneId || !label) {
            setNameCheck('idle');
            return;
        }
        if (!validLabel(label)) {
            setNameCheck({ available: false, reason: 'Use letters, numbers and dashes, not at the start or the end.' });
            return;
        }
        let stale = false;
        setNameCheck('checking');
        const timer = setTimeout(() => {
            checkDomainName(uuid, zoneId, label)
                .then((result) => !stale && setNameCheck(result))
                .catch(() => !stale && setNameCheck('idle'));
        }, 400);

        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [adding, mode, zoneId, label, uuid]);

    const openAdd = () => {
        setMode(canManaged ? 'managed' : 'own');
        setLabel('');
        setZoneId(zones[0]?.id ?? 0);
        setDomain('');
        setError('');
        setAllocationId((allocations.find((a) => a.isDefault) || allocations[0])?.id || 0);
        setTarget('');
        setAdding(true);
    };

    const submit = async () => {
        setSaving(true);
        setError('');
        try {
            const full =
                mode === 'managed' ? `${label}.${zone?.domain}` : domain.trim().toLowerCase().replace(/\.$/, '');
            if (mode === 'managed') await createManagedDomain(uuid, zoneId, label, allocationId);
            else await createDomain(uuid, domain, allocationId);
            if (target) await applyForcedHost(full, target);
            setAdding(false);
            const refreshed = await getDomains(uuid);
            setList(refreshed);
            const created = refreshed.domains.find((d) => d.domain === full);
            if (created) setExpanded((ids) => [...ids, created.id]);
        } catch (e) {
            setError(httpErrorToHuman(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!removing) return;

        clearFlashes('domains');
        try {
            await deleteDomain(uuid, removing.id);
            if (forced[removing.domain.toLowerCase()])
                await applyForcedHost(removing.domain, null).catch(() => undefined);
            setList(
                (current) => current && { ...current, domains: current.domains.filter((d) => d.id !== removing.id) }
            );
        } catch (e) {
            addFlash({ key: 'domains', type: 'error', message: httpErrorToHuman(e) });
        }
        setRemoving(null);
    };

    return (
        <ServerContentBlock title={'Domains'}>
            <PageHeader title={'Domains'} subtitle={`Let players join ${serverName} with your own domain`} />
            <FlashMessageRender byKey={'domains'} css={tw`mb-4`} />

            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                {canManaged && (
                    <div css={canOwn ? tw`mb-5 pb-5 border-b border-neutral-500` : undefined}>
                        <p css={tw`text-base font-semibold text-neutral-50 mb-2`}>
                            {canOwn ? 'Take a name here' : 'How it works'}
                        </p>
                        <p css={tw`text-sm text-neutral-300`}>
                            Type a name and pick one of{' '}
                            {zones.slice(0, 3).map((z, i) => (
                                <React.Fragment key={z.id}>
                                    {i > 0 && ', '}
                                    <code>{z.domain}</code>
                                </React.Fragment>
                            ))}
                            {zones.length > 3 ? ` and ${zones.length - 3} more` : ''}. The panel sets up the DNS for
                            you, there is nothing to configure.
                        </p>
                    </div>
                )}
                {canOwn && (
                    <>
                        <p css={tw`text-base font-semibold text-neutral-50 mb-4`}>
                            {canManaged ? 'Or bring your own domain' : 'How it works'}
                        </p>
                        <ol css={tw`space-y-3 m-0 p-0 list-none`}>
                            <Step index={1}>
                                At your domain provider, add an <strong>A record</strong> for the domain or subdomain
                                you want (for example <code>play</code> or <code>@</code>) pointing to{' '}
                                {list?.targetIp ? (
                                    <button
                                        type={'button'}
                                        onClick={() => copy(list.targetIp)}
                                        title={'Copy'}
                                        css={tw`inline-flex items-center font-mono text-primary-700 bg-primary-50 rounded px-1.5 py-0.5 hover:bg-primary-100`}
                                    >
                                        {list.targetIp}
                                        <ClipboardCopyIcon css={tw`w-3.5 h-3.5 ml-1.5`} />
                                    </button>
                                ) : (
                                    'the address of this panel'
                                )}
                                .
                            </Step>
                            <Step index={2}>
                                Add the domain below and choose which port of this server it should lead to. On a proxy
                                you can also pick the server behind it that players of that domain land on.
                            </Step>
                            <Step index={3}>
                                Players type just the domain, no port needed. DNS changes can take a few minutes to
                                arrive.
                            </Step>
                        </ol>
                    </>
                )}
            </div>

            <ListHeader
                icon={<GlobeAltIcon className={'w-6 h-6'} />}
                title={'Domains'}
                count={list ? `${list.domains.length}${list.max > 0 ? ` / ${list.max}` : ''}` : undefined}
            >
                <Can action={'allocation.update'}>
                    {(canOwn || canManaged) && (list!.max === 0 || list!.domains.length < list!.max) && (
                        <Button onClick={openAdd}>
                            <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                            Add domain
                        </Button>
                    )}
                </Can>
            </ListHeader>

            {!list ? (
                <Spinner size={'large'} centered />
            ) : !canOwn && !canManaged ? (
                <EmptyState>Domains are not enabled on this panel.</EmptyState>
            ) : list.domains.length === 0 ? (
                <EmptyState>No domains yet. Add one to let players join with a custom address.</EmptyState>
            ) : (
                list.domains.map((d) => (
                    <div key={d.id} css={tw`bg-white border border-neutral-500 rounded-xl shadow-md mb-3`}>
                        <div css={tw`flex flex-wrap items-center gap-3 p-4`}>
                            <span
                                css={tw`flex items-center justify-center w-11 h-11 rounded-full bg-primary-50 text-primary-600 flex-shrink-0`}
                            >
                                <GlobeAltIcon css={tw`w-5 h-5`} />
                            </span>
                            <div css={tw`flex-1 min-w-0`}>
                                <button
                                    type={'button'}
                                    onClick={() => copy(d.domain)}
                                    title={'Copy'}
                                    css={tw`block max-w-full text-left text-base font-semibold font-mono text-neutral-50 truncate hover:text-primary-600`}
                                >
                                    {d.domain}
                                </button>
                                <p css={tw`flex items-center text-xs text-neutral-400 mt-0.5`}>
                                    <ArrowRightIcon css={tw`w-3.5 h-3.5 mr-1.5`} />
                                    <span css={tw`font-mono truncate`}>{d.allocation}</span>
                                </p>
                            </div>
                            {proxy && (
                                <Can action={'allocation.update'}>
                                    <div css={tw`w-44`} title={'The server players of this domain are sent to'}>
                                        <Select
                                            value={forced[d.domain.toLowerCase()] || ''}
                                            onChange={(e) =>
                                                applyForcedHost(d.domain, e.currentTarget.value || null).catch((err) =>
                                                    addFlash({
                                                        key: 'domains',
                                                        type: 'error',
                                                        message: httpErrorToHuman(err),
                                                    })
                                                )
                                            }
                                        >
                                            <option value={''}>Default server</option>
                                            {proxy.config.servers.map((s) => (
                                                <option key={s.id} value={s.name}>
                                                    {s.name}
                                                </option>
                                            ))}
                                        </Select>
                                    </div>
                                </Can>
                            )}
                            {d.dnsOk ? (
                                <span
                                    css={tw`rounded-full bg-green-50 text-green-700 border border-green-200 px-3 py-1 text-xs font-medium`}
                                >
                                    DNS ready
                                </span>
                            ) : (
                                <span
                                    title={`Waiting for an A record pointing to ${list.targetIp}`}
                                    css={tw`inline-flex items-center rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 text-xs font-medium`}
                                >
                                    <ExclamationIcon css={tw`w-3.5 h-3.5 mr-1.5`} />
                                    Waiting for DNS
                                </span>
                            )}
                            <button
                                type={'button'}
                                aria-label={expanded.includes(d.id) ? 'Hide DNS record' : 'Show DNS record'}
                                aria-expanded={expanded.includes(d.id)}
                                onClick={() =>
                                    setExpanded((ids) =>
                                        ids.includes(d.id) ? ids.filter((id) => id !== d.id) : [...ids, d.id]
                                    )
                                }
                                css={tw`p-2 rounded-lg text-neutral-400 hover:text-neutral-50 hover:bg-neutral-600 transition-colors duration-150`}
                            >
                                {expanded.includes(d.id) ? (
                                    <ChevronUpIcon css={tw`w-4 h-4`} />
                                ) : (
                                    <ChevronDownIcon css={tw`w-4 h-4`} />
                                )}
                            </button>
                            <Can action={'allocation.update'}>
                                <button
                                    type={'button'}
                                    aria-label={'Remove domain'}
                                    onClick={() => setRemoving(d)}
                                    css={tw`p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150`}
                                >
                                    <TrashIcon css={tw`w-4 h-4`} />
                                </button>
                            </Can>
                        </div>
                        <div
                            css={tw`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-500 px-4 py-3 text-sm`}
                        >
                            <>
                                <span
                                    css={[
                                        tw`flex-1 min-w-0 truncate text-xs`,
                                        d.https.status === 'failed' ? tw`text-red-600` : tw`text-neutral-400`,
                                    ]}
                                    title={httpsSummary(d.https)}
                                >
                                    {httpsSummary(d.https)}
                                </span>
                                <Can action={'allocation.update'}>
                                    {d.https.status === 'pending' ? (
                                        <Spinner size={'small'} />
                                    ) : (
                                        <>
                                            {d.https.canRequest && (
                                                <Button
                                                    type={'button'}
                                                    size={Button.Sizes.Small}
                                                    onClick={() => getCertificate(d)}
                                                >
                                                    {d.https.status === 'failed'
                                                        ? 'Try again'
                                                        : 'Get a free certificate'}
                                                </Button>
                                            )}
                                            {d.https.canRequestDns && (
                                                <Button
                                                    type={'button'}
                                                    size={Button.Sizes.Small}
                                                    variant={Button.Variants.Secondary}
                                                    title={
                                                        'Proves the domain with a TXT record you add. Works for domains on a private address.'
                                                    }
                                                    onClick={() => getCertificate(d, 'dns')}
                                                >
                                                    {d.https.renewByDns
                                                        ? 'Renew with a DNS record'
                                                        : 'Get one with a DNS record'}
                                                </Button>
                                            )}
                                            {!d.https.canRequest &&
                                                !d.https.canRequestDns &&
                                                d.https.reason &&
                                                d.https.status !== 'issued' && (
                                                    <span css={tw`text-xs text-neutral-400`} title={d.https.reason}>
                                                        {d.https.reason}
                                                    </span>
                                                )}
                                        </>
                                    )}
                                </Can>
                            </>
                        </div>
                        {d.https.status === 'pending' && d.https.dns && (
                            <div css={tw`border-t border-neutral-500 px-4 py-3 text-sm`}>
                                <p css={tw`text-neutral-200 mb-3`}>
                                    Add this TXT record at your DNS provider. The panel checks every few seconds (for up
                                    to 15 minutes) and gets the certificate as soon as it can see it. You can remove the
                                    record afterwards. A certificate this way lasts 90 days and is renewed by pressing
                                    the button again.
                                </p>
                                <div css={tw`flex flex-wrap gap-4`}>
                                    <RecordField label={'Type'} value={'TXT'} />
                                    <RecordField label={'Name'} value={d.https.dns.name} />
                                    <RecordField label={'Value'} value={d.https.dns.value} />
                                </div>
                            </div>
                        )}
                        {expanded.includes(d.id) && <RecordPanel domain={d} targetIp={list.targetIp} onCheck={load} />}
                    </div>
                ))
            )}

            <Dialog.Confirm
                open={!!removing}
                onClose={() => setRemoving(null)}
                title={'Remove domain'}
                confirm={'Remove'}
                onConfirmed={remove}
            >
                Players will no longer be able to join through <strong>{removing?.domain}</strong>.
            </Dialog.Confirm>

            <Modal
                visible={adding}
                dismissable={!saving}
                showSpinnerOverlay={saving}
                onDismissed={() => setAdding(false)}
            >
                <h2 css={tw`text-xl mb-2 pr-10`}>Add a domain</h2>
                {canOwn && canManaged ? (
                    <div
                        role={'radiogroup'}
                        aria-label={'Kind of domain'}
                        css={tw`grid grid-cols-2 gap-2 mb-5 p-1 rounded-xl bg-neutral-600`}
                    >
                        {(
                            [
                                ['managed', 'A name here', 'We set up the DNS'],
                                ['own', 'My own domain', 'You add an A record'],
                            ] as const
                        ).map(([value, title, text]) => (
                            <button
                                key={value}
                                type={'button'}
                                role={'radio'}
                                aria-checked={mode === value}
                                onClick={() => setMode(value)}
                                className={`rounded-lg px-3 py-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30 ${
                                    mode === value
                                        ? 'bg-white shadow text-primary-700'
                                        : 'text-neutral-300 hover:text-neutral-50'
                                }`}
                            >
                                <span className={'block text-sm font-semibold'}>{title}</span>
                                <span className={'block text-xs opacity-75'}>{text}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <p css={tw`text-sm text-neutral-400 mb-6`}>
                        {mode === 'managed'
                            ? 'Pick a name, the panel adds the DNS record.'
                            : `Make sure the A record already points to ${
                                  list?.targetIp || 'this panel'
                              }, or add it right after.`}
                    </p>
                )}
                {error && (
                    <p css={tw`mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700`}>
                        {error}
                    </p>
                )}
                <div css={tw`space-y-4`}>
                    {mode === 'managed' ? (
                        <div>
                            <Label htmlFor={'domain-label'}>Name</Label>
                            <div css={tw`flex items-center gap-2`}>
                                <Input
                                    id={'domain-label'}
                                    type={'text'}
                                    autoFocus
                                    value={label}
                                    maxLength={63}
                                    placeholder={'play'}
                                    autoComplete={'off'}
                                    spellCheck={false}
                                    css={tw`font-mono flex-1 min-w-0`}
                                    onChange={(e) => setLabel(cleanLabel(e.currentTarget.value))}
                                />
                                <span css={tw`text-neutral-400 font-mono`}>.</span>
                                {zones.length === 1 ? (
                                    <span css={tw`font-mono text-sm text-neutral-50 truncate`}>{zones[0].domain}</span>
                                ) : (
                                    <Select
                                        aria-label={'Domain'}
                                        value={zoneId}
                                        css={tw`flex-1 min-w-0 font-mono`}
                                        onChange={(e) => setZoneId(Number(e.currentTarget.value))}
                                    >
                                        {zones.map((z) => (
                                            <option key={z.id} value={z.id}>
                                                {z.domain}
                                            </option>
                                        ))}
                                    </Select>
                                )}
                            </div>
                            <p
                                css={tw`mt-2 min-h-[1.25rem] text-sm flex items-center`}
                                aria-live={'polite'}
                                role={'status'}
                            >
                                {nameCheck === 'checking' ? (
                                    <span css={tw`text-neutral-400 flex items-center`}>
                                        <Spinner size={'small'} css={tw`mr-2`} /> Checking...
                                    </span>
                                ) : nameCheck !== 'idle' && nameCheck.available ? (
                                    <span css={tw`text-green-700 flex items-center`}>
                                        <CheckCircleIcon css={tw`w-4 h-4 mr-1.5`} />
                                        <span css={tw`font-mono`}>{nameCheck.domain}</span>
                                        <span css={tw`ml-1`}>is free</span>
                                    </span>
                                ) : nameCheck !== 'idle' ? (
                                    <span css={tw`text-red-600 flex items-center`}>
                                        <ExclamationIcon css={tw`w-4 h-4 mr-1.5`} />
                                        {nameCheck.reason}
                                    </span>
                                ) : label === '' ? (
                                    <span css={tw`text-neutral-400`}>Players will join with this name.</span>
                                ) : null}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <Label htmlFor={'domain-name'}>Domain</Label>
                            <Input
                                id={'domain-name'}
                                type={'text'}
                                autoFocus
                                value={domain}
                                placeholder={'play.example.com'}
                                css={tw`font-mono`}
                                onChange={(e) => setDomain(e.currentTarget.value)}
                            />
                        </div>
                    )}
                    <div>
                        <Label htmlFor={'domain-allocation'}>Send players to</Label>
                        <Select
                            id={'domain-allocation'}
                            value={allocationId}
                            onChange={(e) => setAllocationId(Number(e.currentTarget.value))}
                        >
                            {allocations.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {(a.alias || a.ip) + ':' + a.port}
                                    {a.isDefault ? ' (primary)' : ''}
                                </option>
                            ))}
                        </Select>
                    </div>
                    {proxy && (
                        <div>
                            <Label htmlFor={'domain-server'}>Send players to server</Label>
                            <Select
                                id={'domain-server'}
                                value={target}
                                onChange={(e) => setTarget(e.currentTarget.value)}
                            >
                                <option value={''}>Default (the first server players join)</option>
                                {proxy.config.servers.map((s) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name} ({s.address})
                                    </option>
                                ))}
                            </Select>
                            <p css={tw`mt-1.5 text-xs text-neutral-400`}>
                                Players using this domain land on that server through the proxy.
                            </p>
                        </div>
                    )}
                </div>
                <div
                    css={tw`mt-6 flex justify-end space-x-3 -mx-5 sm:-mx-6 md:-mx-8 -mb-5 sm:-mb-6 md:-mb-8 px-8 py-5 bg-neutral-900 border-t border-neutral-500 rounded-b-2xl`}
                >
                    <LegacyButton isSecondary onClick={() => setAdding(false)}>
                        Cancel
                    </LegacyButton>
                    <LegacyButton
                        disabled={
                            saving ||
                            !allocationId ||
                            (mode === 'managed'
                                ? !zoneId ||
                                  !validLabel(label) ||
                                  nameCheck === 'checking' ||
                                  (nameCheck !== 'idle' && !nameCheck.available)
                                : !domain.trim())
                        }
                        onClick={submit}
                    >
                        Add domain
                    </LegacyButton>
                </div>
            </Modal>
        </ServerContentBlock>
    );
};
