import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, SearchIcon, ServerIcon } from '@heroicons/react/solid';
import getServers from '@/api/getServers';
import { Server } from '@/api/server/getServer';
import { ServerContext } from '@/state/server';
import { ProxyServer, uid } from '@/lib/velocity';
import { ip } from '@/lib/formatters';
import { Dialog } from '@/components/elements/dialog';
import { Button } from '@/components/elements/button/index';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import { httpErrorToHuman } from '@/api/http';
import { BackendResult, BackendState, configureBackend, detectBackend } from '@/lib/proxyBackend';

interface Props {
    open: boolean;
    existing: ProxyServer[];
    onClose: () => void;
    onAdd: (servers: ProxyServer[]) => void;
    // The forwarding secret of the proxy (made when it has none yet), for setting up the servers that are added.
    ensureSecret: () => Promise<string>;
    // How the proxy forwards player info, the secret is only used by Modern.
    forwardingMode?: string;
}

export const addressOf = (server: Server): string | null => {
    const allocation = server.allocations.find((a) => a.isDefault) || server.allocations[0];

    return allocation ? `${allocation.alias || ip(allocation.ip)}:${allocation.port}` : null;
};

/** Velocity names only allow letters, numbers, dashes and underscores. */
export const toProxyName = (name: string, taken: string[]): string => {
    const base =
        name
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'server';
    let candidate = base;
    for (let n = 2; taken.includes(candidate); n++) candidate = `${base}-${n}`;

    return candidate;
};

