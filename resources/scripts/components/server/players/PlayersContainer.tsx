import React, { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import {
    BanIcon,
    CheckCircleIcon,
    SearchIcon,
    ShieldCheckIcon,
    UserRemoveIcon,
    UsersIcon,
    XCircleIcon,
    XIcon,
} from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import { PlayerHead } from '@/components/server/players/PlayerListCard';
import { usePermissions } from '@/plugins/usePermissions';
import { dashUuid, lookupPlayer, readJsonList } from '@/lib/minecraft';
import { setBanned as writeBan, setOperator, setWhitelisted, UUID_PATTERN } from '@/lib/playerFiles';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { useOnlinePlayers } from '@/lib/onlinePlayers';

interface CacheEntry {
    uuid: string;
    name: string;
    expiresOn: string;
}

interface NamedEntry {
    uuid?: string;
    name: string;
}

// The user cache keeps a profile for 30 days after the last login, so the expiry minus that is the last seen time.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const lastSeen = (entry: CacheEntry): Date | null => {
    const expires = new Date(entry.expiresOn.replace(' +0000', 'Z').replace(' ', 'T'));

    return isNaN(expires.getTime()) ? null : new Date(expires.getTime() - RETENTION_MS);
};

const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

type Pending = { action: 'kick' | 'ban'; name: string } | null;

type Filter = 'online' | 'offline' | 'operator' | 'banned' | 'whitelisted';
type Sort = 'activity' | 'name';

/** A player the server knows about, whichever list it is in. */
interface Known {
    name: string;
    uuid: string;
    online: boolean;
    operator: boolean;
    banned: boolean;
    whitelisted: boolean;
    seen: Date | null;
}

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'online', label: 'Online' },
    { id: 'offline', label: 'Offline' },
    { id: 'operator', label: 'Operators' },
    { id: 'banned', label: 'Banned' },
    { id: 'whitelisted', label: 'Whitelisted' },
];

const matches = (player: Known, filter: Filter) =>
    filter === 'online'
        ? player.online
        : filter === 'offline'
        ? !player.online
        : filter === 'operator'
        ? player.operator
        : filter === 'banned'
        ? player.banned
        : player.whitelisted;

