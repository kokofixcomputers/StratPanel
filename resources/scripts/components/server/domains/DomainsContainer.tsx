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
import { createDomain, deleteDomain, DomainList, getDomains, ServerDomain } from '@/api/server/domains';

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
            {domain.dnsOk ? (
                <p css={tw`flex items-center text-sm font-medium text-green-700 mb-4`}>
                    <CheckCircleIcon css={tw`w-5 h-5 mr-2`} />
                    DNS is ready, players can join with this domain.
                </p>
            ) : (
                <div css={tw`mb-4`}>
                    <p css={tw`text-sm font-medium text-yellow-700 mb-2`}>Waiting for DNS...</p>
                    <SlidingBar role={'progressbar'} aria-label={'Waiting for DNS'} />
                    <p css={tw`mt-2 text-xs text-neutral-400`}>
                        Add this record at your domain provider. This page checks again every 30 seconds, DNS changes
                        can take a few minutes to arrive.
                    </p>
                </div>
            )}
            <div css={tw`grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
                <RecordField label={'Type'} value={'A'} />
                <RecordField label={'Name / Host'} value={recordName(domain.domain)} />
                <RecordField label={'Value / Points to'} value={targetIp || 'the address of this panel'} />
                <RecordField label={'TTL'} value={'Auto (or 300)'} />
            </div>
            <p css={tw`mt-3 text-xs text-neutral-400`}>
                Full name: <span css={tw`font-mono`}>{domain.domain}</span>. Some providers want the full name instead
                of just the host part.
            </p>
            {!domain.dnsOk && (
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
            css={tw`flex items-center justify-center w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-semibold flex-shrink-0 mt-0.5`}
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

    // DNS changes take a while to spread, keep checking for domains that are not pointing at us yet.
    useEffect(() => {
        if (!list || list.domains.every((d) => d.dnsOk)) return;

        const timer = setInterval(load, 30000);

        return () => clearInterval(timer);
    }, [list, load]);

    const openAdd = () => {
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
            await createDomain(uuid, domain, allocationId);
            if (target) await applyForcedHost(domain.trim().toLowerCase().replace(/\.$/, ''), target);
            setAdding(false);
            const refreshed = await getDomains(uuid);
            setList(refreshed);
            const created = refreshed.domains.find((d) => d.domain === domain.trim().toLowerCase().replace(/\.$/, ''));
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
                <p css={tw`text-base font-semibold text-neutral-50 mb-4`}>How it works</p>
                <ol css={tw`space-y-3 m-0 p-0 list-none`}>
                    <Step index={1}>
                        At your domain provider, add an <strong>A record</strong> for the domain or subdomain you want
                        (for example <code>play</code> or <code>@</code>) pointing to{' '}
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
                        Add the domain below and choose which port of this server it should lead to. On a proxy you can
                        also pick the server behind it that players of that domain land on.
                    </Step>
                    <Step index={3}>
                        Players type just the domain, no port needed. DNS changes can take a few minutes to arrive.
                    </Step>
                </ol>
            </div>

            <ListHeader
                icon={<GlobeAltIcon className={'w-6 h-6'} />}
                title={'Domains'}
                count={list ? `${list.domains.length}${list.max > 0 ? ` / ${list.max}` : ''}` : undefined}
            >
                <Can action={'allocation.update'}>
                    {list?.enabled && (list.max === 0 || list.domains.length < list.max) && (
                        <Button onClick={openAdd}>
                            <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                            Add domain
                        </Button>
                    )}
                </Can>
            </ListHeader>

            {!list ? (
                <Spinner size={'large'} centered />
            ) : !list.enabled ? (
                <EmptyState>Custom domains are not enabled on this panel.</EmptyState>
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
                <p css={tw`text-sm text-neutral-400 mb-6`}>
                    Make sure the A record already points to {list?.targetIp || 'this panel'}, or add it right after.
                </p>
                {error && (
                    <p css={tw`mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700`}>
                        {error}
                    </p>
                )}
                <div css={tw`space-y-4`}>
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
                    <LegacyButton disabled={!domain.trim() || !allocationId || saving} onClick={submit}>
                        Add domain
                    </LegacyButton>
                </div>
            </Modal>
        </ServerContentBlock>
    );
};
