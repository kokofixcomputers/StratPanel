/* eslint-disable */
// Standalone UI preview: serves the compiled frontend with an in-memory mock of the panel API + Wings websocket.
//   node preview/server.js   ->   http://localhost:4000
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const webpack = require('webpack');
const middleware = require('webpack-dev-middleware');
const { WebSocketServer } = require('ws');

const root = path.join(__dirname, '..');
process.chdir(root);
process.env.NODE_ENV = 'development';
process.env.DEVTOOL = 'false';
process.env.WEBPACK_PUBLIC_PATH = '/assets/';

const config = require(path.join(root, 'webpack.config.js'));
config.devtool = false;
config.output = { ...config.output, filename: 'bundle.js', chunkFilename: '[name].js' };
config.cache = { type: 'filesystem', cacheDirectory: path.join(root, 'node_modules/.cache/preview') };
config.entry = ['./resources/scripts/index.tsx']; // no hot loader patch
config.plugins = config.plugins.filter((p) => p.constructor.name !== 'WebpackAssetsManifest');
config.watchOptions = { ignored: /node_modules/ };

const PORT = Number(process.env.PORT || 4000);
const UUID = '7f3c1d52-9a1e-4b7c-8d2f-1c5e6a9b0d11';
const SHORT = '7f3c1d52';
const now = () => new Date().toISOString();
const paginated = (items, extra = {}) => ({
    object: 'list',
    data: items,
    meta: { pagination: { total: items.length, count: items.length, per_page: 50, current_page: 1, total_pages: 1 }, ...extra },
});
const item = (object, attributes) => ({ object, attributes });

// ---- state -------------------------------------------------------------------------------------
const state = {
    databases: [
        { id: 'a1', name: 's11868_testdb', username: 'u11868_7diNETunGA', connections_from: '%', host: { address: 'db1.example.com', port: 3306 }, password: 'pa55-w0rd-preview' },
    ],
    allocations: [{ id: 1, ip: '10.0.0.4', ip_alias: 'play.example.com', port: 26614, notes: null, is_default: true }],
    backups: [
        { uuid: 'b1', is_successful: true, is_locked: false, name: 'Nightly backup', ignored_files: '', checksum: 'sha1:9f2c1e0a77', bytes: 48392011, created_at: now(), completed_at: now() },
        { uuid: 'b2', is_successful: true, is_locked: true, name: 'Before modpack update', ignored_files: '', checksum: 'sha1:11a8c3b2d9', bytes: 120930112, created_at: '2026-09-28T10:00:00Z', completed_at: '2026-09-28T10:01:12Z' },
    ],
    schedules: [
        { id: 1, name: 'Restart nightly', cron: { day_of_week: '*', month: '*', day_of_month: '*', hour: '4', minute: '0' }, is_active: true, is_processing: false, only_when_online: false, last_run_at: '2026-10-01T04:00:00Z', next_run_at: '2026-10-03T04:00:00Z', created_at: now(), updated_at: now(),
            relationships: { tasks: { object: 'list', data: [item('schedule_task', { id: 1, sequence_id: 1, action: 'command', payload: 'say Restarting in 1 minute', time_offset: 0, is_queued: false, continue_on_failure: false, created_at: now(), updated_at: now() }), item('schedule_task', { id: 2, sequence_id: 2, action: 'power', payload: 'restart', time_offset: 60, is_queued: false, continue_on_failure: false, created_at: now(), updated_at: now() })] } } },
    ],
    users: [
        { uuid: 'u1', username: 'alex', email: 'alex@example.com', image: 'https://www.gravatar.com/avatar/?d=identicon', '2fa_enabled': true, permissions: ['control.console', 'control.start', 'control.stop', 'file.read'], created_at: now() },
    ],
    status: 'offline',
    nextId: 100,
};

