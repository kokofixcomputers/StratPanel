import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BanIcon, ClockIcon, ShieldCheckIcon, UserRemoveIcon, UsersIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import { PlayerHead } from '@/components/server/players/PlayerListCard';
import { usePermissions } from '@/plugins/usePermissions';
import { readJsonList } from '@/lib/minecraft';
import { useOnlinePlayers } from '@/lib/onlinePlayers';

interface CacheEntry {
    uuid: string;
    name: string;
    expiresOn: string;
}

// The user cache keeps a profile for 30 days after the last login, so the expiry minus that is the last seen time.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const lastSeen = (entry: CacheEntry): Date | null => {
    const expires = new Date(entry.expiresOn.replace(' +0000', 'Z').replace(' ', 'T'));

    return isNaN(expires.getTime()) ? null : new Date(expires.getTime() - RETENTION_MS);
};

const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

type Pending = { action: 'kick' | 'ban'; name: string } | null;

export default () => {
    const server = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [canControl] = usePermissions(['control.console']);
    const { online, uuids } = useOnlinePlayers(server);

    const [cache, setCache] = useState<CacheEntry[]>([]);
    const [ops, setOps] = useState<string[]>([]);
    const [banned, setBanned] = useState<string[]>([]);
    const [pending, setPending] = useState<Pending>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        const [users, operators, bans] = await Promise.all([
            readJsonList<CacheEntry>(server, '/usercache.json'),
            readJsonList<{ name: string }>(server, '/ops.json'),
            readJsonList<{ name: string }>(server, '/banned-players.json'),
        ]);
        setCache(users);
        setOps(operators.map((o) => o.name.toLowerCase()));
        setBanned(bans.map((b) => b.name.toLowerCase()));
    }, [server]);

    useEffect(() => {
        load();
    }, [load, online.length]);

    const running = status === 'running';
    const disabled = !canControl || !running;
    const uuidOf = (name: string) => uuids[name] || cache.find((c) => c.name === name)?.uuid || name;

    const run = (command: string) => {
        instance?.send('send command', command);
        // The server rewrites its json files straight away, give it a moment before reading them back.
        setTimeout(load, 1200);
    };

    const confirm = () => {
        if (!pending) return;
        const text = clean(reason);
        run(`${pending.action} ${pending.name}${text ? ` ${text}` : ''}`);
        setPending(null);
        setReason('');
    };

    const recent = useMemo(
        () =>
            cache
                .filter((entry) => !online.includes(entry.name))
                .map((entry) => ({ entry, seen: lastSeen(entry) }))
                .sort((a, b) => (b.seen?.getTime() || 0) - (a.seen?.getTime() || 0)),
        [cache, online]
    );

    const actions = (name: string, isOnline: boolean) => {
        const isOp = ops.includes(name.toLowerCase());
        const isBanned = banned.includes(name.toLowerCase());

        return (
            <div className={'flex flex-wrap items-center gap-2'}>
                {isOnline && (
                    <Button.Text disabled={disabled} onClick={() => setPending({ action: 'kick', name })}>
                        <UserRemoveIcon className={'mr-2 h-4 w-4'} />
                        Kick
                    </Button.Text>
                )}
                {isBanned ? (
                    <Button.Text disabled={disabled} onClick={() => run(`pardon ${name}`)}>
                        <BanIcon className={'mr-2 h-4 w-4'} />
                        Unban
                    </Button.Text>
                ) : (
                    <Button.Danger
                        variant={Button.Variants.Secondary}
                        disabled={disabled}
                        onClick={() => setPending({ action: 'ban', name })}
                    >
                        <BanIcon className={'mr-2 h-4 w-4'} />
                        Ban
                    </Button.Danger>
                )}
                <Button.Text disabled={disabled} onClick={() => run(`${isOp ? 'deop' : 'op'} ${name}`)}>
                    <ShieldCheckIcon className={'mr-2 h-4 w-4'} />
                    {isOp ? 'Deop' : 'Op'}
                </Button.Text>
            </div>
        );
    };

    const row = (name: string, isOnline: boolean, detail: string) => (
        <div
            key={name}
            className={
                'flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-md'
            }
        >
            <PlayerHead uuid={uuidOf(name)} name={name} />
            <div className={'min-w-0 flex-1'}>
                <p className={'flex items-center text-sm font-semibold text-neutral-50'}>
                    <span className={'truncate'}>{name}</span>
                    {ops.includes(name.toLowerCase()) && (
                        <span
                            className={
                                'ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700'
                            }
                        >
                            Op
                        </span>
                    )}
                    {banned.includes(name.toLowerCase()) && (
                        <span className={'ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700'}>
                            Banned
                        </span>
                    )}
                </p>
                <p className={'text-xs text-neutral-300'}>{detail}</p>
            </div>
            {actions(name, isOnline)}
        </div>
    );

    return (
        <ServerContentBlock title={'Players'}>
            <FlashMessageRender byKey={'players'} className={'mb-4'} />
            <PageHeader title={'Players'} subtitle={'See who is online and manage their access'} />
            {!running && (
                <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                    The server needs to be running to kick, ban or op players.
                </p>
            )}

            <ListHeader icon={<UsersIcon className={'h-6 w-6'} />} title={'Online'} count={String(online.length)} />
            {online.length === 0 ? (
                <EmptyState>
                    {running
                        ? 'Nobody is online. Players who were already online before you opened the panel appear once they rejoin.'
                        : 'The server is not running.'}
                </EmptyState>
            ) : (
                <div className={'space-y-2'}>{online.map((name) => row(name, true, 'Online now'))}</div>
            )}

            <ListHeader
                className={'mt-8'}
                icon={<ClockIcon className={'h-6 w-6'} />}
                title={'Recently online'}
                count={String(recent.length)}
            />
            {recent.length === 0 ? (
                <EmptyState>No other players have joined recently.</EmptyState>
            ) : (
                <div className={'space-y-2'}>
                    {recent.map(({ entry, seen }) =>
                        row(entry.name, false, seen ? `Last seen about ${seen.toLocaleDateString()}` : 'Seen recently')
                    )}
                </div>
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
