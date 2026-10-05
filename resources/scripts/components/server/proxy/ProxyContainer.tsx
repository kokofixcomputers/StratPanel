import React, { useEffect, useMemo, useState } from 'react';
import tw from 'twin.macro';
import { Reorder, useDragControls } from 'framer-motion';
import {
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardCopyIcon,
    EyeIcon,
    EyeOffIcon,
    MenuAlt4Icon,
    PlusIcon,
    RefreshIcon,
    SaveIcon,
    ServerIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import copy from 'copy-to-clipboard';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Switch from '@/components/elements/Switch';
import Input, { Textarea } from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import Label from '@/components/elements/Label';
import { Button } from '@/components/elements/button/index';
import AddServersDialog from '@/components/server/proxy/AddServersDialog';
import useFlash from '@/plugins/useFlash';
import saveFileContents from '@/api/server/files/saveFileContents';
import { httpErrorToHuman } from '@/api/http';
import { readOptionalFile } from '@/lib/minecraft';
import {
    FORWARDING_MODES,
    parseVelocity,
    ProxyConfig,
    ProxyServer,
    randomSecret,
    serializeVelocity,
    TomlValue,
    uid,
} from '@/lib/velocity';

const FILE = '/velocity.toml';
const SECRET_FILE = '/forwarding.secret';

const Card = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
    <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md mb-4`}>
        <div css={tw`px-5 py-4 border-b border-neutral-500`}>
            <h2 css={tw`text-base font-semibold text-neutral-50`}>{title}</h2>
            {description && <p css={tw`text-sm text-neutral-400 mt-0.5`}>{description}</p>}
        </div>
        <div css={tw`p-5`}>{children}</div>
    </div>
);

const ToggleRow = ({
    label,
    description,
    value,
    onChange,
}: {
    label: string;
    description: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) => (
    <div css={tw`flex items-center justify-between py-3 border-b border-neutral-500 last:border-0`}>
        <div css={tw`pr-6`}>
            <p css={tw`text-sm font-medium text-neutral-50`}>{label}</p>
            <p css={tw`text-xs text-neutral-400 mt-0.5`}>{description}</p>
        </div>
        <Switch
            key={`${label}-${value}`}
            name={label}
            defaultChecked={value}
            onChange={(e) => onChange(e.currentTarget.checked)}
        />
    </div>
);

const ServerItem = ({
    server,
    index,
    joinPosition,
    count,
    onMove,
    onChange,
    onRemove,
}: {
    server: ProxyServer;
    index: number;
    count: number;
    onMove: (direction: -1 | 1) => void;
    joinPosition: number | null;
    onChange: (patch: Partial<ProxyServer>) => void;
    onRemove: () => void;
}) => {
    const controls = useDragControls();

    return (
        <Reorder.Item
            value={server}
            dragListener={false}
            dragControls={controls}
            as={'li'}
            css={tw`list-none`}
            whileDrag={{ scale: 1.01, boxShadow: '0 12px 28px -8px rgba(15,23,42,0.25)' }}
        >
            <div
                css={tw`flex flex-wrap items-center gap-3 bg-white border border-neutral-500 rounded-xl px-3 py-3`}
                data-index={index}
            >
                <button
                    type={'button'}
                    aria-label={'Drag to reorder'}
                    onPointerDown={(e) => controls.start(e)}
                    css={tw`p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-600 transition-colors duration-150`}
                    style={{ cursor: 'grab', touchAction: 'none' }}
                >
                    <MenuAlt4Icon css={tw`w-5 h-5`} />
                </button>
                <div css={tw`flex flex-col -my-1`}>
                    <button
                        type={'button'}
                        aria-label={'Move up'}
                        disabled={index === 0}
                        onClick={() => onMove(-1)}
                        css={tw`text-neutral-400 hover:text-neutral-50 disabled:opacity-30`}
                    >
                        <ChevronUpIcon css={tw`w-4 h-4`} />
                    </button>
                    <button
                        type={'button'}
                        aria-label={'Move down'}
                        disabled={index === count - 1}
                        onClick={() => onMove(1)}
                        css={tw`text-neutral-400 hover:text-neutral-50 disabled:opacity-30`}
                    >
                        <ChevronDownIcon css={tw`w-4 h-4`} />
                    </button>
                </div>
                <span
                    css={[
                        tw`w-[4.5rem] text-center rounded-full px-2 py-0.5 text-2xs font-semibold flex-shrink-0 whitespace-nowrap`,
                        joinPosition ? tw`bg-primary-50 text-primary-700` : tw`bg-neutral-600 text-neutral-400`,
                    ]}
                >
                    {joinPosition ? `#${joinPosition} try` : 'not tried'}
                </span>
                <div css={tw`w-40`}>
                    <Input
                        type={'text'}
                        value={server.name}
                        placeholder={'name'}
                        aria-label={'Server name'}
                        onChange={(e) => onChange({ name: e.currentTarget.value.replace(/[^\w-]/g, '') })}
                    />
                </div>
                <div css={tw`flex-1 min-w-[12rem]`}>
                    <Input
                        type={'text'}
                        value={server.address}
                        placeholder={'127.0.0.1:25566'}
                        aria-label={'Server address'}
                        css={tw`font-mono`}
                        onChange={(e) => onChange({ address: e.currentTarget.value })}
                    />
                </div>
                <label css={tw`flex items-center text-xs text-neutral-300 cursor-pointer select-none`}>
                    <input
                        type={'checkbox'}
                        checked={server.join}
                        onChange={(e) => onChange({ join: e.currentTarget.checked })}
                        css={tw`mr-2 rounded`}
                    />
                    Join on login
                </label>
                <button
                    type={'button'}
                    aria-label={'Remove server'}
                    onClick={onRemove}
                    css={tw`p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150`}
                >
                    <TrashIcon css={tw`w-4 h-4`} />
                </button>
            </div>
        </Reorder.Item>
    );
};

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const allocationPort = ServerContext.useStoreState(
        (state) => state.server.data!.allocations.find((a) => a.isDefault)?.port
    );
    const { addFlash, clearFlashes } = useFlash();

    const [raw, setRaw] = useState<string | null>(null);
    const [missing, setMissing] = useState(false);
    const [config, setConfig] = useState<ProxyConfig | null>(null);
    const [snapshot, setSnapshot] = useState('');
    const [secret, setSecret] = useState<string | null>(null);
    const [showSecret, setShowSecret] = useState(false);
    const [saving, setSaving] = useState(false);
    const [picking, setPicking] = useState(false);

    const load = () =>
        Promise.all([readOptionalFile(uuid, FILE), readOptionalFile(uuid, SECRET_FILE)]).then(
            ([content, forwarding]) => {
                setSecret(forwarding ? forwarding.trim() : null);
                if (content === null) {
                    setMissing(true);
                    setRaw('');
                    return;
                }

                const parsed = parseVelocity(content);
                setConfig(parsed);
                setSnapshot(JSON.stringify(parsed));
                setRaw(content);
            }
        );

    useEffect(() => {
        load();
    }, [uuid]);

    const dirty = useMemo(() => !!config && JSON.stringify(config) !== snapshot, [config, snapshot]);

    if (raw === null || (!missing && !config)) {
        return (
            <ServerContentBlock title={'Proxy'}>
                <Spinner size={'large'} centered />
            </ServerContentBlock>
        );
    }

    if (missing || !config) {
        return (
            <ServerContentBlock title={'Proxy'}>
                <PageHeader title={'Proxy Settings'} subtitle={`Configure the Velocity proxy ${serverName}`} />
                <EmptyState>
                    velocity.toml does not exist yet. Start the proxy once so Velocity can generate it.
                </EmptyState>
            </ServerContentBlock>
        );
    }

    const update = (patch: Partial<ProxyConfig>) => setConfig((c) => ({ ...c!, ...patch }));
    const setRoot = (key: string, value: TomlValue) => update({ root: { ...config.root, [key]: value } });
    const setAdvanced = (key: string, value: TomlValue) => update({ advanced: { ...config.advanced, [key]: value } });

    const patchServer = (id: string, patch: Partial<ProxyServer>) => {
        const old = config.servers.find((s) => s.id === id)!;
        const servers = config.servers.map((s) => (s.id === id ? { ...s, ...patch } : s));

        // Keep forced hosts pointing at the server when it is renamed.
        const forcedHosts =
            patch.name !== undefined && patch.name !== old.name
                ? config.forcedHosts.map((f) => ({
                      ...f,
                      servers: f.servers.map((n) => (n === old.name ? patch.name! : n)),
                  }))
                : config.forcedHosts;

        update({ servers, forcedHosts });
    };

    const removeServer = (id: string) => {
        const old = config.servers.find((s) => s.id === id)!;
        update({
            servers: config.servers.filter((s) => s.id !== id),
            forcedHosts: config.forcedHosts.map((f) => ({ ...f, servers: f.servers.filter((n) => n !== old.name) })),
        });
    };

    const joinOrder = config.servers.filter((s) => s.join && s.name);
    const hasDuplicate = new Set(config.servers.map((s) => s.name)).size !== config.servers.length;
    const running = status === 'running' || status === 'starting';

    const save = (reload: boolean) => {
        if (hasDuplicate) {
            addFlash({ key: 'proxy', type: 'error', message: 'Every server needs a unique name.' });
            return;
        }

        setSaving(true);
        clearFlashes('proxy');
        saveFileContents(uuid, FILE, serializeVelocity(raw, config))
            .then(() => {
                setSnapshot(JSON.stringify(config));
                if (reload && running && instance) instance.send('send command', 'velocity reload');
                addFlash({
                    key: 'proxy',
                    type: 'success',
                    message:
                        reload && running
                            ? 'Saved and reloaded. Bind address and forwarding changes still need a restart.'
                            : 'Proxy settings saved. Restart the proxy for them to take effect.',
                });
            })
            .catch((error) => addFlash({ key: 'proxy', type: 'error', message: httpErrorToHuman(error) }))
            .then(() => setSaving(false));
    };

    const regenerateSecret = () => {
        const next = randomSecret();
        saveFileContents(uuid, SECRET_FILE, next)
            .then(() => {
                setSecret(next);
                addFlash({
                    key: 'proxy',
                    type: 'success',
                    message: 'New forwarding secret saved. Update it on every backend server and restart the proxy.',
                });
            })
            .catch((error) => addFlash({ key: 'proxy', type: 'error', message: httpErrorToHuman(error) }));
    };

    const str = (key: string, fallback = '') =>
        typeof config.root[key] === 'string' ? (config.root[key] as string) : fallback;
    const bool = (source: Record<string, TomlValue>, key: string, fallback = false) =>
        typeof source[key] === 'boolean' ? (source[key] as boolean) : fallback;
    const num = (source: Record<string, TomlValue>, key: string, fallback = 0) =>
        typeof source[key] === 'number' ? (source[key] as number) : fallback;
    const mode = str('player-info-forwarding-mode', 'NONE');
    const bind = str('bind', '0.0.0.0:25565');
    const bindPort = Number(bind.split(':').pop());
    const portMismatch = !!allocationPort && bindPort !== allocationPort;

    return (
        <ServerContentBlock title={'Proxy Settings'}>
            <PageHeader title={'Proxy Settings'} subtitle={`Configure the Velocity proxy ${serverName}`} />
            <FlashMessageRender byKey={'proxy'} css={tw`mb-4`} />

            <div
                css={tw`sticky top-2 z-20 flex items-center justify-between bg-white border border-neutral-500 rounded-xl shadow-md px-5 py-3 mb-4`}
            >
                <p css={tw`text-sm text-neutral-300`}>
                    {dirty ? (
                        <span css={tw`inline-flex items-center`}>
                            <span css={tw`w-2 h-2 rounded-full bg-primary-600 mr-2`} />
                            You have unsaved changes
                        </span>
                    ) : (
                        'All changes saved'
                    )}
                </p>
                <div css={tw`flex items-center gap-2`}>
                    {running && (
                        <Button.Text disabled={!dirty || saving} onClick={() => save(true)}>
                            Save &amp; reload
                        </Button.Text>
                    )}
                    <Button disabled={!dirty || saving} onClick={() => save(false)}>
                        <SaveIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>

            {portMismatch && (
                <div
                    css={tw`flex flex-wrap items-center justify-between gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-4`}
                >
                    <p css={tw`text-sm text-yellow-800`}>
                        The proxy is bound to port <strong>{bindPort || bind}</strong>, but this server&apos;s
                        allocation is port <strong>{allocationPort}</strong>, so players can&apos;t connect. Velocity
                        creates <code>velocity.toml</code> with the default port on its first start.
                    </p>
                    <Button.Text
                        onClick={() =>
                            setRoot(
                                'bind',
                                `${
                                    bind.includes(':') ? bind.slice(0, bind.lastIndexOf(':')) : '0.0.0.0'
                                }:${allocationPort}`
                            )
                        }
                    >
                        Use port {allocationPort}
                    </Button.Text>
                </div>
            )}

            <Card
                title={'Servers'}
                description={
                    'Drag to set the order players are sent to when they join. The first one marked "Join on login" is tried first, then the next if it is offline.'
                }
            >
                {config.servers.length === 0 ? (
                    <EmptyState>No servers yet. Add the backend servers players can be sent to.</EmptyState>
                ) : (
                    <Reorder.Group
                        axis={'y'}
                        values={config.servers}
                        onReorder={(servers) => update({ servers })}
                        as={'ul'}
                        css={tw`space-y-2 m-0 p-0`}
                    >
                        {config.servers.map((server, index) => (
                            <ServerItem
                                key={server.id}
                                server={server}
                                index={index}
                                count={config.servers.length}
                                onMove={(direction) => {
                                    const servers = [...config.servers];
                                    const target = index + direction;
                                    [servers[index], servers[target]] = [servers[target], servers[index]];
                                    update({ servers });
                                }}
                                joinPosition={
                                    server.join && server.name
                                        ? joinOrder.findIndex((s) => s.id === server.id) + 1
                                        : null
                                }
                                onChange={(patch) => patchServer(server.id, patch)}
                                onRemove={() => removeServer(server.id)}
                            />
                        ))}
                    </Reorder.Group>
                )}
                {hasDuplicate && <p css={tw`mt-3 text-sm text-red-600`}>Server names must be unique.</p>}
                <div css={tw`mt-4 flex flex-wrap gap-2`}>
                    <Button onClick={() => setPicking(true)}>
                        <ServerIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                        Add from my servers
                    </Button>
                    <Button.Text
                        onClick={() =>
                            update({
                                servers: [
                                    ...config.servers,
                                    {
                                        id: uid(),
                                        name: `server${config.servers.length + 1}`,
                                        address: '127.0.0.1:25566',
                                        join: false,
                                    },
                                ],
                            })
                        }
                    >
                        <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                        Add manually
                    </Button.Text>
                </div>
                <AddServersDialog
                    open={picking}
                    existing={config.servers}
                    onClose={() => setPicking(false)}
                    onAdd={(added) => update({ servers: [...config.servers, ...added] })}
                />
            </Card>

            <div css={tw`grid gap-4 lg:grid-cols-2`}>
                <Card title={'General'}>
                    <div css={tw`space-y-4`}>
                        <div>
                            <Label>Bind address</Label>
                            <Input
                                type={'text'}
                                value={bind}
                                css={tw`font-mono`}
                                onChange={(e) => setRoot('bind', e.currentTarget.value)}
                            />
                            <p css={tw`mt-1.5 text-xs text-neutral-400`}>
                                The port must match your server allocation, otherwise nobody can connect. Pterodactyl
                                keeps it in sync automatically on every start when the Java egg is used.
                            </p>
                        </div>
                        <div>
                            <Label>Message of the day</Label>
                            <Textarea
                                rows={2}
                                value={str('motd')}
                                onChange={(e) => setRoot('motd', e.currentTarget.value)}
                            />
                            <p css={tw`mt-1.5 text-xs text-neutral-400`}>
                                Supports MiniMessage, like &lt;green&gt;Welcome!
                            </p>
                        </div>
                        <div>
                            <Label>Shown max players</Label>
                            <Input
                                type={'number'}
                                value={num(config.root, 'show-max-players', 500)}
                                onChange={(e) => setRoot('show-max-players', Number(e.currentTarget.value))}
                            />
                        </div>
                        <div>
                            <Label>Ping passthrough</Label>
                            <Select
                                value={str('ping-passthrough', 'DISABLED')}
                                onChange={(e) => setRoot('ping-passthrough', e.currentTarget.value)}
                            >
                                <option value={'DISABLED'}>Disabled</option>
                                <option value={'MODS'}>Mods only</option>
                                <option value={'DESCRIPTION'}>Description only</option>
                                <option value={'ALL'}>Everything</option>
                            </Select>
                        </div>
                    </div>
                </Card>

                <Card
                    title={'Player info forwarding'}
                    description={FORWARDING_MODES.find((m) => m.value === mode)?.hint}
                >
                    <Label>Mode</Label>
                    <Select
                        value={mode}
                        onChange={(e) => setRoot('player-info-forwarding-mode', e.currentTarget.value)}
                    >
                        {FORWARDING_MODES.map((m) => (
                            <option key={m.value} value={m.value}>
                                {m.label}
                            </option>
                        ))}
                    </Select>
                    {(mode === 'MODERN' || mode === 'BUNGEEGUARD') && (
                        <div css={tw`mt-5`}>
                            <Label>Forwarding secret</Label>
                            <div css={tw`flex items-center gap-2`}>
                                <Input
                                    type={showSecret ? 'text' : 'password'}
                                    readOnly
                                    value={secret || 'No forwarding.secret file found yet'}
                                    css={tw`font-mono`}
                                />
                                <Button.Text
                                    size={Button.Sizes.Small}
                                    shape={Button.Shapes.IconSquare}
                                    onClick={() => setShowSecret((v) => !v)}
                                >
                                    {showSecret ? <EyeOffIcon css={tw`w-4 h-4`} /> : <EyeIcon css={tw`w-4 h-4`} />}
                                </Button.Text>
                                <Button.Text
                                    size={Button.Sizes.Small}
                                    shape={Button.Shapes.IconSquare}
                                    disabled={!secret}
                                    onClick={() => secret && copy(secret)}
                                >
                                    <ClipboardCopyIcon css={tw`w-4 h-4`} />
                                </Button.Text>
                                <Button.Text
                                    size={Button.Sizes.Small}
                                    shape={Button.Shapes.IconSquare}
                                    onClick={regenerateSecret}
                                >
                                    <RefreshIcon css={tw`w-4 h-4`} />
                                </Button.Text>
                            </div>
                            <p css={tw`mt-2 text-xs text-neutral-400`}>
                                Every backend server needs this same secret, and must run in offline mode with proxy
                                forwarding turned on (for Paper: velocity enabled in paper-global.yml).
                            </p>
                        </div>
                    )}
                </Card>
            </div>

            <Card title={'Security & behaviour'}>
                <ToggleRow
                    label={'Online mode'}
                    description={'Authenticate players with Mojang. Keep this on unless you run a cracked network.'}
                    value={bool(config.root, 'online-mode', true)}
                    onChange={(v) => setRoot('online-mode', v)}
                />
                <ToggleRow
                    label={'Force key authentication'}
                    description={'Require signed chat keys from 1.19+ clients.'}
                    value={bool(config.root, 'force-key-authentication', true)}
                    onChange={(v) => setRoot('force-key-authentication', v)}
                />
                <ToggleRow
                    label={'Prevent client proxy connections'}
                    description={'Reject players connecting through a proxy of their own.'}
                    value={bool(config.root, 'prevent-client-proxy-connections', false)}
                    onChange={(v) => setRoot('prevent-client-proxy-connections', v)}
                />
                <ToggleRow
                    label={'Kick existing players'}
                    description={'When a player logs in twice, kick the old session instead of the new one.'}
                    value={bool(config.root, 'kick-existing-players', false)}
                    onChange={(v) => setRoot('kick-existing-players', v)}
                />
                <ToggleRow
                    label={'Sample players in ping'}
                    description={'Show the online player list when hovering the player count.'}
                    value={bool(config.root, 'sample-players-in-ping', false)}
                    onChange={(v) => setRoot('sample-players-in-ping', v)}
                />
                <ToggleRow
                    label={'Announce Forge'}
                    description={'Tell Forge clients that this proxy supports mods.'}
                    value={bool(config.root, 'announce-forge', false)}
                    onChange={(v) => setRoot('announce-forge', v)}
                />
                <ToggleRow
                    label={'Log player IP addresses'}
                    description={'Include player addresses in the proxy log.'}
                    value={bool(config.root, 'enable-player-address-logging', true)}
                    onChange={(v) => setRoot('enable-player-address-logging', v)}
                />
            </Card>

            <Card title={'Advanced'} description={'Only change these if you know why you need to.'}>
                <div css={tw`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
                    {[
                        ['compression-threshold', 'Compression threshold', 256],
                        ['compression-level', 'Compression level', -1],
                        ['login-ratelimit', 'Login rate limit (ms)', 3000],
                        ['connection-timeout', 'Connection timeout (ms)', 5000],
                        ['read-timeout', 'Read timeout (ms)', 30000],
                    ].map(([key, label, fallback]) => (
                        <div key={key as string}>
                            <Label>{label}</Label>
                            <Input
                                type={'number'}
                                value={num(config.advanced, key as string, fallback as number)}
                                onChange={(e) => setAdvanced(key as string, Number(e.currentTarget.value))}
                            />
                        </div>
                    ))}
                </div>
                <div css={tw`mt-4`}>
                    <ToggleRow
                        label={'HAProxy protocol'}
                        description={'Enable if the proxy runs behind a load balancer that speaks the PROXY protocol.'}
                        value={bool(config.advanced, 'haproxy-protocol', false)}
                        onChange={(v) => setAdvanced('haproxy-protocol', v)}
                    />
                    <ToggleRow
                        label={'TCP fast open'}
                        description={'Faster connection setup on Linux kernels that support it.'}
                        value={bool(config.advanced, 'tcp-fast-open', false)}
                        onChange={(v) => setAdvanced('tcp-fast-open', v)}
                    />
                    <ToggleRow
                        label={'Failover on unexpected disconnect'}
                        description={
                            'Send players to the next server in the order instead of kicking them when a server dies.'
                        }
                        value={bool(config.advanced, 'failover-on-unexpected-server-disconnect', true)}
                        onChange={(v) => setAdvanced('failover-on-unexpected-server-disconnect', v)}
                    />
                    <ToggleRow
                        label={'Log player connections'}
                        description={'Log when players connect and disconnect.'}
                        value={bool(config.advanced, 'log-player-connections', true)}
                        onChange={(v) => setAdvanced('log-player-connections', v)}
                    />
                </div>
            </Card>
        </ServerContentBlock>
    );
};
