import React, { useEffect, useMemo, useState } from 'react';
import { SearchIcon, ServerIcon } from '@heroicons/react/solid';
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

interface Props {
    open: boolean;
    existing: ProxyServer[];
    onClose: () => void;
    onAdd: (servers: ProxyServer[]) => void;
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
export default ({ open, existing, onClose, onAdd }: Props) => {
    const current = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [servers, setServers] = useState<Server[] | null>(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    useEffect(() => {
        if (!open) return;

        setSelected([]);
        setQuery('');
        setError('');

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

    const add = () => {
        const names = existing.map((s) => s.name);
        // The first backend added becomes the one players land on, so the proxy works straight away.
        let needsJoin = !existing.some((s) => s.join);
        const added: ProxyServer[] = (servers || [])
            .filter((s) => selected.includes(s.uuid))
            .map((s) => {
                const name = toProxyName(s.name, names);
                names.push(name);
                const entry = { id: uid(), name, address: addressOf(s)!, join: needsJoin };
                needsJoin = false;

                return entry;
            });

        onAdd(added);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={'Add servers'}
            description={'Pick servers from your account to add to the proxy.'}
        >
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
                <Button disabled={selected.length === 0} onClick={add}>
                    Add {selected.length > 0 ? `${selected.length} ` : ''}
                    {selected.length === 1 ? 'server' : 'servers'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
};
