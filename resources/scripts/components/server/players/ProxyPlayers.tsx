import React, { useEffect, useMemo, useState } from 'react';
import { PaperAirplaneIcon, SearchIcon, UsersIcon, XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import { readOptionalFile } from '@/lib/minecraft';
import { parseVelocity } from '@/lib/velocity';
import { Button } from '@/components/elements/button/index';
import { PlayerHead } from '@/components/server/players/PlayerListCard';
import { useOnlinePlayers } from '@/lib/onlinePlayers';
import { askPlugin, useBridgeStatus } from '@/lib/bridge';
import { installHelperPlugin } from '@/lib/helperPlugin';
import { usePermissions } from '@/plugins/usePermissions';

/**
 * The Players page of a proxy: who is connected and which backend server each one is on. A proxy has no inventories, health or
 * world, so that is all. It comes from the Stratosphere plugin on the proxy, the log of a proxy does not say it.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const { online, uuids, servers } = useOnlinePlayers(uuid);
    const bridge = useBridgeStatus(uuid);
    const [canInstall] = usePermissions(['file.create']);
    const [canControl] = usePermissions(['control.console']);
    const [search, setSearch] = useState('');
    const [only, setOnly] = useState<string | null>(null);
    const [installing, setInstalling] = useState(false);
    const [installed, setInstalled] = useState(false);
    const [failed, setFailed] = useState('');
    // The backend servers of velocity.toml, to send players to, and where each player is about to be sent.
    const [targets, setTargets] = useState<string[]>([]);
    const [choice, setChoice] = useState<Record<string, string>>({});
    const [sent, setSent] = useState<Record<string, string>>({});

    useEffect(() => {
        readOptionalFile(uuid, '/velocity.toml')
            .then((content) =>
                setTargets(
                    content
                        ? parseVelocity(content)
                              .servers.map((s) => s.name)
                              .filter((n) => /^[\w-]+$/.test(n))
                        : []
                )
            )
            .catch(() => setTargets([]));
    }, [uuid]);

    // The console command of Velocity: send <player> <server>. Names that could carry a second word are not sent.
    const send = (name: string, target: string) => {
        if (!instance || !/^[\w.-]+$/.test(name) || !targets.includes(target)) return;
        instance.send('send command', `send ${name} ${target}`);
        setSent((all) => ({ ...all, [name]: target }));
        setTimeout(() => setSent((all) => Object.fromEntries(Object.entries(all).filter(([n]) => n !== name))), 4000);
    };

    const running = status === 'running';

    // The panel only asks a plugin it saw the commands file of. On a proxy this page is where the answer matters, so ask when it is
    // opened (it is told once per connection), and a proxy without the plugin says so.
    useEffect(() => {
        if (running && instance && bridge.state === 'unknown') askPlugin(uuid, instance, 'handshake');
    }, [running, instance, bridge.state, uuid]);
    // How many are on each backend server, for the chips above the list.
    const perServer = useMemo(() => {
        const counts: Record<string, number> = {};
        online.forEach((name) => {
            const where = servers[name] || '';
            counts[where] = (counts[where] || 0) + 1;
        });

        return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    }, [online, servers]);

    const shown = useMemo(() => {
        const term = search.trim().toLowerCase();

        return online
            .filter(
                (name) =>
                    !term || name.toLowerCase().includes(term) || (servers[name] || '').toLowerCase().includes(term)
            )
            .filter((name) => only === null || (servers[name] || '') === only)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [online, servers, search, only]);

    const install = async () => {
        setInstalling(true);
        setFailed('');
        try {
            await installHelperPlugin(uuid, 'VELOCITY');
            setInstalled(true);
        } catch (e) {
            setFailed((e as Error).message || 'The plugin could not be uploaded.');
        } finally {
            setInstalling(false);
        }
    };

    return (
        <ServerContentBlock title={'Players'}>
            <PageHeader title={'Players'} subtitle={'Who is connected to the proxy and which server each one is on'} />
            {!running ? (
                <p className={'mb-4 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700'}>
                    The proxy is not running, so nobody is connected.
                </p>
            ) : (
                bridge.state === 'missing' && (
                    <div className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                        <p>
                            {installed
                                ? 'The Stratosphere plugin was uploaded. Restart the proxy to load it.'
                                : 'The Stratosphere plugin is not on this proxy, so the panel cannot see who is connected. It only reports the players and the server each one is on.'}
                        </p>
                        {failed && <p className={'mt-1 text-red-700'}>{failed}</p>}
                        {!installed && canInstall && (
                            <Button
                                size={Button.Sizes.Small}
                                className={'mt-2'}
                                disabled={installing}
                                onClick={install}
                            >
                                Install the plugin
                            </Button>
                        )}
                    </div>
                )
            )}

            <div className={'mb-4 rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
                <div className={'relative'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-4 top-0 bottom-0 my-auto h-5 w-5 text-neutral-400'
                        }
                    />
                    <Input
                        type={'text'}
                        value={search}
                        placeholder={'Search by name or server...'}
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
                {perServer.length > 0 && (
                    <div className={'mt-3 flex flex-wrap items-center gap-2'}>
                        {perServer.map(([name, count]) => (
                            <button
                                key={name || 'connecting'}
                                type={'button'}
                                aria-pressed={only === name}
                                onClick={() => setOnly(only === name ? null : name)}
                                className={
                                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ' +
                                    (only === name
                                        ? 'border-primary-600 bg-primary-600 text-snow'
                                        : 'border-neutral-500 bg-white text-neutral-300 hover:bg-neutral-600')
                                }
                            >
                                {name || 'Connecting'}
                                <span className={'ml-1.5 rounded-full bg-neutral-600 px-1.5 text-2xs text-neutral-300'}>
                                    {count}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <ListHeader
                icon={<UsersIcon className={'h-6 w-6'} />}
                title={'Connected'}
                count={search || only !== null ? `${shown.length} of ${online.length}` : String(online.length)}
            />
            {shown.length === 0 ? (
                <EmptyState>
                    {online.length > 0 ? 'No players match.' : running ? 'Nobody is connected.' : 'No players.'}
                </EmptyState>
            ) : (
                <div className={'space-y-2'}>
                    {shown.map((name) => (
                        <div
                            key={name}
                            className={
                                'flex flex-wrap items-center gap-3 rounded-xl border border-neutral-500 bg-white px-4 py-3 shadow-md'
                            }
                        >
                            <div className={'relative'}>
                                <PlayerHead uuid={uuids[name] || name} name={name} />
                                <span
                                    className={
                                        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500'
                                    }
                                    role={'img'}
                                    aria-label={'Connected'}
                                />
                            </div>
                            <div className={'min-w-0 flex-1'}>
                                <p className={'truncate text-sm font-semibold text-neutral-50'}>{name}</p>
                                <p className={'text-xs text-neutral-300'}>Connected</p>
                            </div>
                            {canControl && running && targets.length > 0 && /^[\w.-]+$/.test(name) && (
                                <div className={'flex items-center gap-2'}>
                                    <div className={'w-36'}>
                                        <Select
                                            aria-label={`Server to send ${name} to`}
                                            value={choice[name] ?? ''}
                                            onChange={(e) =>
                                                setChoice((all) => ({ ...all, [name]: e.currentTarget.value }))
                                            }
                                        >
                                            <option value={''}>Send to...</option>
                                            {targets
                                                .filter((target) => target !== servers[name])
                                                .map((target) => (
                                                    <option key={target} value={target}>
                                                        {target}
                                                    </option>
                                                ))}
                                        </Select>
                                    </div>
                                    <Button
                                        size={Button.Sizes.Small}
                                        disabled={!choice[name]}
                                        onClick={() => send(name, choice[name])}
                                    >
                                        <PaperAirplaneIcon className={'mr-1.5 h-4 w-4'} />
                                        {sent[name] ? 'Sent' : 'Send'}
                                    </Button>
                                </div>
                            )}
                            <span
                                className={
                                    'rounded-full px-3 py-1 text-xs font-medium ' +
                                    (servers[name]
                                        ? 'bg-primary-50 text-primary-700'
                                        : 'bg-neutral-600 text-neutral-300')
                                }
                                title={
                                    servers[name] ? `On the server ${servers[name]}` : 'Still connecting to a server'
                                }
                            >
                                {servers[name] || 'Connecting...'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </ServerContentBlock>
    );
};