/** Lists the user's other servers so they can be added to the proxy by picking them instead of typing an address. */
export default ({ open, existing, onClose, onAdd, ensureSecret, forwardingMode }: Props) => {
    const current = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [servers, setServers] = useState<Server[] | null>(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    // After picking: whether to set the servers up for the proxy, which of them, and how it went.
    const [step, setStep] = useState<'pick' | 'configure' | 'done'>('pick');
    const [kinds, setKinds] = useState<Record<string, BackendState>>({});
    const [chosen, setChosen] = useState<string[]>([]);
    const [working, setWorking] = useState(false);
    const [results, setResults] = useState<Record<string, BackendResult>>({});

    useEffect(() => {
        if (!open) return;

        setSelected([]);
        setQuery('');
        setError('');
        setStep('pick');
        setResults({});

        (async () => {
            try {
                const all: Server[] = [];
                for (let page = 1; page <= 10; page++) {
                    const result = await getServers({ page });
                    all.push(...result.items);
                    if (page >= result.pagination.totalPages) break;
                }
                setServers(all);
            } catch (e) {
                setError(httpErrorToHuman(e));
            }
        })();
    }, [open]);

    const taken = useMemo(() => new Set(existing.map((s) => s.address)), [existing]);
    const visible = useMemo(
        () =>
            (servers || [])
                .filter((s) => s.uuid !== current && addressOf(s))
                .filter((s) => !query || `${s.name} ${addressOf(s)}`.toLowerCase().includes(query.toLowerCase())),
        [servers, current, query]
    );

    const toggle = (uuid: string) =>
        setSelected((list) => (list.includes(uuid) ? list.filter((id) => id !== uuid) : [...list, uuid]));

    const picked = (servers || []).filter((s) => selected.includes(s.uuid));

    // The servers go on the list of the proxy, the first one becoming the one players land on when there is none yet.
    const addToProxy = () => {
        const names = existing.map((s) => s.name);
        let needsJoin = !existing.some((s) => s.join);
        const added: ProxyServer[] = picked.map((s) => {
            const name = toProxyName(s.name, names);
            names.push(name);
            const entry = { id: uid(), name, address: addressOf(s)!, join: needsJoin };
            needsJoin = false;

            return entry;
        });

        onAdd(added);
    };

    // Which of them can be set up: only Paper and its forks (they have config/paper-global.yml).
    const askToConfigure = () => {
        setStep('configure');
        setKinds({});
        setChosen([]);
        Promise.all(picked.map(async (s) => [s.uuid, await detectBackend(s.uuid)] as const)).then((found) => {
            setKinds(Object.fromEntries(found));
            setChosen(found.filter(([, kind]) => kind === 'paper').map(([uuid]) => uuid));
        });
    };

    const finish = (configure: boolean) => {
        addToProxy();
        if (!configure || chosen.length === 0) return onClose();

        setWorking(true);
        ensureSecret()
            .then(async (secret) => {
                const done: Record<string, BackendResult> = {};
                for (const uuid of chosen) done[uuid] = await configureBackend(uuid, secret);
                setResults(done);
            })
            .catch((e) =>
                setResults(
                    Object.fromEntries(chosen.map((uuid) => [uuid, { ok: false, message: httpErrorToHuman(e) }]))
                )
            )
            .then(() => {
                setWorking(false);
                setStep('done');
            });
    };

    const toggleChosen = (uuid: string) =>
        setChosen((list) => (list.includes(uuid) ? list.filter((id) => id !== uuid) : [...list, uuid]));

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={step === 'pick' ? 'Add servers' : step === 'configure' ? 'Set the servers up?' : 'Servers set up'}
            description={
                step === 'pick'
                    ? 'Pick servers from your account to add to the proxy.'
                    : step === 'configure'
                    ? 'Servers behind the proxy have to run in offline mode and know its forwarding secret. This can be done for you.'
                    : 'Restart the servers that were set up, and the proxy if you changed its forwarding.'
            }
        >
            {step === 'configure' && (
                <>
                    <div className={'max-h-72 space-y-2 overflow-y-auto'}>
                        {picked.map((server) => {
                            const kind = kinds[server.uuid];
                            const can = kind === 'paper' || kind === 'unknown';

                            return (
                                <label
                                    key={server.uuid}
                                    className={`flex items-center gap-3 rounded-lg border border-neutral-500 px-3 py-2 ${
                                        can ? 'cursor-pointer hover:bg-neutral-600' : 'opacity-50'
                                    }`}
                                >
                                    <input
                                        type={'checkbox'}
                                        disabled={!can}
                                        checked={chosen.includes(server.uuid)}
                                        onChange={() => toggleChosen(server.uuid)}
                                    />
                                    <ServerIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                                    <span className={'min-w-0 flex-1'}>
                                        <span className={'block truncate text-sm font-medium text-neutral-50'}>
                                            {server.name}
                                        </span>
                                        <span className={'block text-xs text-neutral-300'}>
                                            {kind === undefined
                                                ? 'Looking...'
                                                : kind === 'paper'
                                                ? 'Paper: online mode off, velocity forwarding on'
                                                : kind === 'other'
                                                ? 'Not Paper (no config/paper-global.yml), set it up by hand'
                                                : 'Could not look at its files, it may still work'}
                                        </span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {forwardingMode && forwardingMode !== 'MODERN' && (
                        <p className={'mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                            Player info forwarding of this proxy is not set to Modern, the secret is only used with
                            Modern. Change it under Player info forwarding.
                        </p>
                    )}
                    <p className={'mt-3 text-xs text-neutral-300'}>
                        server.properties gets <span className={'font-mono'}>online-mode=false</span> and
                        config/paper-global.yml gets velocity enabled with the secret of this proxy. Nothing else is
                        changed. The servers need a restart afterwards.
                    </p>
                    <Dialog.Footer>
                        <Button.Text disabled={working} onClick={() => finish(false)}>
                            Just add them
                        </Button.Text>
                        <Button
                            disabled={working || chosen.length === 0 || Object.keys(kinds).length < picked.length}
                            onClick={() => finish(true)}
                        >
                            Add and set up {chosen.length} {chosen.length === 1 ? 'server' : 'servers'}
                        </Button>
                    </Dialog.Footer>
                </>
            )}
            {step === 'done' && (
                <>
                    <div className={'max-h-72 space-y-2 overflow-y-auto'}>
                        {picked
                            .filter((server) => results[server.uuid])
                            .map((server) => {
                                const result = results[server.uuid];

                                return (
                                    <div
                                        key={server.uuid}
                                        className={
                                            'flex items-start gap-3 rounded-lg border border-neutral-500 px-3 py-2'
                                        }
                                    >
                                        {result.ok ? (
                                            <CheckCircleIcon
                                                className={'mt-0.5 h-5 w-5 flex-shrink-0 text-green-500'}
                                            />
                                        ) : (
                                            <ExclamationCircleIcon
                                                className={'mt-0.5 h-5 w-5 flex-shrink-0 text-red-500'}
                                            />
                                        )}
                                        <span className={'min-w-0 flex-1'}>
                                            <span className={'block truncate text-sm font-medium text-neutral-50'}>
                                                {server.name}
                                            </span>
                                            <span className={'block text-xs text-neutral-300'}>{result.message}</span>
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                    <Dialog.Footer>
                        <Button onClick={onClose}>Done</Button>
                    </Dialog.Footer>
                </>
            )}
            {step === 'pick' && (
                <>
                    <div className={'relative mb-3'}>
                        <SearchIcon className={'absolute left-3 top-0 bottom-0 my-auto h-4 w-4 text-neutral-400'} />
                        <Input
                            value={query}
                            placeholder={'Search by name or address'}
                            style={{ paddingLeft: '2.25rem' }}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                        />
                    </div>
                    <div className={'max-h-72 space-y-2 overflow-y-auto'}>
                        {error ? (
                            <p className={'py-6 text-center text-sm text-red-600'}>{error}</p>
                        ) : !servers ? (
                            <Spinner centered size={'base'} />
                        ) : visible.length === 0 ? (
                            <p className={'py-6 text-center text-sm text-neutral-400'}>No other servers found.</p>
                        ) : (
                            visible.map((server) => {
                                const address = addressOf(server)!;
                                const added = taken.has(address);

                                return (
                                    <label
                                        key={server.uuid}
                                        className={`flex items-center gap-3 rounded-lg border border-neutral-500 px-3 py-2 ${
                                            added ? 'opacity-50' : 'cursor-pointer hover:bg-neutral-600'
                                        }`}
                                    >
                                        <input
                                            type={'checkbox'}
                                            disabled={added}
                                            checked={added || selected.includes(server.uuid)}
                                            onChange={() => toggle(server.uuid)}
                                        />
                                        <ServerIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                                        <span className={'min-w-0 flex-1'}>
                                            <span className={'block truncate text-sm font-medium text-neutral-50'}>
                                                {server.name}
                                            </span>
                                            <span className={'block truncate font-mono text-xs text-neutral-300'}>
                                                {address}
                                            </span>
                                        </span>
                                        {added && <span className={'text-xs text-neutral-300'}>Added</span>}
                                    </label>
                                );
                            })
                        )}
                    </div>
                    <Dialog.Footer>
                        <Button.Text onClick={onClose}>Cancel</Button.Text>
                        <Button disabled={selected.length === 0} onClick={askToConfigure}>
                            Add {selected.length > 0 ? `${selected.length} ` : ''}
                            {selected.length === 1 ? 'server' : 'servers'}
                        </Button>
                    </Dialog.Footer>
                </>
            )}
        </Dialog>
    );
};