const files = {
    '/': [
        ...(process.env.PREVIEW_PROXY ? [['velocity.toml', true, 2400, 'text/plain']] : []), ['.cache', false], ['.fabric', false], ['libraries', false], ['logs', false], ['mods', false], ['world', false],
        ['eula.txt', true, 10, 'text/plain'], ['fabric-server-launch.jar', true, 182000, 'application/jar'], ['server.jar', true, 54000000, 'application/jar'],
        ['server.properties', true, 1360, 'text/plain'], ['ops.json', true, 120, 'application/json'], ['pterodactyl.commands.json', true, 2400, 'application/json'], ['backup.tar.gz', true, 9100000, 'application/gzip'],
    ],
};
const fileAttrs = ([name, isFile, size = 4096, mimetype]) => item('file_object', {
    name, mode: isFile ? '-rw-r--r--' : 'drwxr-xr-x', mode_bits: isFile ? '644' : '755', size, is_file: isFile, is_symlink: false,
    mimetype: isFile ? mimetype : 'inode/directory', created_at: '2026-10-01T13:34:00Z', modified_at: '2026-10-01T13:34:00Z',
});

const serverAttrs = () => ({
    identifier: SHORT, server_identifier: SHORT, internal_id: 11868, __deprecated_uuid_short: SHORT, uuid: UUID,
    name: 'kokotest', node: 'Pterodactyl', is_node_under_maintenance: false, status: null,
    sftp_details: { ip: 'play.example.com', port: 2022 }, invocation: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
    docker_image: 'ghcr.io/pterodactyl/yolks:java_21', description: 'Fabric survival world with friends',
    limits: { memory: 6144, swap: 0, disk: 20480, io: 500, cpu: 300, threads: null },
    egg_features: ['eula', 'java_version', 'pid_limit'], feature_limits: { databases: 3, allocations: 3, backups: 5 },
    is_transferring: false, skip_scripts: false,
    relationships: {
        allocations: { object: 'list', data: state.allocations.map((a) => item('allocation', a)) },
        variables: { object: 'list', data: variables.map((v) => item('egg_variable', v)) },
    },
});
const variables = [
    { name: 'Server Jar File', description: 'The name of the server jarfile to run the server with.', env_variable: 'SERVER_JARFILE', default_value: 'server.jar', server_value: 'server.jar', is_editable: true, rules: 'required|string|max:20' },
    { name: 'Minecraft Version', description: 'The version of Minecraft to download.', env_variable: 'MC_VERSION', default_value: 'latest', server_value: '1.21.4', is_editable: true, rules: 'required|string|max:20' },
    { name: 'Build Number', description: 'The build number for the selected version.', env_variable: 'BUILD_NUMBER', default_value: 'latest', server_value: 'latest', is_editable: false, rules: 'required|string|max:20' },
];

// ---- api ---------------------------------------------------------------------------------------
const app = express();
app.use(express.json());

const api = express.Router();
const otherServer = (name, uuid, port) => ({ ...serverAttrs(), name, uuid, identifier: uuid.slice(0, 8), server_identifier: uuid.slice(0, 8), relationships: { allocations: { object: 'list', data: [item('allocation', { id: port, ip: '10.0.0.5', ip_alias: null, port, notes: null, is_default: true })] }, variables: { object: 'list', data: [] } } });
api.get('/', (req, res) => res.json(paginated([item('server', serverAttrs()), item('server', otherServer('Survival SMP', 'a1b2c3d4-0000-4000-8000-000000000001', 25570)), item('server', otherServer('Creative Plots!', 'b1b2c3d4-0000-4000-8000-000000000002', 25571))])));
api.get('/self-service', (req, res) => res.json({ object: 'self_service', attributes: { enabled: true, can_create: true, max_servers: 3, owned: 1, limits: { memory: 2048, disk: 10240, cpu: 200 }, max: { memory: 8192, disk: 51200, cpu: 400 }, nodes: [{ id: 1, name: 'Frankfurt-1', location: 'fra', description: 'Frankfurt', ping_url: `http://localhost:${PORT}`, memory_free: 16384, disk_free: 200000, free_allocations: 40 }, { id: 2, name: 'Singapore-1', location: 'sgp', description: 'Singapore', ping_url: 'http://10.255.255.1:8080', memory_free: 1024, disk_free: 200000, free_allocations: 10 }, { id: 3, name: 'Dallas-1', location: 'dal', description: 'Dallas', ping_url: `http://127.0.0.1:${PORT}`, memory_free: 8192, disk_free: 90000, free_allocations: 0 }] } }));
api.post('/self-service', (req, res) => res.status(201).json({ object: 'server', attributes: serverAttrs(), meta: { is_server_owner: true, user_permissions: ['*'] } }));
api.get('/permissions', (req, res) => res.json({ object: 'system_permissions', attributes: { permissions: {} } }));
api.get('/account/activity', (req, res) => res.json(paginated([])));
api.get('/account/api-keys', (req, res) => res.json({ object: 'list', data: [] }));
api.get('/account/ssh-keys', (req, res) => res.json({ object: 'list', data: [] }));
api.get('/servers/:id', (req, res) => res.json({ object: 'server', attributes: serverAttrs(), meta: { is_server_owner: true, user_permissions: ['*'] } }));
api.get('/servers/:id/websocket', (req, res) => res.json({ data: { token: 'preview-token', socket: `ws://localhost:${PORT}/ws` } }));
api.get('/servers/:id/resources', (req, res) => res.json({ object: 'stats', attributes: { current_state: state.status, is_suspended: false, resources: { memory_bytes: 0, cpu_absolute: 0, disk_bytes: 201457664, network_rx_bytes: 0, network_tx_bytes: 0, uptime: 0 } } }));
api.get('/servers/:id/activity', (req, res) => res.json(paginated([])));