export default () => {
    const server = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [canControl] = usePermissions(['control.console']);
    const [canEditFiles] = usePermissions(['file.update']);
    const { addFlash, clearFlashes } = useFlash();
    const { online, uuids } = useOnlinePlayers(server);

    const [cache, setCache] = useState<CacheEntry[]>([]);
    const [ops, setOps] = useState<NamedEntry[]>([]);
    const [banned, setBanned] = useState<NamedEntry[]>([]);
    const [whitelist, setWhitelist] = useState<NamedEntry[]>([]);
    const [pending, setPending] = useState<Pending>(null);
    const [reason, setReason] = useState('');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Filter[]>([]);
    const [sort, setSort] = useState<Sort>('activity');

    const load = useCallback(async () => {
        const [users, operators, bans, allowed] = await Promise.all([
            readJsonList<CacheEntry>(server, '/usercache.json'),
            readJsonList<NamedEntry>(server, '/ops.json'),
            readJsonList<NamedEntry>(server, '/banned-players.json'),
            readJsonList<NamedEntry>(server, '/whitelist.json'),
        ]);
        setCache(users);
        setOps(operators);
        setBanned(bans);
        setWhitelist(allowed);
    }, [server]);

    useEffect(() => {
        load();
    }, [load, online.length]);

    const running = status === 'running';
    const offline = status === 'offline';
    // A running server is sent commands, a stopped one has its json files edited. Kicking needs a running server.
    const disabled = running ? !canControl : !(offline && canEditFiles);
    const kickDisabled = !canControl || !running;

    const run = (command: string) => {
        instance?.send('send command', command);
        // The server rewrites its json files straight away, give it a moment before reading them back.
        setTimeout(load, 1200);
    };

    /** The name a player is known by, found in whichever list has them. */
    const uuidOf = (name: string) =>
        uuids[name] ||
        cache.find((c) => c.name === name)?.uuid ||
        [...ops, ...banned, ...whitelist].find((e) => e.name === name && e.uuid)?.uuid ||
        name;

    /** Everyone the server has heard of: players who are online, in the user cache, or on the op, ban or white list. */
    const everyone = useMemo<Known[]>(() => {
        const map = new Map<string, Known>();
        const get = (name: string, uuid?: string): Known => {
            const key = name.toLowerCase();
            let player = map.get(key);
            if (!player) {
                player = {
                    name,
                    uuid: uuid || '',
                    online: false,
                    operator: false,
                    banned: false,
                    whitelisted: false,
                    seen: null,
                };
                map.set(key, player);
            }
            if (!player.uuid && uuid) player.uuid = uuid;

            return player;
        };

        cache.forEach((entry) => {
            const player = get(entry.name, entry.uuid);
            player.seen = lastSeen(entry);
        });
        ops.forEach((entry) => (get(entry.name, entry.uuid).operator = true));
        banned.forEach((entry) => (get(entry.name, entry.uuid).banned = true));
        whitelist.forEach((entry) => (get(entry.name, entry.uuid).whitelisted = true));
        online.forEach((name) => {
            const player = get(name, uuids[name]);
            player.online = true;
            if (uuids[name]) player.uuid = uuids[name];
        });

        return Array.from(map.values());
    }, [cache, ops, banned, whitelist, online, uuids]);

    const counts = useMemo(
        () =>
            Object.fromEntries(FILTERS.map((f) => [f.id, everyone.filter((p) => matches(p, f.id)).length])) as Record<
                Filter,
                number
            >,
        [everyone]
    );

    const shown = useMemo(() => {
        const term = search.trim().toLowerCase();

        return everyone
            .filter((p) => !term || p.name.toLowerCase().includes(term) || p.uuid.toLowerCase().includes(term))
            .filter((p) => filters.every((f) => matches(p, f)))
            .sort((a, b) =>
                sort === 'name'
                    ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
                    : Number(b.online) - Number(a.online) ||
                      (b.seen?.getTime() || 0) - (a.seen?.getTime() || 0) ||
                      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            );
    }, [everyone, search, filters, sort]);

    const toggle = (filter: Filter) =>
        setFilters((current) =>
            current.includes(filter)
                ? current.filter((f) => f !== filter)
                : // Nobody is online and offline at the same time.
                  [
                      ...current.filter(
                          (f) => !(filter === 'online' ? f === 'offline' : filter === 'offline' && f === 'online')
                      ),
                      filter,
                  ]
        );

    /** Bans, ops and the whitelist: commands while running, straight into the json files while stopped. */
    const change = async (
        action: 'ban' | 'pardon' | 'op' | 'deop' | 'whitelist' | 'unwhitelist',
        name: string,
        why = ''
    ) => {
        if (running) {
            const command =
                action === 'whitelist'
                    ? `whitelist add ${name}`
                    : action === 'unwhitelist'
                    ? `whitelist remove ${name}`
                    : `${action} ${name}${why ? ` ${why}` : ''}`;

            return run(command);
        }

        clearFlashes('players');
        try {
            let id = uuidOf(name);
            if (!UUID_PATTERN.test(id)) id = (await lookupPlayer(name)).uuid;
            const player = { uuid: dashUuid(id), name };

            if (action === 'op' || action === 'deop') await setOperator(server, player, action === 'op');
            else if (action === 'whitelist' || action === 'unwhitelist') {
                await setWhitelisted(server, player, action === 'whitelist');
            } else await writeBan(server, player, action === 'ban', why || undefined);

            await load();
        } catch (e) {
            addFlash({
                key: 'players',
                type: 'error',
                message: (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message,
            });
        }
    };

    const confirm = () => {
        if (!pending) return;
        const text = clean(reason);
        if (pending.action === 'kick') run(`kick ${pending.name}${text ? ` ${text}` : ''}`);
        else change('ban', pending.name, text);
        setPending(null);
        setReason('');
    };

    const actions = (player: Known) => {
        return (
            <div className={'flex flex-wrap items-center gap-2'}>
                {player.online && (
                    <Button.Text
                        disabled={kickDisabled}
                        onClick={() => setPending({ action: 'kick', name: player.name })}
                    >
                        <UserRemoveIcon className={'mr-2 h-4 w-4'} />
                        Kick
                    </Button.Text>
                )}
                {player.banned ? (
                    <Button.Text disabled={disabled} onClick={() => change('pardon', player.name)}>
                        <BanIcon className={'mr-2 h-4 w-4'} />
                        Unban
                    </Button.Text>
                ) : (
                    <Button.Danger
                        variant={Button.Variants.Secondary}
                        disabled={disabled}
                        onClick={() => setPending({ action: 'ban', name: player.name })}
                    >
                        <BanIcon className={'mr-2 h-4 w-4'} />
                        Ban
                    </Button.Danger>
                )}
                <Button.Text disabled={disabled} onClick={() => change(player.operator ? 'deop' : 'op', player.name)}>
                    <ShieldCheckIcon className={'mr-2 h-4 w-4'} />
                    {player.operator ? 'Deop' : 'Op'}
                </Button.Text>
                <Button.Text
                    disabled={disabled}
                    title={player.whitelisted ? 'Remove from the whitelist' : 'Add to the whitelist'}
                    onClick={() => change(player.whitelisted ? 'unwhitelist' : 'whitelist', player.name)}
                >
                    {player.whitelisted ? (
                        <XCircleIcon className={'mr-2 h-4 w-4'} />
                    ) : (
                        <CheckCircleIcon className={'mr-2 h-4 w-4'} />
                    )}
                    {player.whitelisted ? 'Unwhitelist' : 'Whitelist'}
                </Button.Text>
            </div>
        );
    };

    const detail = (player: Known) =>
        player.online
            ? 'Online now'
            : player.seen
            ? `Last seen about ${player.seen.toLocaleDateString()}`
            : cache.some((c) => c.name === player.name)
            ? 'Seen recently'
            : 'Has not joined yet';

    const row = (player: Known) => (
        <div
            key={player.name}
            className={
                'flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-md'
            }
        >
            <div className={'relative'}>
                <PlayerHead uuid={uuidOf(player.name)} name={player.name} />
                {player.online && (
                    <span
                        className={
                            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500'
                        }
                        title={'Online'}
                    />
                )}
            </div>
            <div className={'min-w-0 flex-1'}>
                <p className={'flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-neutral-50'}>
                    <span className={'truncate'}>{player.name}</span>
                    {player.operator && (
                        <span className={'rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700'}>
                            Op
                        </span>
                    )}
                    {player.banned && (
                        <span className={'rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700'}>
                            Banned
                        </span>
                    )}
                    {player.whitelisted && (
                        <span
                            className={'rounded-full bg-neutral-600 px-2 py-0.5 text-xs font-medium text-neutral-300'}
                        >
                            Whitelisted
                        </span>
                    )}
                </p>
                <p className={'text-xs text-neutral-300'}>{detail(player)}</p>
            </div>
            {actions(player)}
        </div>
    );

    const filtering = search.trim() !== '' || filters.length > 0;

    return (
        <ServerContentBlock title={'Players'}>
            <FlashMessageRender byKey={'players'} className={'mb-4'} />
            <PageHeader title={'Players'} subtitle={'See who is online and manage their access'} />
            {offline ? (
                <p className={'mb-4 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-800'}>
                    The server is stopped, so bans and operators are written straight to banned-players.json and
                    ops.json. Kicking needs the server to be running.
                </p>
            ) : (
                !running && (
                    <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                        Wait for the server to finish starting or stopping to change bans and operators.
                    </p>
                )
            )}

            <div className={'mb-4 rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
                <div className={'flex flex-wrap items-center gap-3'}>
                    <div className={'relative min-w-[14rem] flex-1'}>
                        <SearchIcon
                            className={
                                'pointer-events-none absolute left-4 top-0 bottom-0 my-auto h-5 w-5 text-neutral-400'
                            }
                        />
                        <Input
                            type={'text'}
                            value={search}
                            placeholder={'Search by name or UUID...'}
                            aria-label={'Search players'}
                            style={{ paddingLeft: '3rem' }}
                            onChange={(e) => setSearch(e.currentTarget.value)}
                        />
                        {search && (
                            <button
                                type={'button'}
                                aria-label={'Clear the search'}
                                onClick={() => setSearch('')}
                                className={
                                    'absolute right-3 top-0 bottom-0 my-auto h-5 w-5 text-neutral-400 hover:text-neutral-200'
                                }
                            >
                                <XIcon className={'h-5 w-5'} />
                            </button>
                        )}
                    </div>
                    <div className={'w-48'}>
                        <Label className={'sr-only'}>Sort players</Label>
                        <Select value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
                            <option value={'activity'}>Online first, then recent</option>
                            <option value={'name'}>Name A-Z</option>
                        </Select>
                    </div>
                </div>
                <div className={'mt-3 flex flex-wrap items-center gap-2'}>
                    {FILTERS.map((filter) => {
                        const active = filters.includes(filter.id);

                        return (
                            <button
                                key={filter.id}
                                type={'button'}
                                aria-pressed={active}
                                onClick={() => toggle(filter.id)}
                                className={classNames(
                                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',
                                    active
                                        ? 'border-primary-600 bg-primary-600 text-white'
                                        : 'border-neutral-500 bg-white text-neutral-300 hover:bg-neutral-600'
                                )}
                            >
                                {filter.label}
                                <span
                                    className={classNames(
                                        'ml-1.5 rounded-full px-1.5 text-2xs',
                                        active ? 'bg-white bg-opacity-25' : 'bg-neutral-600 text-neutral-300'
                                    )}
                                >
                                    {counts[filter.id]}
                                </span>
                            </button>
                        );
                    })}
                    {filtering && (
                        <button
                            type={'button'}
                            onClick={() => {
                                setSearch('');
                                setFilters([]);
                            }}
                            className={'ml-1 text-xs font-medium text-primary-600 hover:underline'}
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            </div>

            <ListHeader
                icon={<UsersIcon className={'h-6 w-6'} />}
                title={filtering ? 'Matching players' : 'Players'}
                count={filtering ? `${shown.length} of ${everyone.length}` : String(everyone.length)}
            />
            {shown.length === 0 ? (
                <EmptyState>
                    {filtering
                        ? 'No players match. Try a different search or clear the filters.'
                        : running
                        ? 'Nobody has joined yet. Players who were already online before you opened the panel appear once they rejoin.'
                        : 'No players yet. The server has to run and have someone join first.'}
                </EmptyState>
            ) : (
                <div className={'space-y-2'}>{shown.map(row)}</div>
            )}

            <Dialog.Confirm
                open={!!pending}
                title={pending?.action === 'ban' ? `Ban ${pending.name}` : `Kick ${pending?.name}`}
                confirm={pending?.action === 'ban' ? 'Ban player' : 'Kick player'}
                onClose={() => {
                    setPending(null);
                    setReason('');
                }}
                onConfirmed={confirm}
            >
                <Label>Reason (optional)</Label>
                <Input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirm()}
                    placeholder={pending?.action === 'ban' ? 'Banned by an operator' : 'Kicked by an operator'}
                />
                <p className={'mt-2 text-xs text-neutral-300'}>
                    {pending?.action === 'ban'
                        ? 'The player is disconnected and cannot join until they are unbanned.'
                        : 'The player is disconnected and can rejoin straight away.'}
                </p>
            </Dialog.Confirm>
        </ServerContentBlock>
    );
};