files['/mods'] = [['sodium-fabric-0.5.0.jar', true, 1200000, 'application/jar'], ['lithium-fabric-0.14.jar', true, 900000, 'application/jar']];
files['/plugins'] = [];
files['/world'] = [['level.dat', true, 2048, 'application/octet-stream'], ['region', false]];
api.get('/servers/:id/files/list', (req, res) => res.json({ object: 'list', data: (files[req.query.directory] || (['/', ''].includes(String(req.query.directory)) ? files['/'] : [])).map(fileAttrs) }));
const fileStore = {
    ...(process.env.PREVIEW_PROXY ? { '/velocity.toml': `# Config version. Do not change this
config-version = "2.7"

# What port should the proxy be bound to? By default, we'll bind to all addresses on port 25565.
bind = "0.0.0.0:25565"

# What should be the MOTD? This gets displayed when the player adds your server to their server list.
motd = "<#09add3>A Velocity Server"

# What should we display for the maximum number of players?
show-max-players = 500

# Should we authenticate players with Mojang? By default, this is on.
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = "NONE"
forwarding-secret-file = "forwarding.secret"
announce-forge = false
kick-existing-players = false
ping-passthrough = "DISABLED"
sample-players-in-ping = false
enable-player-address-logging = true

[servers]
# Configure your servers here.
lobby = "127.0.0.1:30066"
factions = "127.0.0.1:30067"
minigames = "127.0.0.1:30068"

# In what order we should try servers when a player logs in or is kicked from a server.
try = [
    "lobby"
]

[forced-hosts]
# Configure your forced hosts here.
"lobby.example.com" = [
    "lobby"
]
"factions.example.com" = [
    "factions"
]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
log-player-connections = true
`, '/forwarding.secret': 'aB3dE5gH7jK9' } : {}),
    '/server.properties': ['#Minecraft server properties', 'accepts-transfers=false', 'allow-flight=false', 'broadcast-console-to-ops=true', 'broadcast-rcon-to-ops=true', 'bug-report-link=', 'chat-spam-threshold-seconds=10', 'difficulty=normal', 'enable-command-block=false', 'gamemode=survival', 'hardcore=false', 'level-name=world', 'max-players=20', 'motd=A Minecraft Server', 'online-mode=true', 'pvp=true', 'server-port=26614', 'simulation-distance=10', 'spawn-protection=16', 'view-distance=10', 'white-list=false', ''].join('\n'),
    '/pterodactyl.json': JSON.stringify({ software: process.env.PREVIEW_PROXY ? 'VELOCITY' : 'FABRIC', name: process.env.PREVIEW_PROXY ? 'Velocity' : 'Fabric', minecraftVersion: '1.21.4', build: '0.16.9', java: 21, mods: {
        AANobbMI: { kind: 'mod', projectId: 'AANobbMI', slug: 'sodium', title: 'Sodium', icon: 'https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp', versionId: 'oldversion', versionNumber: '0.5.0', file: 'sodium-fabric-0.5.0.jar', directory: '/mods', loaders: ['fabric'], gameVersion: '1.21.4', installedAt: '2026-09-01T10:00:00Z' },
    } }, null, 4),
    '/usercache.json': JSON.stringify([{ uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03', name: 'kokofixcomputers', expiresOn: '2026-11-03 02:09:12 +0000' }, { uuid: '03e95ced-267e-4147-8ea0-5f55c00be51c', name: 'juseewan', expiresOn: '2026-11-02 23:21:01 +0000' }, { uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Notch', expiresOn: '2026-10-30 12:00:00 +0000' }]),
    '/banned-players.json': '[]',
    '/pterodactyl.commands.json': "{\n  \"version\": 1,\n  \"generatedAt\": \"2026-10-05T12:00:00Z\",\n  \"generator\": { \"name\": \"StratPanel Bridge\", \"version\": \"1.0.0\", \"platform\": \"paper\", \"minecraft\": \"1.21.4\" },\n  \"plugins\": [\n    { \"name\": \"EssentialsX\", \"version\": \"2.20.1\" },\n    { \"name\": \"WorldEdit\", \"version\": \"7.3.8\" }\n  ],\n  \"root\": {\n    \"children\": [\n      {\n        \"name\": \"gamemode\",\n        \"type\": \"literal\",\n        \"aliases\": [\"gm\"],\n        \"description\": \"Sets a player's game mode\",\n        \"permission\": \"minecraft.command.gamemode\",\n        \"plugin\": \"minecraft\",\n        \"executable\": false,\n        \"children\": [\n          {\n            \"name\": \"gamemode\",\n            \"type\": \"argument\",\n            \"parser\": \"minecraft:gamemode\",\n            \"executable\": true,\n            \"children\": [\n              { \"name\": \"target\", \"type\": \"argument\", \"parser\": \"minecraft:entity\", \"executable\": true }\n            ]\n          }\n        ]\n      },\n      {\n        \"name\": \"warp\",\n        \"type\": \"literal\",\n        \"description\": \"Teleports you to a warp\",\n        \"permission\": \"essentials.warp\",\n        \"plugin\": \"EssentialsX\",\n        \"executable\": true,\n        \"children\": [\n          { \"name\": \"name\", \"type\": \"argument\", \"parser\": \"brigadier:string\", \"suggestions\": [\"spawn\", \"mine\"], \"executable\": true },\n          {\n            \"name\": \"set\",\n            \"type\": \"literal\",\n            \"children\": [{ \"name\": \"name\", \"type\": \"argument\", \"parser\": \"brigadier:string\", \"executable\": true }]\n          }\n        ]\n      },\n      {\n        \"name\": \"execute\",\n        \"type\": \"literal\",\n        \"plugin\": \"minecraft\",\n        \"children\": [\n          {\n            \"name\": \"as\",\n            \"type\": \"literal\",\n            \"children\": [\n              { \"name\": \"targets\", \"type\": \"argument\", \"parser\": \"minecraft:entity\", \"redirect\": [\"execute\"] }\n            ]\n          },\n          { \"name\": \"run\", \"type\": \"literal\", \"redirect\": [] }\n        ]\n      }\n    ]\n  }\n}\n",
    '/config/voicechat/voicechat-server.properties': '# Simple Voice Chat server config\nport=24454\nmax_voice_distance=48.0\n',
    '/ops.json': JSON.stringify([{ uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Notch', level: 4, bypassesPlayerLimit: false }], null, 2),
    '/whitelist.json': JSON.stringify([{ uuid: '853c80ef-3c37-49fd-aa49-938b674adae6', name: 'jeb_' }], null, 2),
};
const fileTasks = {};
const startTask = (res, delay, file) => {
    const id = `t${Date.now()}${Math.random()}`;
    fileTasks[id] = { status: 'running', file: null };
    setTimeout(() => (fileTasks[id] = { status: 'done', file }), delay);
    res.status(202).json({ task: id });
};
api.post('/servers/:id/files/compress', (req, res) => startTask(res, 7000, fileAttrs([`archive-2026-10-02T170000Z.tar.gz`, true, 48392011, 'application/gzip'])));
api.post('/servers/:id/files/decompress', (req, res) => startTask(res, 5000, null));
api.get('/servers/:id/files/task/:task', (req, res) => res.json({ error: null, file: null, ...(fileTasks[req.params.task] || { status: 'unknown' }) }));
api.get('/servers/:id/files/contents', (req, res) => (req.query.file in fileStore ? res.type('text/plain').send(fileStore[req.query.file]) : res.status(404).json({ errors: [{ detail: 'not found' }] })));
api.post('/servers/:id/files/write', express.text({ type: '*/*' }), (req, res) => { fileStore['/' + String(req.query.file).replace(/^\/+/, '')] = req.body; res.status(204).end(); });
let mockIcon = null;
api.get('/servers/:id/files/download', (req, res) => {
    if (String(req.query.file).endsWith('server-icon.png')) return mockIcon ? res.json({ attributes: { url: '/mock-icon' } }) : res.status(404).json({ errors: [{ detail: 'not found' }] });
    if (String(req.query.file).endsWith('/overworld/data/minecraft/world_gen_settings.dat')) return res.json({ attributes: { url: '/mock-world-gen' } });
    res.json({ attributes: { url: '/mock-missing' } });
});
// A gzipped world_gen_settings.dat of the 26.x layout with the seed 3618440937952319688 in it.
app.get('/mock-world-gen', (req, res) => {
    const name = (n) => Buffer.concat([Buffer.from([0, n.length]), Buffer.from(n)]);
    const seed = Buffer.alloc(8);
    seed.writeBigInt64BE(3618440937952319688n);
    const nbt = Buffer.concat([Buffer.from([10]), name(''), Buffer.from([10]), name('data'), Buffer.from([4]), name('seed'), seed, Buffer.from([0, 0])]);
    res.type('application/octet-stream').send(require('node:zlib').gzipSync(nbt));
});
app.get('/mock-missing', (req, res) => res.status(404).end());
app.post('/mock-upload', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
    const start = req.body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const end = req.body.indexOf(Buffer.from('IEND'));
    if (start >= 0 && end > start) mockIcon = req.body.subarray(start, end + 8);
    res.status(204).end();
});
app.get('/mock-icon', (req, res) => res.type('png').send(mockIcon));
api.get('/servers/:id/files/upload', (req, res) => res.json({ attributes: { url: '/mock-upload' } }));

api.get('/servers/:id/databases', (req, res) => res.json({ object: 'list', data: state.databases.map((d) => item('server_database', { ...d, relationships: { password: item('database_password', { password: d.password }) } })) }));
api.post('/servers/:id/databases', (req, res) => {
    const d = { id: `d${state.nextId++}`, name: `s11868_${req.body.database}`, username: `u11868_${Math.random().toString(36).slice(2, 12)}`, connections_from: req.body.remote || '%', host: { address: 'db1.example.com', port: 3306 }, password: 'pa55-w0rd-preview' };
    state.databases.push(d);
    res.json(item('server_database', { ...d, relationships: { password: item('database_password', { password: d.password }) } }));
});
api.post('/servers/:id/databases/:db/rotate-password', (req, res) => { const d = state.databases.find((x) => x.id === req.params.db); d.password = Math.random().toString(36).slice(2, 20); res.json(item('server_database', { ...d, relationships: { password: item('database_password', { password: d.password }) } })); });
api.delete('/servers/:id/databases/:db', (req, res) => { state.databases = state.databases.filter((x) => x.id !== req.params.db); res.status(204).end(); });

state.domains = [{ id: 1, domain: 'play.example.com', allocation_id: 1, allocation: 'play.example.com:26614', dns_ok: true }, { id: 2, domain: 'survival.mynetwork.net', allocation_id: 1, allocation: 'play.example.com:26614', dns_ok: false }];
api.get('/servers/:id/domains', (req, res) => res.json({ object: 'list', data: state.domains, meta: { enabled: true, target_ip: '203.0.113.10', max: 5 } }));
api.post('/servers/:id/domains', (req, res) => { const d = { id: state.nextId++, domain: String(req.body.domain).toLowerCase(), allocation_id: req.body.allocation_id, allocation: 'play.example.com:26614', dns_ok: false }; if (state.domains.some((x) => x.domain === d.domain)) return res.status(422).json({ errors: [{ detail: 'That domain is already in use.' }] }); state.domains.push(d); res.status(201).json({ object: 'server_domain', attributes: d }); });
api.delete('/servers/:id/domains/:d', (req, res) => { state.domains = state.domains.filter((x) => x.id != req.params.d); res.status(204).end(); });
state.env = [{ key: 'JAVA_TOOL_OPTIONS', value: '-XX:+UseZGC' }];
api.get('/servers/:id/startup/environment', (req, res) => res.json({ object: 'list', data: state.env, meta: { max: 50 } }));
api.post('/servers/:id/startup/environment', (req, res) => {
    const { key, value } = req.body;
    if (['STARTUP', 'SERVER_PORT'].includes(String(key).toUpperCase())) return res.status(400).json({ errors: [{ detail: `${key} is used by the panel or by the egg of this server and cannot be changed here.` }] });
    state.env = state.env.filter((v) => v.key !== key).concat({ key, value });
    res.json({ key, value });
});
api.delete('/servers/:id/startup/environment/:key', (req, res) => { state.env = state.env.filter((v) => v.key !== req.params.key); res.status(204).end(); });
api.get('/servers/:id/network/allocations', (req, res) => res.json({ object: 'list', data: state.allocations.map((a) => item('allocation', a)) }));
api.post('/servers/:id/network/allocations', (req, res) => { const a = { id: state.nextId++, ip: '10.0.0.4', ip_alias: 'play.example.com', port: 26615 + state.allocations.length, notes: null, is_default: false }; state.allocations.push(a); res.json(item('allocation', a)); });
api.post('/servers/:id/network/allocations/:a', (req, res) => { const a = state.allocations.find((x) => x.id == req.params.a); a.notes = req.body.notes; res.json(item('allocation', a)); });
api.post('/servers/:id/network/allocations/:a/primary', (req, res) => { state.allocations.forEach((x) => (x.is_default = x.id == req.params.a)); res.json(item('allocation', state.allocations.find((x) => x.id == req.params.a))); });
api.delete('/servers/:id/network/allocations/:a', (req, res) => { state.allocations = state.allocations.filter((x) => x.id != req.params.a); res.status(204).end(); });

api.get('/servers/:id/backups', (req, res) => res.json(paginated(state.backups.map((b) => item('backup', b)), { backup_count: state.backups.length })));
api.delete('/servers/:id/backups/:b', (req, res) => { state.backups = state.backups.filter((x) => x.uuid !== req.params.b); res.status(204).end(); });
api.post('/servers/:id/backups', (req, res) => { const b = { uuid: `b${state.nextId++}`, is_successful: true, is_locked: !!req.body.is_locked, name: req.body.name || 'New backup', ignored_files: '', checksum: 'sha1:abc', bytes: 1048576, created_at: now(), completed_at: now() }; state.backups.push(b); res.json(item('backup', b)); });

api.get('/servers/:id/schedules', (req, res) => res.json({ object: 'list', data: state.schedules.map((s) => item('server_schedule', s)) }));
api.get('/servers/:id/schedules/:s', (req, res) => res.json(item('server_schedule', state.schedules.find((s) => s.id == req.params.s) || state.schedules[0])));

api.get('/servers/:id/users', (req, res) => res.json({ object: 'list', data: state.users.map((u) => item('user', u)) }));
api.get('/servers/:id/startup', (req, res) => res.json({ object: 'list', data: variables.map((v) => item('egg_variable', v)), meta: { startup_command: 'java -Xms128M -Xmx6144M -jar server.jar', docker_images: { 'Java 21': 'ghcr.io/pterodactyl/yolks:java_21', 'Java 17': 'ghcr.io/pterodactyl/yolks:java_17' }, raw_startup_command: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}' } }));

// Anything else that mutates: pretend it worked.
api.all('*', (req, res) => (req.method === 'GET' ? res.json({ object: 'list', data: [] }) : res.status(204).end()));
app.use('/api/client', api);
app.get('/locales/locale.json', (req, res) => res.json({}));

const user = { uuid: 'preview-user', username: 'preview', email: 'preview@example.com', root_admin: true, use_totp: false, language: 'en', updated_at: now(), created_at: now() };
const page = (title) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<script>window.PterodactylUser=${JSON.stringify(user)};window.SiteConfiguration=${JSON.stringify({ name: 'Pterodactyl', locale: 'en', recaptcha: { enabled: false, siteKey: '' } })};</script></head>
<body><div id="modal-portal"></div><div id="app"></div><script src="/assets/bundle.js"></script></body></html>`;

app.use(middleware(webpack(config), { publicPath: '/assets/', writeToDisk: false }));
const renderAdmin = require('./admin');
app.use('/themes', express.static(path.join(root, 'public/themes')));
app.use('/helper', express.static(path.join(root, 'public/helper')));
app.use('/tools', express.static(path.join(root, 'public/tools')));
app.use('/js', express.static(path.join(root, 'public/js')));
app.use('/favicons', express.static(path.join(root, 'public/favicons')));
app.get(/^\/admin(\/.*)?$/, (req, res) => res.send(renderAdmin(req.path.replace(/\/$/, '') || '/admin')));
app.get('*', (req, res) => res.send(page('Panel preview')));

// ---- fake wings --------------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const boot = ['[Pterodactyl]: Checking server disk space usage, this could take a few seconds...', '[Pterodactyl]: Updating process configuration files...', '[Pterodactyl]: Pulling Docker container image, this could take a few minutes to complete...'];
const warnings = [
    '[19:36:37] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9',
    '[19:36:38] [ForkJoinPool-1-worker-17/WARN]: Mod cardboard uses the version ${version} which isn\'t compatible with Loader\'s extended semantic version format',
    '[19:36:38] [main/WARN]: Warnings were found!',
    " - Mod 'Forge Config API Port' (forgeconfigapiport) 26.3.1 recommends any version of modmenu, which is missing!",
    '\t - You should install any version of modmenu for the optimal experience.',
    '[19:36:39] [main/INFO]: Starting server',
    'WARNING: A terminally deprecated method in sun.misc.Unsafe has been called',
    'WARNING: sun.misc.Unsafe::objectFieldOffset has been called by org.joml.MemUtil$MemUtilUnsafe (file:/home/container/libraries/org/joml/joml/1.10.9/joml-1.10.9.jar)',
    'WARNING: Please consider reporting this to the maintainers of class org.joml.MemUtil$MemUtilUnsafe',
    'WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release',
    '[19:36:40] [Server thread/ERROR]: Could not load chunk at 12, 4',
    '\tat net.minecraft.server.Chunk.load(Chunk.java:42)',
    '[19:36:41] [Server thread/INFO]: Done (3.412s)! For help, type "help"',
];
const startup = ['[17:04:11] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9', '[17:04:13] [main/INFO]: Preparing spawn area: 100%', '[17:04:14] [Server thread/INFO]: Done (3.412s)! For help, type "help"'];
wss.on('connection', (ws) => {
    const send = (event, ...args) => ws.readyState === 1 && ws.send(JSON.stringify({ event, args }));
    let uptime = 0, rx = 0, tx = 0, timer;
    const stats = () => {
        const on = state.status === 'running';
        if (on) { uptime += 1000; rx += Math.random() * 4000; tx += Math.random() * 9000; }
        send('stats', JSON.stringify({ memory_bytes: on ? 1.4e9 + Math.random() * 2e8 : 0, memory_limit_bytes: 6.4e9, cpu_absolute: on ? 20 + Math.random() * 50 : 0, network: { rx_bytes: rx, tx_bytes: tx }, state: state.status, disk_bytes: 201457664, uptime: on ? uptime : 0 }));
    };
    const setStatus = (s) => { state.status = s; send('status', s); };
    ws.on('message', (raw) => {
        const { event, args } = JSON.parse(raw);
        if (event === 'auth') { send('auth success'); setStatus(state.status); }
        if (event === 'send logs') { boot.concat(warnings).forEach((l) => send('console output', l)); send('console output', '[17:00:00] [Server thread/INFO]: kokofixcomputers[/203.0.113.7:51234] logged in with entity id 41 at (0.5, 64.0, 0.5)'); send('console output', '[17:00:05] [Server thread/INFO]: Notch[/203.0.113.8:5000] logged in with entity id 42 at (0.5, 64.0, 0.5)'); send('console output', '[17:01:00] [Server thread/INFO]: Notch lost connection: Disconnected'); }
        if (event === 'send stats') stats();
        if (event === 'send command' && String(args[0]).startsWith('stratpanelhidepanellogs')) {
            const prefix = '[17:10:00] [Server thread/INFO]: [StratPanel] ::stratpanel:: ';
            const sub = String(args[0]).split(' ')[1];
            const players = '{"event":"players","players":[{"name":"kokofixcomputers","uuid":"13bc7d5e-f906-41ff-a949-6c1eb677fe03"}]}';
            if (sub === 'handshake') {
                send('console output', prefix + '{"event":"handshake","version":"1.0.0","platform":"paper","minecraft":"26.3","protocol":1}');
                send('console output', prefix + players);
            } else if (sub === 'refresh') {
                setTimeout(() => {
                    send('console output', prefix + players);
                    send('console output', prefix + '{"event":"commands-updated","generatedAt":"2026-10-07T00:00:00Z"}');
                    send('console output', prefix + '{"event":"refreshed","generatedAt":"2026-10-07T00:00:00Z"}');
                }, 1200);
            }
        } else if (event === 'send command' && args[0] === 'sp-test') {
            const doc = JSON.parse(fileStore['/pterodactyl.commands.json']);
            doc.root.children.push({ name: 'newcmd', type: 'literal', description: 'Added after the plugin announced a change', children: [{ name: 'option', type: 'argument', parser: 'brigadier:string', suggestions: ['fast', 'slow'] }] });
            doc.generatedAt = '2026-10-06T00:00:00Z';
            fileStore['/pterodactyl.commands.json'] = JSON.stringify(doc, null, 2);
            const entry = files['/'].find((f) => f[0] === 'pterodactyl.commands.json');
            if (entry) entry[2] = fileStore['/pterodactyl.commands.json'].length;
            send('console output', '[17:10:00] [Server thread/INFO]: ::stratpanel:: {"event":"commands-updated","generatedAt":"2026-10-06T00:00:00Z"}');
        } else if (event === 'send command') send('console output', `> ${args[0]}`), send('console output', '[17:05:01] [Server thread/INFO]: Unknown or incomplete command, see below for error');
        if (event === 'set state') {
            const a = args[0];
            if (a === 'start') { setStatus('starting'); startup.forEach((l, i) => setTimeout(() => send('console output', l), 400 * (i + 1))); setTimeout(() => { setStatus('running'); setTimeout(() => send('console output', '[17:00:00] [Server thread/INFO]: kokofixcomputers[/203.0.113.7:51234] logged in with entity id 41 at (0.5, 64.0, 0.5)'), 500); }, 1500); }
            if (a === 'restart') { setStatus('stopping'); setTimeout(() => { setStatus('starting'); setTimeout(() => setStatus('running'), 1200); }, 1000); }
            if (a === 'stop' || a === 'kill') { setStatus('stopping'); setTimeout(() => { uptime = 0; setStatus('offline'); }, 1000); }
        }
    });
    timer = setInterval(stats, 1000);
    ws.on('close', () => clearInterval(timer));
});

server.listen(PORT, () => console.log(`Panel preview: http://localhost:${PORT}  (building bundle...)`));
