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

// Auto sleep of the mock server, off like on a real one. /mock-sleep?sleeping=1 puts it to sleep, ?idle=1 starts the countdown,
// ?wake=0 says no domain is set up (the wake option is then explained instead of offered).
const mockSleep = { enabled: false, idle_minutes: 15, wake_on_join: true, slept_at: null, idle_since: null, wake_available: true };
const sleepAttrs = () => ({ ...mockSleep, sleeping: mockSleep.enabled && !!mockSleep.slept_at, choices: [5, 10, 15, 30, 60, 120, 240] });
const serverAttrs = () => ({
    identifier: SHORT, server_identifier: SHORT, internal_id: 11868, __deprecated_uuid_short: SHORT, uuid: UUID,
    name: 'kokotest', node: 'Pterodactyl', is_node_under_maintenance: false, cpu_burst: { enabled: true, percent: 100 }, status: null, can_control: { start: true, stop: true, restart: true }, auto_sleep: { enabled: mockSleep.enabled, sleeping: mockSleep.enabled && !!mockSleep.slept_at }, trash: { enabled: true, retention_days: 30 },
    sftp_details: { ip: 'play.example.com', port: 2022 }, invocation: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar server.jar',
    docker_image: 'ghcr.io/pterodactyl/yolks:java_21', description: 'Fabric survival world with friends',
    limits: { memory: 6144, swap: 0, disk: 20480, io: 500, cpu: 300, threads: null },
    domains: ['play.stratos.example.com', 'survival.example.org'], egg_id: 1, egg_features: ['eula', 'java_version', 'pid_limit'], feature_limits: { databases: 3, allocations: 3, backups: 5 },
    is_transferring: false, skip_scripts: false,
    relationships: {
        allocations: { object: 'list', data: state.allocations.map((a) => item('allocation', a)) },
        variables: { object: 'list', data: variables.map((v) => item('egg_variable', v)) },
    },
});
const variables = [
    { name: 'Server Jar File', description: 'The name of the server jarfile to run the server with.', env_variable: 'SERVER_JARFILE', default_value: 'server.jar', server_value: 'server.jar', is_editable: true, rules: 'required|string|max:20' },
    { name: 'Minecraft Version', description: 'The version of Minecraft to download.', env_variable: 'MC_VERSION', default_value: 'latest', server_value: '26.3', is_editable: true, rules: 'required|string|max:20' },
    { name: 'Build Number', description: 'The build number for the selected version.', env_variable: 'BUILD_NUMBER', default_value: 'latest', server_value: 'latest', is_editable: false, rules: 'required|string|max:20' },
];

// The time and the weather the mock server reports: the game runs at 20 ticks a second from the time that was set.
// /mock-world?time=13000&weather=clear|rain|thunder|cycle  (weather=cycle changes it every 12 seconds)
const mockWorld = { startedAt: Date.now(), time: 5000, weather: 'clear', frozen: false };
const mockWorldNow = () => {
    const elapsed = mockWorld.frozen ? 0 : (Date.now() - mockWorld.startedAt) * 0.02;
    const total = Math.floor(mockWorld.time + elapsed);
    const weather = mockWorld.weather === 'cycle' ? ['clear', 'rain', 'thunder'][Math.floor((Date.now() - mockWorld.startedAt) / 12000) % 3] : mockWorld.weather;
    return { time: total % 24000, day: 3 + Math.floor(total / 24000), raining: weather === 'rain' || weather === 'thunder', thundering: weather === 'thunder' };
};

// ---- api ---------------------------------------------------------------------------------------
const app = express();
app.use(express.json());

const api = express.Router();
const otherServer = (name, uuid, port) => ({ ...serverAttrs(), name, uuid, identifier: uuid.slice(0, 8), server_identifier: uuid.slice(0, 8), relationships: { allocations: { object: 'list', data: [item('allocation', { id: port, ip: '10.0.0.5', ip_alias: null, port, notes: null, is_default: true })] }, variables: { object: 'list', data: [] } } });
const dashServers = () => [
    item('server', { ...serverAttrs(), server_owner: true }),
    item('server', { ...otherServer('Survival SMP', 'a1b2c3d4-0000-4000-8000-000000000001', 25570), server_owner: true }),
    item('server', { ...otherServer('Creative Plots!', 'b1b2c3d4-0000-4000-8000-000000000002', 25571), server_owner: false, node: 'Dallas-1' }),
    ...['Lobby', 'Skyblock', 'Bedwars', 'Modded Fun', 'Test Server 10', 'Test Server 2'].map((n, i) =>
        item('server', { ...otherServer(n, `c${i}b2c3d4-0000-4000-8000-00000000010${i}`, 25580 + i), server_owner: i % 3 !== 0, node: i % 2 ? 'Singapore-1' : 'Frankfurt-1', description: i === 2 ? 'Minigames for the whole family' : '' })
    ),
];
api.get('/', (req, res) => {
    if (req.query.type === 'admin') return res.json(paginated([]));
    const per = Math.min(Number(req.query.per_page || 50), 100);
    res.json(paginated(dashServers().slice(0, per)));
});
// Dashboard folders and stars, kept in memory.
const dash = { next: 1, folders: [], servers: {} };
const dashLayout = () => ({ object: 'dashboard_layout', attributes: { folders: dash.folders.map((f) => ({ id: f.id, name: f.name })), servers: Object.entries(dash.servers).filter(([, m]) => m.folder !== null || m.starred).map(([uuid, m]) => ({ uuid, folder: m.folder, starred: m.starred })) } });
api.get('/dashboard', (req, res) => res.json(dashLayout()));
api.post('/dashboard/folders', (req, res) => {
    if (dash.folders.some((f) => f.name === req.body.name)) return res.status(422).json({ errors: [{ code: 'ValidationException', detail: 'You already have a folder with that name.' }] });
    dash.folders.push({ id: dash.next++, name: req.body.name });
    res.json(dashLayout());
});
api.post('/dashboard/folders/order', (req, res) => { dash.folders.sort((a, b) => req.body.order.indexOf(a.id) - req.body.order.indexOf(b.id)); res.json(dashLayout()); });
api.patch('/dashboard/folders/:id', (req, res) => { const f = dash.folders.find((x) => x.id === Number(req.params.id)); if (f) f.name = req.body.name; res.json(dashLayout()); });
api.delete('/dashboard/folders/:id', (req, res) => {
    dash.folders = dash.folders.filter((x) => x.id !== Number(req.params.id));
    Object.values(dash.servers).forEach((m) => { if (m.folder === Number(req.params.id)) m.folder = null; });
    res.json(dashLayout());
});
api.put('/dashboard/servers/:uuid', (req, res) => {
    const m = dash.servers[req.params.uuid] || (dash.servers[req.params.uuid] = { folder: null, starred: false });
    if ('folder' in req.body) m.folder = req.body.folder;
    if ('starred' in req.body) m.starred = !!req.body.starred;
    res.json(dashLayout());
});
api.get('/self-service', (req, res) => res.json({ object: 'self_service', attributes: { enabled: true, can_create: true, max_servers: 3, owned: 1, ...(process.env.PREVIEW_POOL
            ? { limits: { memory: 2048, disk: 5120, cpu: 100, allocations: 2, backups: 2 }, max: { memory: 3072, disk: 8192, cpu: 150, allocations: 3, backups: 4 }, pool: { limits: { memory: 4096, disk: 10240, cpu: 200, allocations: 5, backups: 5 }, used: { memory: 1024, disk: 2048, cpu: 50, allocations: 2, backups: 1 }, remaining: { memory: 3072, disk: 8192, cpu: 150, allocations: 3, backups: 4 }, minimum: { memory: 512, disk: 1024, cpu: 50, allocations: 1, backups: 0 } } }
            : { limits: { memory: 2048, disk: 10240, cpu: 200 }, max: { memory: 8192, disk: 51200, cpu: 400 } }), nodes: [{ id: 1, name: 'Frankfurt-1', location: 'fra', description: 'Frankfurt', ping_url: `http://localhost:${PORT}`, memory_free: 16384, disk_free: 200000, free_allocations: 40 }, { id: 2, name: 'Singapore-1', location: 'sgp', description: 'Singapore', ping_url: 'http://10.255.255.1:8080', memory_free: 1024, disk_free: 200000, free_allocations: 10 }, { id: 3, name: 'Dallas-1', location: 'dal', description: 'Dallas', ping_url: `http://127.0.0.1:${PORT}`, memory_free: 8192, disk_free: 90000, free_allocations: 0 }] } }));
api.get('/account/resources', (req, res) => res.json({ object: 'resources', attributes: { enabled: true, limited: true, limits: { memory: 4096, disk: 10240, cpu: 200, allocations: 5, backups: 5 }, used: { memory: 1024, disk: 2048, cpu: 50, allocations: 2, backups: 1 }, remaining: { memory: 3072, disk: 8192, cpu: 150, allocations: 3, backups: 4 }, servers: [{ identifier: 'aaaa1111', name: 'Survival', memory: 1024, disk: 2048, cpu: 50, allocations: 2, backups: 1 }] } }));

// The admin pages that are part of the app (Admin > Overview, Roles, Locations): kept in memory.
const usage = (used, limit) => ({ used, limit, percent: Math.round((used / limit) * 1000) / 10, level: used / limit > 0.9 ? 'danger' : used / limit > 0.7 ? 'warning' : 'ok' });
api.get('/admin/overview', (req, res) => res.json({
    totals: { servers: { total: 12, installing: 1, suspended: 0, failed: 1 }, users: { total: 34, admins: 2, two_factor: 9, new: 3 }, nodes: { total: 2, maintenance: 1 }, domains: { total: 5 } },
    capacity: { memory: usage(18432, 32768), disk: usage(90000, 200000), allocations: usage(14, 60) },
    nodes: [
        { id: 1, name: 'Frankfurt-1', fqdn: 'fra.example.com', location: 'fra', maintenance: false, servers: 8, memory: usage(14336, 16384), disk: usage(60000, 100000), allocations: usage(10, 30) },
        { id: 2, name: 'Singapore-1', fqdn: 'sgp.example.com', location: 'sgp', maintenance: true, servers: 4, memory: usage(4096, 16384), disk: usage(30000, 100000), allocations: usage(4, 30) },
    ],
    eggs: [{ id: 1, name: 'Paper', servers: 7 }, { id: 2, name: 'Fabric', servers: 3 }, { id: 3, name: 'Velocity', servers: 2 }],
    recent_servers: [{ id: 3, name: 'Survival', owner: 'alex', node: 'Frankfurt-1', created_at: new Date(Date.now() - 3600e3).toISOString() }, { id: 2, name: 'Creative', owner: 'sam', node: 'Singapore-1', created_at: new Date(Date.now() - 86400e3).toISOString() }],
    recent_users: [{ id: 5, username: 'alex', email: 'alex@example.com', root_admin: false, created_at: new Date(Date.now() - 7200e3).toISOString() }, { id: 1, username: 'preview', email: 'preview@example.com', root_admin: true, created_at: new Date(Date.now() - 864000e3).toISOString() }],
    activity: [{ event: 'server:create', actor: 'alex', ip: '203.0.113.5', timestamp: new Date(Date.now() - 3000e3).toISOString() }, { event: 'auth:success', actor: 'sam', ip: '203.0.113.9', timestamp: new Date(Date.now() - 9000e3).toISOString() }],
    links: { discord: 'https://discord.gg/example', donations: 'https://example.com/donate' },
}));
let adminRoles = [{ id: 1, name: 'Support', description: 'Helps users', color: '#3b82f6', granted: ['users.view', 'servers.view'], denied: ['servers.delete'] }, { id: 2, name: 'Builders', description: '', color: '#16a34a', granted: ['nests.view'], denied: [] }];
const adminGroups = [
    { id: 'users', label: 'Users', description: 'Accounts of the panel.', permissions: [{ key: 'users.view', label: 'See users and their details', needs: null, everybody: false }, { key: 'users.update', label: 'Change users', needs: 'users.view', everybody: false }] },
    { id: 'servers', label: 'Servers', description: 'Servers on the nodes, in the admin area.', permissions: [{ key: 'servers.view', label: 'See servers', needs: null, everybody: false }, { key: 'servers.delete', label: 'Delete servers', needs: 'servers.view', everybody: false }] },
    { id: 'self', label: 'Everybody', description: 'What every account can do without a role.', permissions: [{ key: 'self.servers.create', label: 'Create a server for themselves', needs: null, everybody: true }] },
];
api.get('/admin/roles/permissions', (req, res) => res.json({ groups: adminGroups, mine: null }));
api.get('/admin/roles', (req, res) => res.json({ root_admins: 2, roles: adminRoles.map((r) => ({ id: r.id, name: r.name, description: r.description, color: r.color, permissions: r.granted.length, denied: r.denied.length, users: r.id === 1 ? 3 : 0 })) }));
api.get('/admin/roles/:id', (req, res) => { const role = adminRoles.find((r) => r.id === Number(req.params.id)); return role ? res.json({ role, covers: true, members: role.id === 1 ? [{ id: 5, username: 'alex', email: 'alex@example.com', root_admin: false, since: new Date(Date.now() - 86400e3).toISOString() }] : [] }) : res.status(404).json({ errors: [{ detail: 'Not found' }] }); });
api.post('/admin/roles', (req, res) => { const states = req.body.states || {}; const role = { id: adminRoles.length + 1, name: req.body.name, description: req.body.description, color: req.body.color, granted: Object.keys(states).filter((k) => states[k] === 'grant'), denied: Object.keys(states).filter((k) => states[k] === 'deny') }; adminRoles.push(role); res.status(201).json(role); });
api.patch('/admin/roles/:id', (req, res) => { const role = adminRoles.find((r) => r.id === Number(req.params.id)); const states = req.body.states || {}; Object.assign(role, { name: req.body.name, description: req.body.description, color: req.body.color, granted: Object.keys(states).filter((k) => states[k] === 'grant'), denied: Object.keys(states).filter((k) => states[k] === 'deny') }); res.json(role); });
api.delete('/admin/roles/:id', (req, res) => { adminRoles = adminRoles.filter((r) => r.id !== Number(req.params.id)); res.status(204).end(); });
let adminLocations = [{ id: 1, short: 'fra', long: 'Frankfurt, Germany', nodes: 1, servers: 8 }, { id: 2, short: 'sgp', long: 'Singapore', nodes: 1, servers: 4 }];
api.get('/admin/locations', (req, res) => res.json({ locations: adminLocations }));
api.get('/admin/locations/:id', (req, res) => { const l = adminLocations.find((x) => x.id === Number(req.params.id)); return l ? res.json({ ...l, nodes: [{ id: 1, name: 'Frankfurt-1', fqdn: 'fra.example.com', servers: 8 }] }) : res.status(404).json({ errors: [{ detail: 'Not found' }] }); });
api.post('/admin/locations', (req, res) => { const l = { id: adminLocations.length + 1, short: req.body.short, long: req.body.long, nodes: 0, servers: 0 }; adminLocations.push(l); res.status(201).json(l); });
api.patch('/admin/locations/:id', (req, res) => { Object.assign(adminLocations.find((x) => x.id === Number(req.params.id)), { short: req.body.short, long: req.body.long }); res.json({ id: Number(req.params.id) }); });
api.delete('/admin/locations/:id', (req, res) => { adminLocations = adminLocations.filter((x) => x.id !== Number(req.params.id)); res.status(204).end(); });


let adminHosts = [{ id: 1, name: 'MariaDB main', host: 'db.example.com', port: 3306, username: 'panel', node_id: 1 }, { id: 2, name: 'Backup db', host: '10.0.0.5', port: 3306, username: 'root', node_id: null }];
api.get('/admin/lookups/nodes', (req, res) => res.json({ locations: [{ id: 1, short: 'fra', nodes: [{ id: 1, name: 'Frankfurt-1' }] }, { id: 2, short: 'sgp', nodes: [{ id: 2, name: 'Singapore-1' }] }] }));
api.get('/admin/databases', (req, res) => res.json({ hosts: adminHosts.map((h) => ({ ...h, databases: h.id === 1 ? 6 : 0, node: h.node_id ? { id: h.node_id, name: h.node_id === 1 ? 'Frankfurt-1' : 'Singapore-1' } : null })) }));
api.get('/admin/databases/:id', (req, res) => { const host = adminHosts.find((h) => h.id === Number(req.params.id)); return host ? res.json({ host, databases: host.id === 1 ? [{ id: 1, database: 's1_survival', username: 'u1_abc', remote: '%', max_connections: null, server: { id: 3, name: 'Survival' } }, { id: 2, database: 's2_creative', username: 'u2_def', remote: '%', max_connections: 20, server: { id: 2, name: 'Creative' } }] : [], pagination: { total: host.id === 1 ? 2 : 0, count: host.id === 1 ? 2 : 0, per_page: 25, current_page: 1, total_pages: 1 } }) : res.status(404).json({ errors: [{ detail: 'Not found' }] }); });
api.post('/admin/databases', (req, res) => { const h = { id: adminHosts.length + 1, name: req.body.name, host: req.body.host, port: Number(req.body.port), username: req.body.username, node_id: req.body.node_id ? Number(req.body.node_id) : null }; adminHosts.push(h); res.status(201).json(h); });
api.patch('/admin/databases/:id', (req, res) => { const h = adminHosts.find((x) => x.id === Number(req.params.id)); Object.assign(h, { name: req.body.name, host: req.body.host, port: Number(req.body.port), username: req.body.username, node_id: req.body.node_id ? Number(req.body.node_id) : null }); res.json(h); });
api.delete('/admin/databases/:id', (req, res) => { adminHosts = adminHosts.filter((x) => x.id !== Number(req.params.id)); res.status(204).end(); });


let adminMounts = [{ id: 1, uuid: '5a1b2c3d-0000-4000-8000-000000000001', name: 'Shared maps', description: 'Maps for every lobby', source: '/srv/maps', target: '/maps', read_only: true, user_mountable: false, eggs: [{ id: 1, name: 'Paper' }], nodes: [{ id: 1, name: 'Frankfurt-1', fqdn: 'fra.example.com' }] }];
api.get('/admin/lookups/eggs', (req, res) => res.json({ nests: [{ id: 1, name: 'Minecraft', eggs: [{ id: 1, name: 'Paper' }, { id: 2, name: 'Fabric' }, { id: 3, name: 'Velocity' }] }] }));
api.get('/admin/mounts', (req, res) => res.json({ mounts: adminMounts.map((m) => ({ id: m.id, name: m.name, source: m.source, target: m.target, eggs: m.eggs.length, nodes: m.nodes.length, servers: 2 })) }));
api.get('/admin/mounts/:id', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); return m ? res.json(m) : res.status(404).json({ errors: [{ detail: 'Not found' }] }); });
api.post('/admin/mounts', (req, res) => { const m = { id: adminMounts.length + 1, uuid: '5a1b2c3d-0000-4000-8000-00000000000' + (adminMounts.length + 1), ...req.body, eggs: [], nodes: [] }; adminMounts.push(m); res.status(201).json(m); });
api.patch('/admin/mounts/:id', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); Object.assign(m, req.body); res.json(m); });
api.delete('/admin/mounts/:id', (req, res) => { adminMounts = adminMounts.filter((x) => x.id !== Number(req.params.id)); res.status(204).end(); });
api.post('/admin/mounts/:id/eggs', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); const names = { 1: 'Paper', 2: 'Fabric', 3: 'Velocity' }; for (const id of req.body.eggs) if (!m.eggs.find((e) => e.id === id)) m.eggs.push({ id, name: names[id] }); res.json(m); });
api.post('/admin/mounts/:id/nodes', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); const names = { 1: 'Frankfurt-1', 2: 'Singapore-1' }; for (const id of req.body.nodes) if (!m.nodes.find((e) => e.id === id)) m.nodes.push({ id, name: names[id], fqdn: names[id].toLowerCase() + '.example.com' }); res.json(m); });
api.delete('/admin/mounts/:id/eggs/:egg', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); m.eggs = m.eggs.filter((e) => e.id !== Number(req.params.egg)); res.status(204).end(); });
api.delete('/admin/mounts/:id/nodes/:node', (req, res) => { const m = adminMounts.find((x) => x.id === Number(req.params.id)); m.nodes = m.nodes.filter((e) => e.id !== Number(req.params.node)); res.status(204).end(); });


let adminUsers = [
    { id: 1, email: 'preview@example.com', username: 'preview', name_first: 'Pre', name_last: 'View', language: 'en', root_admin: true, use_totp: true, servers: 3, subuser_of: 0, roles: [] },
    { id: 5, email: 'alex@example.com', username: 'alex', name_first: 'Alex', name_last: 'Miller', language: 'en', root_admin: false, use_totp: false, servers: 2, subuser_of: 1, roles: [{ id: 1, name: 'Support', color: '#3b82f6' }] },
    { id: 6, email: 'sam@example.com', username: 'sam', name_first: 'Sam', name_last: 'Lee', language: 'de', root_admin: false, use_totp: false, servers: 0, subuser_of: 0, roles: [] },
];
const userPool = { enabled: true, unlimited: false, defaults: { memory: 4096, disk: 10240, cpu: 200, allocations: 5, backups: 5 }, limits: { memory: 4096, disk: 10240, cpu: 200, allocations: 5, backups: 5 }, used: { memory: 1024, disk: 2048, cpu: 50, allocations: 2, backups: 1 }, own: { memory: null, disk: null, cpu: null, allocations: null, backups: null } };
api.get('/admin/users/meta', (req, res) => res.json({ languages: { en: 'English', de: 'Deutsch' }, locale: 'en' }));
api.get('/admin/users', (req, res) => { const q = String(req.query.search || '').toLowerCase(); const list = adminUsers.filter((u) => !q || u.email.includes(q) || u.username.includes(q)); res.json({ users: list.map((u) => ({ ...u, gravatar: 'https://www.gravatar.com/avatar/0?d=identicon&s=100' })), pagination: { total: list.length, count: list.length, per_page: 50, current_page: 1, total_pages: 1 } }); });
api.get('/admin/users/:id', (req, res) => { const u = adminUsers.find((x) => x.id === Number(req.params.id)); return u ? res.json({ user: { id: u.id, email: u.email, username: u.username, name_first: u.name_first, name_last: u.name_last, language: u.language, root_admin: u.root_admin }, languages: { en: 'English', de: 'Deutsch' }, can_change: true, roles: adminRoles.map((r) => ({ id: r.id, name: r.name, description: r.description, color: r.color, assigned: u.roles.some((x) => x.id === r.id), assignable: true })), pool: { ...userPool, own: { ...userPool.own, ...(u.pool || {}) } } }) : res.status(404).json({ errors: [{ detail: 'Not found' }] }); });
api.post('/admin/users', (req, res) => { const u = { id: adminUsers.length + 10, ...req.body, use_totp: false, servers: 0, subuser_of: 0, roles: [] }; adminUsers.push(u); res.status(201).json(u); });
api.patch('/admin/users/:id/pool', (req, res) => { const u = adminUsers.find((x) => x.id === Number(req.params.id)); u.pool = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [k, v === '' || v === null ? null : Number(v)])); res.json({ ...userPool, own: { ...userPool.own, ...u.pool } }); });
api.put('/admin/users/:id/roles', (req, res) => { const u = adminUsers.find((x) => x.id === Number(req.params.id)); u.roles = adminRoles.filter((r) => (req.body.roles || []).includes(r.id)).map((r) => ({ id: r.id, name: r.name, color: r.color })); res.json({ roles: req.body.roles || [] }); });
api.patch('/admin/users/:id', (req, res) => { const u = adminUsers.find((x) => x.id === Number(req.params.id)); Object.assign(u, { ...req.body, password: undefined }); res.json(u); });
api.delete('/admin/users/:id', (req, res) => { adminUsers = adminUsers.filter((x) => x.id !== Number(req.params.id)); res.status(204).end(); });


let appKeys = [{ identifier: 'ptla_abc123XYZ', key: 'ptla_abc123XYZ' + 'x'.repeat(32), memo: 'Billing integration', last_used_at: new Date(Date.now() - 3600e3).toISOString(), created_at: new Date(Date.now() - 864e5 * 9).toISOString(), user: { id: 1, username: 'preview' } }];
api.get('/admin/application-keys', (req, res) => res.json({ keys: appKeys }));
api.get('/admin/application-keys/resources', (req, res) => res.json({ resources: ['allocations', 'database_hosts', 'eggs', 'locations', 'nests', 'nodes', 'server_databases', 'servers', 'users'], levels: { none: 0, read: 1, write: 3 } }));
api.post('/admin/application-keys', (req, res) => { appKeys.push({ identifier: 'ptla_new' + appKeys.length, key: 'ptla_new' + appKeys.length + 'y'.repeat(32), memo: req.body.memo, last_used_at: null, created_at: new Date().toISOString(), user: { id: 1, username: 'preview' } }); res.status(201).json({ identifier: 'x' }); });
api.delete('/admin/application-keys/:id', (req, res) => { appKeys = appKeys.filter((k) => k.identifier !== req.params.id); res.status(204).end(); });
let adminExts = [
    { id: 'offline-motd', name: 'Offline MOTD', version: '1.0.0', author: 'Stratosphere', description: 'Shows a message when a server is off.', broken: false, enabled: true, running: true, failed: false, last_error: null, last_error_at: null, has_settings: true },
    { id: 'broken-one', name: 'Broken', version: '0.1.0', author: null, description: 'Does not work.', broken: false, enabled: true, running: false, failed: true, last_error: 'RuntimeException: it fell over', last_error_at: new Date(Date.now() - 600e3).toISOString(), has_settings: false },
];
let extValues = { message: 'This server is asleep, join to wake it.', loud: false, mode: 'a' };
api.get('/admin/extensions', (req, res) => res.json({ safe_mode: false, extensions: adminExts }));
api.get('/admin/extensions/:id/settings', (req, res) => res.json({ id: req.params.id, name: 'Offline MOTD', version: '1.0.0', author: 'Stratosphere', homepage: 'https://example.com', enabled: true, settings: [{ key: 'message', type: 'textarea', label: 'Message', help: 'Shown in the server list.', rows: 3, options: null, saved: null }, { key: 'loud', type: 'boolean', label: 'Loud', options: null, saved: null }, { key: 'mode', type: 'select', label: 'Mode', options: { a: 'A', b: 'B' }, saved: null }, { key: 'token', type: 'password', label: 'Token', options: null, saved: true }], values: { ...extValues, token: '' } }));
api.patch('/admin/extensions/:id/settings', (req, res) => { extValues = { ...extValues, ...req.body.settings }; res.json({ saved: true }); });
api.post('/admin/extensions/:id/toggle', (req, res) => { const e = adminExts.find((x) => x.id === req.params.id); e.enabled = !e.enabled; res.json({ enabled: e.enabled }); });
api.post('/admin/extensions/:id/clear-error', (req, res) => { const e = adminExts.find((x) => x.id === req.params.id); e.last_error = null; res.status(204).end(); });
const upBackups = [{ name: 'panel-backup-2026-10-18-1658.tar.gz', size: 74e6, created: Math.floor(Date.now() / 1000) - 86400 }, { name: 'panel-backup-2026-10-10-0900-before.tar.gz', size: 73e6, created: Math.floor(Date.now() / 1000) - 864000 }];
api.get('/admin/updates', (req, res) => res.json({ installed: true, status: { action: 'panel', finished_at: new Date(Date.now() - 864e5).toISOString(), results: [{ name: 'panel', status: 'updated' }] }, pending: false, backups: upBackups, wings_latest: 'v1.12.0', node_count: 2, tar_url: 'https://example.com/panel.tar.gz', tar_nightly_url: 'https://example.com/nightly.tar.gz' }));
api.get('/admin/updates/status', (req, res) => res.json({ pending: false, status: { action: 'panel', finished_at: new Date(Date.now() - 864e5).toISOString(), results: [] }, backups: upBackups }));
api.post('/admin/updates', (req, res) => res.status(202).json({ requested: req.body.action }));
api.get('/admin/ui-update', (req, res) => res.json({ update: null }));


const setStore = {
    general: { name: 'Stratosphere', two_factor: 0, locale: 'en', languages: { en: 'English', de: 'Deutsch' } },
    advanced: { timeout: 30, connect_timeout: 10 },
    mail: { disabled: false, host: 'smtp.example.com', port: 587, encryption: 'tls', username: 'koko', password_saved: true, from_address: 'no-reply@example.com', from_name: 'Stratosphere' },
    trash: { enabled: false, retention_days: 30, items: 3, bytes: 5242880 },
    pools: { enabled: true, defaults: { memory: 4096, disk: 10240, cpu: 200, allocations: 5, backups: 5 }, own: 2 },
    curseforge: { enabled: true, from_environment: false },
    authentication: { captcha: 'turnstile', recaptcha_site_key: '', recaptcha_shipped: false, turnstile_site_key: '0x4AAA', turnstile_secret_saved: true, passkeys: true, registration: false, registration_password: true, providers: 1 },
    branding: { favicon: null, console_prompt: 'container@stratosphere~', announcements: [{ id: 'a1', title: 'Maintenance', message: 'The panel restarts at midnight.', type: 'warning', enabled: true, dismissible: true, link_label: '', link_url: '' }], links: [{ label: 'Status', url: 'https://status.example.com', location: 'footer', new_tab: true }], locations: { sidebar: 'Server sidebar', navbar: 'Top bar', footer: 'Footer' }, types: ['info', 'success', 'warning', 'danger'] },
};
['general', 'advanced', 'mail', 'trash', 'pools', 'curseforge', 'authentication', 'branding'].forEach((key) => {
    api.get('/admin/settings/' + key, (req, res) => res.json(setStore[key]));
    const save = (req, res) => { if (key === 'pools') { const { enabled, ...d } = req.body; setStore.pools = { ...setStore.pools, enabled: !!enabled, defaults: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)])) }; } else if (key === 'trash') { setStore.trash = { ...setStore.trash, enabled: !!req.body.enabled, retention_days: Number(req.body.retention_days) }; } else if (key === 'curseforge') { return res.json({ ok: true, message: 'The key was saved. It works.', ...setStore.curseforge }); } else if (key === 'authentication') { return res.json({ saved: true }); } res.json(setStore[key]); };
    api.patch('/admin/settings/' + key, save);
});
api.post('/admin/settings/branding', (req, res) => res.json(setStore.branding));
api.post('/admin/settings/mail/test', (req, res) => res.json({ sent_to: 'preview@example.com' }));
api.post('/admin/settings/curseforge/test', (req, res) => res.json({ ok: true, message: 'The key works.' }));
const providerTypes = [{ type: 'github', name: 'GitHub', docs: null }, { type: 'google', name: 'Google', docs: null }, { type: 'oauth2', name: 'Other OAuth 2 service', docs: null }];
const providerForm = (type, exists) => ({ id: exists ? 1 : null, type, preset: { name: type === 'github' ? 'GitHub' : 'OAuth 2', docs: null }, name: type === 'github' ? 'GitHub' : 'OAuth 2', key: exists || type !== 'oauth2' ? type : '', client_id: exists ? 'the-id' : '', secret_saved: !!exists, scopes: '', default_scopes: 'read:user user:email', enabled: true, allow_signup: true, generic: type === 'oauth2', authorize_url: '', token_url: '', userinfo_url: '', mapping: { id: 'sub', email: 'email', username: 'preferred_username', name: 'name', email_verified: 'email_verified' }, callback: 'http://localhost:4000/auth/oauth/' + (type || 'key') + '/callback' });
api.get('/admin/settings/providers', (req, res) => res.json({ providers: [{ id: 1, name: 'GitHub', key: 'github', type: 'github', enabled: true, allow_signup: true, accounts: 4 }], types: providerTypes }));
api.get('/admin/settings/providers/blank', (req, res) => res.json(providerForm(String(req.query.type || 'github'), false)));
api.get('/admin/settings/providers/:id', (req, res) => res.json(providerForm('github', true)));
api.patch('/admin/settings/providers/:id', (req, res) => res.json({ ...providerForm('github', true), name: req.body.name }));
api.get('/admin/settings/domains', (req, res) => res.json({ custom_enabled: true, zones: [{ id: 1, name: 'Main domain', domain: 'example.com', type: 'cloudflare', enabled: true, names: 3 }], types: [{ type: 'cloudflare', name: 'Cloudflare' }], target_ip: '203.0.113.5' }));
const zoneForm = (exists) => ({ id: exists ? 1 : null, type: 'cloudflare', provider: 'Cloudflare', help: 'The records are made without the Cloudflare proxy (grey cloud), because Minecraft is not web traffic.', name: exists ? 'Main domain' : '', domain: exists ? 'example.com' : '', ttl: 120, enabled: true, names: exists ? 3 : 0, fields: [{ key: 'api_token', label: 'API token', secret: true, required: true, help: 'Create one at dash.cloudflare.com.', value: '', saved: !!exists }, { key: 'zone_id', label: 'Zone ID', secret: false, required: false, help: 'Leave empty: it is found by the name of the domain.', value: '', saved: null }] });
api.get('/admin/settings/domains/blank', (req, res) => res.json(zoneForm(false)));
api.get('/admin/settings/domains/zones/:id', (req, res) => res.json(zoneForm(true)));
api.post('/admin/settings/domains/zones/:id/test', (req, res) => res.json({ ok: true, message: 'Access works: found the zone.' }));
const certRow = { id: 1, name: 'Main', domains: ['panel.example.com', '*.example.com'], is_default: true, enabled: true, source: 'letsencrypt', acme_method: 'dns', renew_error: null, no_chain: false, expired: false, expiring: false, days_left: 60, not_after: new Date(Date.now() + 60 * 864e5).toISOString() };
api.get('/admin/settings/certificates', (req, res) => res.json({ certificates: [certRow, { ...certRow, id: 2, name: 'Soon', is_default: false, source: null, expiring: true, days_left: 5 }], token_configured: true, edge: { at: new Date().toISOString(), recent: true, ip: '127.0.0.1', count: 2, http: false }, acme: { enabled: true, email: 'admin@example.com', staging: false }, domains: [{ id: 1, domain: 'play.example.org', server: 'My server', status: null, message: null, covered_by: null, expires_at: null, can_request: true, can_request_dns: true, reason: null, dns: null }, { id: 2, domain: 'mc.example.net', server: 'Other', status: 'issued', message: null, covered_by: 'mc.example.net (Let\'s Encrypt)', expires_at: null, can_request: false, can_request_dns: false, reason: null, dns: null }, { id: 3, domain: 'broken.example.com', server: 'Other', status: 'failed', message: 'The domain does not point at this panel yet.', covered_by: null, expires_at: null, can_request: true, can_request_dns: true, reason: null, dns: null }] }));
api.post('/admin/settings/certificates/letsencrypt/issue', (req, res, next) => { req.method = 'GET'; req.url = '/admin/settings/certificates'; api.handle(req, res, next); });
api.post('/admin/settings/certificates/:id/renew', (req, res, next) => { req.method = 'GET'; req.url = '/admin/settings/certificates'; api.handle(req, res, next); });
api.get('/admin/settings/certificates/:id', (req, res) => res.json({ ...certRow, issuer: "Let's Encrypt R11", not_before: new Date().toISOString(), fingerprint: 'AB:CD:EF:01:23' }));


const mockNest = { id: 1, uuid: '3c1c0f2e-aaaa-bbbb-cccc-000000000001', name: 'Minecraft', author: 'support@example.com', description: 'Minecraft - the classic game from Mojang.', servers: 2, eggs: [{ id: 1, name: 'Paper', author: 'support@example.com', description: 'High performance Spigot fork.', servers: 2 }, { id: 2, name: 'Forge', author: 'support@example.com', description: 'Forge Minecraft.', servers: 0 }] };
api.get('/admin/nests', (req, res) => res.json({ nests: [{ id: 1, name: 'Minecraft', author: 'support@example.com', description: mockNest.description, eggs: 2, servers: 2 }] }));
api.get('/admin/nests/lookup', (req, res) => res.json({ nests: [{ id: 1, name: 'Minecraft', author: 'support@example.com', eggs: mockNest.eggs.map(({ id, name, author }) => ({ id, name, author })) }] }));
api.get('/admin/nests/:id', (req, res) => res.json(mockNest));
const mockEgg = { id: 1, uuid: 'e1e1e1e1-0000-0000-0000-000000000001', author: 'support@example.com', name: 'Paper', description: 'High performance Spigot fork.', nest: { id: 1, name: 'Minecraft' }, siblings: [{ id: 2, name: 'Forge', author: 'support@example.com' }], docker_images: 'Java 21|ghcr.io/example/java:21\nghcr.io/example/java:17', force_outgoing_ip: false, startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', features: ['eula', 'java_version'], config_from: null, config_stop: 'stop', config_logs: '{\n    "custom": false\n}', config_files: '{\n    "server.properties": {\n        "parser": "properties"\n    }\n}', config_startup: '{\n    "done": ")! For help, type "\n}' };
api.get('/admin/eggs/:id', (req, res) => res.json(mockEgg));
api.get('/admin/eggs/:id/variables', (req, res) => res.json({ id: 1, name: 'Paper', nest: { id: 1, name: 'Minecraft' }, variables: [{ id: 1, name: 'Server Jar File', description: 'The name of the server jarfile to run the server with.', env_variable: 'SERVER_JARFILE', default_value: 'server.jar', user_viewable: true, user_editable: true, rules: 'required|regex:/^([\\w\\d._-]+)(\\.jar)$/' }, { id: 2, name: 'Minecraft Version', description: '', env_variable: 'MINECRAFT_VERSION', default_value: 'latest', user_viewable: true, user_editable: false, rules: 'nullable|string|max:20' }] }));
api.get('/admin/eggs/:id/script', (req, res) => res.json({ id: 1, name: 'Paper', nest: { id: 1, name: 'Minecraft' }, script_install: '#!/bin/ash\ncd /mnt/server\ncurl -o server.jar https://example.com/paper.jar\n', script_container: 'ghcr.io/example/installers:alpine', script_entry: 'ash', script_is_privileged: true, copy_script_from: null, copying_from: null, copy_options: [{ id: 2, name: 'Forge' }], relied_on_by: [] }));


const mockNodeInfo = (n) => ({ id: n.id, uuid: 'n' + n.id, name: n.name, description: 'A node', location: { id: 1, short: 'eu', long: 'Europe' }, location_id: 1, public: true, fqdn: n.fqdn, scheme: 'https', behind_proxy: false, maintenance_mode: n.id === 2, cpu_burst_enabled: true, cpu_burst_percent: 100, memory: 32768, memory_overallocate: 0, disk: 512000, disk_overallocate: 0, upload_size: 100, daemonListen: 8080, daemonSFTP: 2022, daemonBase: '/var/lib/pterodactyl/volumes', servers: n.servers, usage: { memory: { value: 20480, max: 32768, percent: 62.5, level: 'ok' }, disk: { value: 400000, max: 512000, percent: 78.1, level: 'warning' } }, wings_latest: '1.12.0' });
const mockNodes = [{ id: 1, name: 'Frankfurt 1', fqdn: 'fra1.example.com', servers: 5 }, { id: 2, name: 'Helsinki 1', fqdn: 'hel1.example.com', servers: 0 }];
api.get('/admin/nodes', (req, res) => res.json({ nodes: mockNodes.map((n) => ({ id: n.id, name: n.name, location: 'eu', memory: 32768, disk: 512000, servers: n.servers, secure: true, public: true, maintenance: n.id === 2 })), pagination: { total: 2, count: 2, per_page: 25, current_page: 1, total_pages: 1 }, wings_latest: '1.12.0' }));
api.get('/admin/nodes/form', (req, res) => res.json({ locations: [{ id: 1, short: 'eu', long: 'Europe' }, { id: 2, short: 'us', long: 'United States' }], secure: false }));
api.get('/admin/nodes/:id', (req, res) => res.json(mockNodeInfo(mockNodes.find((n) => n.id === Number(req.params.id)) || mockNodes[0])));
api.get('/admin/nodes/:id/system-information', (req, res) => (Number(req.params.id) === 2 ? res.json({ online: false, error: 'Could not establish a connection to the machine running this server.' }) : res.json({ online: true, version: 'v1.11.9', system: { type: 'Linux', arch: 'amd64', release: '6.8.0', cpus: 16 } })));
api.get('/admin/nodes/:id/configuration', (req, res) => res.json({ yaml: 'debug: false\nuuid: n1\ntoken_id: abcdef\ntoken: ********\napi:\n  host: 0.0.0.0\n  port: 8080\n', panel_url: 'http://localhost:4000', insecure: true }));
api.post('/admin/nodes/:id/configuration/token', (req, res) => res.json({ node: 1, token: 'ptla_abc123def456' }));
const mockAllocs = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, ip: '203.0.113.5', ip_alias: i === 0 ? 'play.example.com' : null, port: 25565 + i, server: i < 2 ? { id: 1, name: 'My server' } : null }));
api.get('/admin/nodes/:id/allocations', (req, res) => res.json({ allocations: mockAllocs, pagination: { total: 6, count: 6, per_page: 50, current_page: 1, total_pages: 1 }, ips: ['203.0.113.5'] }));
api.get('/admin/nodes/:id/servers', (req, res) => res.json({ servers: [{ id: 1, uuid_short: '7f3c1d52', name: 'My server', owner: { id: 1, username: 'preview' }, nest: 'Minecraft', egg: 'Paper' }], pagination: { total: 1, count: 1, per_page: 25, current_page: 1, total_pages: 1 } }));
api.get('/admin/nodes/:id/certificate', (req, res) => res.json({ node: { id: 1, fqdn: 'fra1.example.com', scheme: 'https', port: 8080, certificate_id: null, certificate_auto: true, pushed_at: new Date(Date.now() - 3600e3).toISOString(), error: null }, certificates: [{ id: 1, name: 'Wildcard', domains: ['*.example.com'], covers: true }], candidate: { id: 1, name: 'Wildcard' }, assigned: { id: 1, name: 'Wildcard', fingerprint: 'AB:CD' }, live: { present: true, certificate: { fingerprint: 'AB:CD', names: ['*.example.com'], source: 'pushed', not_after: new Date(Date.now() + 40 * 864e5).toISOString(), not_before: new Date().toISOString() } } }));


const mockServer = (id) => ({ id, uuid: '7f3c1d52-9a1e-4b7c-8d2f-1c5e6a9b0d11', uuid_short: '7f3c1d52', external_id: null, name: 'My server', description: 'A test server', state: id === 2 ? 'installing' : 'active', cpu: 200, threads: null, memory: 4096, swap: 0, disk: 10240, io: 500, oom_disabled: false, database_limit: 2, allocation_limit: 1, backup_limit: 3, nest: { id: 1, name: 'Minecraft' }, egg: { id: 1, name: 'Paper' }, owner: { id: 1, username: 'preview', email: 'preview@example.com', name_first: 'Pre', name_last: 'View', gravatar: 'https://www.gravatar.com/avatar/0?d=identicon' }, node: { id: 1, name: 'Frankfurt 1' }, allocation: { ip: '203.0.113.5', alias: 'play.example.com', port: 25565, has_alias: true } });
const mockNests = [{ id: 1, name: 'Minecraft', eggs: [{ id: 1, uuid: 'e1', name: 'Paper', docker_images: { 'Java 21': 'ghcr.io/example/java:21', 'Java 17': 'ghcr.io/example/java:17' }, startup: 'java -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', variables: [{ id: 1, name: 'Server Jar File', description: 'The jar to run.', env_variable: 'SERVER_JARFILE', default_value: 'server.jar', rules: 'required|string', required: true }] }] }];
api.get('/admin/servers', (req, res) => res.json({ servers: [{ ...mockServer(1), connection: 'play.example.com:25565', state: 'active' }, { ...mockServer(2), name: 'Installing one', connection: 'play.example.com:25566' }, { ...mockServer(3), name: 'Paused', state: 'suspended', connection: 'play.example.com:25567' }], pagination: { total: 3, count: 3, per_page: 25, current_page: 1, total_pages: 1 } }));
api.get('/admin/servers/form', (req, res) => res.json({ locations: [{ id: 1, short: 'eu', long: 'Europe', nodes: [{ id: 1, name: 'Frankfurt 1' }] }], nests: mockNests }));
api.get('/admin/lookups/people', (req, res) => res.json({ people: [{ id: 1, username: 'preview', email: 'preview@example.com', name_first: 'Pre', name_last: 'View', gravatar: 'https://www.gravatar.com/avatar/0?d=identicon' }] }));
api.get('/admin/nodes/:id/free-allocations', (req, res) => res.json({ allocations: [{ id: 11, text: 'play.example.com:25570' }, { id: 12, text: 'play.example.com:25571' }, { id: 13, text: 'play.example.com:25572' }] }));
api.get('/admin/servers/:id', (req, res) => res.json(mockServer(Number(req.params.id))));
api.get('/admin/servers/:id/build', (req, res) => res.json({ id: 1, name: 'My server', cpu: 200, threads: '', memory: 4096, swap: 0, disk: 10240, io: 500, oom_disabled: false, database_limit: 2, allocation_limit: 1, backup_limit: 3, allocation_id: 1, assigned: [{ id: 1, text: 'play.example.com:25565' }], unassigned: [{ id: 11, text: 'play.example.com:25570' }, { id: 12, text: 'play.example.com:25571' }] }));
api.get('/admin/servers/:id/startup', (req, res) => res.json({ id: 1, name: 'My server', startup: 'java -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}', image: 'ghcr.io/example/java:21', skip_scripts: false, nest_id: 1, egg_id: 1, environment: { SERVER_JARFILE: 'paper.jar' }, nests: mockNests }));
api.get('/admin/servers/:id/databases', (req, res) => res.json({ id: 1, name: 'My server', uuid_short: '7f3c1d52', databases: [{ id: 1, database: 's1_world', username: 'u1_abc', remote: '%', host: 'db1.example.com:3306', max_connections: null }], hosts: [{ id: 1, name: 'Local MariaDB' }] }));
api.get('/admin/servers/:id/mounts', (req, res) => res.json({ id: 1, name: 'My server', mounts: [{ id: 1, name: 'Shared worlds', source: '/srv/worlds', target: '/worlds', mounted: true }, { id: 2, name: 'Plugins', source: '/srv/plugins', target: '/plugins', mounted: false }] }));
api.get('/admin/servers/:id/domains', (req, res) => res.json({ id: 1, name: 'My server', enabled: true, target_ip: '203.0.113.5', max: 3, allocations: [{ id: 1, text: 'play.example.com:25565', primary: true }, { id: 11, text: 'play.example.com:25570', primary: false }], domains: [{ id: 1, domain: 'play.example.org', leads_to: 'play.example.com:25565', ready: false }] }));
api.get('/admin/servers/:id/manage', (req, res) => res.json({ id: 1, name: 'My server', installed: true, suspended: false, can_reinstall: true, can_transfer: true, node_id: 1, transfer: null, locations: [{ id: 1, short: 'eu', long: 'Europe', nodes: [{ id: 2, name: 'Helsinki 1' }] }] }));

api.post('/self-service', (req, res) => res.status(201).json({ object: 'server', attributes: serverAttrs(), meta: { is_server_owner: true, user_permissions: ['*'] } }));
// The theme editor: kept in memory, a reload shows what was saved.
let themeSaved = { config: null, css: '', attributes: {} };
api.get('/theme', (req, res) => res.json(themeSaved));
api.put('/theme', (req, res) => { themeSaved = { config: req.body.config, css: req.body.css || '', attributes: req.body.attributes || {} }; res.json(themeSaved); });
api.delete('/theme', (req, res) => { themeSaved = { config: null, css: '', attributes: {} }; res.json(themeSaved); });
api.get('/theme/eggs', (req, res) => res.json([{ id: 1, name: 'Minecraft: Java Edition', nest: 'Minecraft' }, { id: 2, name: 'Bungeecord', nest: 'Minecraft' }]));
const brandingState = { favicon: null, announcements: [{ id: 'a1', title: 'Maintenance tonight', message: 'The Frankfurt node restarts at 22:00 UTC.', type: 'warning', enabled: true, dismissible: true, link_label: '', link_url: '', where: ['dashboard'], eggs: [], software: [], nodes: ['Frankfurt-1'] }, { id: 'a2', title: '', message: 'Welcome to Stratosphere, read the rules before you start.', type: 'info', enabled: true, dismissible: false, link_label: '', link_url: '', where: ['dashboard', 'server'], eggs: [], software: [], nodes: [] }, { id: 'a3', title: 'New: Paper 1.21', message: 'Update your Paper servers to the newest build.', type: 'success', enabled: false, dismissible: true, link_label: 'Versions', link_url: '/', where: ['server'], eggs: [1], software: ['PAPER'], nodes: [] }], links: [{ label: 'Discord', url: 'https://discord.gg/example', location: 'navbar', new_tab: true }] };
brandingState.link_cards = [];
brandingState.seo = { title: '', description: '', share_image: '', theme_color: '', app_name: '', app_short_name: '', index: false };
const brandingBody = () => ({ ...brandingState, locations: { sidebar: 'Server sidebar', navbar: 'Top bar', footer: 'Footer' }, types: ['info', 'success', 'warning', 'danger'] });
api.get('/theme/branding', (req, res) => res.json(brandingBody()));
api.put('/theme/branding', (req, res) => { if (req.body.announcements) brandingState.announcements = req.body.announcements; if (req.body.links) brandingState.links = req.body.links; if (req.body.link_cards) brandingState.link_cards = req.body.link_cards; if (req.body.seo) brandingState.seo = { ...brandingState.seo, ...req.body.seo }; res.json(brandingBody()); });
api.post('/theme/branding/favicon', (req, res) => res.json(brandingBody()));
api.delete('/theme/branding/favicon', (req, res) => res.json(brandingBody()));
let themePresets = [];
api.get('/theme/nodes', (req, res) => res.json([{ id: 1, name: 'Frankfurt-1' }, { id: 2, name: 'Singapore-1' }, { id: 3, name: 'Dallas-1' }]));
api.get('/theme/presets', (req, res) => res.json(themePresets));
api.post('/theme/presets', (req, res) => {
    const { id, name, config } = req.body;
    const entry = { id: id || Math.random().toString(36).slice(2, 10).padEnd(8, 'x'), name, config: { ...config, preset: null } };
    themePresets = id ? themePresets.map((p) => (p.id === id ? entry : p)) : [...themePresets, entry];
    res.json(themePresets);
});
api.put('/theme/presets/:id', (req, res) => { themePresets = themePresets.map((p) => (p.id === req.params.id ? { ...p, name: req.body.name } : p)); res.json(themePresets); });
api.delete('/theme/presets/:id', (req, res) => { themePresets = themePresets.filter((p) => p.id !== req.params.id); res.json(themePresets); });
api.post('/theme/background', (req, res) => res.json({ url: '/branding/background-demo.svg' }));
api.get('/palette', (req, res) => res.json({ object: 'palette', attributes: { admin: [
    { id: 'admin:0', label: 'Overview', url: '/admin', kind: 'page', words: 'admin home' },
    { id: 'admin:1', label: 'Servers', url: '/admin/servers', kind: 'page', words: 'list' },
    { id: 'admin:2', label: 'Updates', url: '/admin/updates', kind: 'page', words: 'update upgrade' },
    { id: 'admin:3', label: 'Update the panel', url: '/admin/updates', kind: 'action', words: 'update upgrade install' },
    { id: 'admin:4', label: 'Restore a panel backup', url: '/admin/updates', kind: 'action', words: 'rollback backups' },
    { id: 'admin:5', label: 'Create a server', url: '/admin/servers/new', kind: 'action', words: 'new add' },
] } }));
api.get('/dashboard/players', (req, res) => {
    const out = {};
    String(req.query.servers || '').split(',').forEach((u, i) => { if (u) out[u] = { online: (i * 3 + 2) % 9, max: 20 }; });
    res.json({ object: 'player_counts', attributes: out });
});
api.get('/permissions', (req, res) => res.json({ object: 'system_permissions', attributes: { permissions: {} } }));
api.get('/account/activity', (req, res) => res.json(paginated([])));
api.get('/account/api-keys', (req, res) => res.json({ object: 'list', data: [] }));
api.get('/account/ssh-keys', (req, res) => res.json({ object: 'list', data: [] }));
api.get('/servers/:id', (req, res) => res.json({ object: 'server', attributes: serverAttrs(), meta: { is_server_owner: true, user_permissions: ['*'] } }));
api.get('/servers/:id/websocket', (req, res) => res.json({ data: { token: 'preview-token', socket: `ws://localhost:${PORT}/ws` } }));
api.get('/servers/:id/resources', (req, res) => res.json({ object: 'stats', attributes: { current_state: /^c\d/.test(req.params.id) ? 'running' : state.status, is_suspended: false, resources: { memory_bytes: 0, cpu_absolute: 0, disk_bytes: 201457664, network_rx_bytes: 0, network_tx_bytes: 0, uptime: 0 } } }));
api.get('/servers/:id/activity', (req, res) => res.json(paginated([])));

files['/mods'] = [['sodium-fabric-0.5.0.jar', true, 1200000, 'application/jar'], ['lithium-fabric-0.14.jar', true, 900000, 'application/jar']];
files['/plugins'] = [['WorldEdit', false]];
files['/world'] = [['level.dat', true, 2048, 'application/octet-stream'], ['region', false], ['dimensions', false]];
files['/world/dimensions'] = [['minecraft', false]];
files['/world/dimensions/minecraft'] = [['overworld', false], ['the_end', false], ['the_nether', false]];
api.get('/servers/:id/files/list', (req, res) => res.json({ object: 'list', data: (files[req.query.directory] || (['/', ''].includes(String(req.query.directory)) ? files['/'] : [])).map(fileAttrs) }));
const mockPlayer = {
    ender: [
        { slot: 0, id: 'minecraft:shulker_box', count: 1 },
        { slot: 1, id: 'minecraft:netherite_ingot', count: 9 },
        { slot: 2, id: 'minecraft:enchanted_golden_apple', count: 4 },
        { slot: 3, id: 'minecraft:obsidian', count: 64 },
        { slot: 9, id: 'minecraft:totem_of_undying', count: 1 },
        { slot: 10, id: 'minecraft:emerald_block', count: 20 },
        { slot: 11, id: 'minecraft:netherrack', count: 64 },
        { slot: 26, id: 'minecraft:dragon_egg', count: 1 },
    ],
    // What is inside the shulker boxes, by where they lie and their slot.
    boxes: {
        'inv:6': [
            { slot: 0, id: 'minecraft:diamond', count: 32 },
            { slot: 1, id: 'minecraft:netherite_ingot', count: 4 },
            { slot: 2, id: 'minecraft:enchanted_golden_apple', count: 2 },
            { slot: 9, id: 'minecraft:elytra', count: 1, damage: 100, maxDamage: 432, enchants: { unbreaking: 3, mending: 1 } },
            { slot: 10, id: 'minecraft:firework_rocket', count: 64 },
            { slot: 26, id: 'minecraft:totem_of_undying', count: 1 },
        ],
        'ender:0': [{ slot: 4, id: 'minecraft:tnt', count: 16 }],
    },
    health: 14.5, food: 12, saturation: 5.4, level: 27, mode: 'survival',
    items: [
        { slot: 6, id: 'minecraft:red_shulker_box', count: 1 },
        { slot: 13, id: 'minecraft:iron_helmet', count: 1, trim: { material: 'gold', pattern: 'coast' } },
        { slot: 14, id: 'minecraft:diamond_chestplate', count: 1, damage: 40, maxDamage: 528, trim: { material: 'netherite', pattern: 'rib' }, enchants: { protection: 4 } },
        { slot: 15, id: 'minecraft:iron_leggings', count: 1, trim: { material: 'iron', pattern: 'sentry' } },
        { slot: 16, id: 'minecraft:golden_boots', count: 1, trim: { material: 'amethyst', pattern: 'wild' } },
        { slot: 17, id: 'minecraft:chainmail_helmet', count: 1, trim: { material: 'redstone', pattern: 'eye' } },
        { slot: 18, id: 'minecraft:diamond_boots', count: 1, trim: { material: 'diamond', pattern: 'snout' } },
        { slot: 19, id: 'minecraft:iron_boots', count: 1 },
        { slot: 0, id: 'minecraft:diamond_sword', count: 1, damage: 120, maxDamage: 1561, name: 'Excalibur', enchants: { sharpness: 5, fire_aspect: 2 } },
        { slot: 1, id: 'minecraft:diamond_pickaxe', count: 1, damage: 900, maxDamage: 1561, enchants: { efficiency: 5, unbreaking: 3 } },
        { slot: 2, id: 'minecraft:cooked_beef', count: 64 },
        { slot: 3, id: 'minecraft:torch', count: 48 },
        { slot: 4, id: 'minecraft:oak_planks', count: 32 },
        { slot: 5, id: 'minecraft:bow', count: 1, damage: 300, maxDamage: 384, enchants: { power: 4, infinity: 1 } },
        { slot: 8, id: 'minecraft:ender_pearl', count: 12 },
        { slot: 9, id: 'minecraft:cobblestone', count: 64 },
        { slot: 10, id: 'minecraft:iron_ingot', count: 33 },
        { slot: 11, id: 'minecraft:grass_block', count: 16 },
        { slot: 12, id: 'minecraft:golden_apple', count: 3 },
        { slot: 20, id: 'minecraft:diamond', count: 7 },
        { slot: 13, id: 'minecraft:stone', count: 64 },
        { slot: 14, id: 'minecraft:oak_log', count: 20 },
        { slot: 15, id: 'minecraft:oak_slab', count: 8 },
        { slot: 16, id: 'minecraft:oak_stairs', count: 12 },
        { slot: 17, id: 'minecraft:furnace', count: 1 },
        { slot: 18, id: 'minecraft:oak_leaves', count: 32 },
        { slot: 19, id: 'minecraft:tnt', count: 4 },
        { slot: 21, id: 'minecraft:crafting_table', count: 1 },
        { slot: 22, id: 'minecraft:short_grass', count: 9 },
        { slot: 23, id: 'minecraft:chest', count: 2 },
        { slot: 24, id: 'minecraft:diamond_block', count: 5 },
        { slot: 25, id: 'minecraft:glass', count: 16 },
        { slot: 26, id: 'minecraft:bookshelf', count: 3 },
        { slot: 27, id: 'minecraft:torch', count: 64 },
        { slot: 36, id: 'minecraft:diamond_boots', count: 1, damage: 10, maxDamage: 429, enchants: { protection: 4, feather_falling: 4 } },
        { slot: 37, id: 'minecraft:diamond_leggings', count: 1, damage: 200, maxDamage: 495, enchants: { protection: 4 } },
        { slot: 38, id: 'minecraft:elytra', count: 1, damage: 100, maxDamage: 432 },
        { slot: 39, id: 'minecraft:diamond_helmet', count: 1, damage: 400, maxDamage: 363, enchants: { respiration: 3 } },
        { slot: 40, id: 'minecraft:shield', count: 1, damage: 5, maxDamage: 336 },
    ],
};
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
    '/plugins/BlueMap/webserver.conf': '# The web server\nenabled: true\nwebroot: "bluemap/web"\nport: 8100 # default\nip: "0.0.0.0"\n',
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
api.post('/servers/:id/files/delete', (req, res) => {
    const root = String(req.body.root || '/').replace(/\/+$/, '');
    (req.body.files || []).forEach((name) => {
        delete fileStore[`${root}/${name}`];
        const list = files[root || '/'];
        const at = list ? list.findIndex((f) => f[0] === name) : -1;
        if (at >= 0) list.splice(at, 1);
    });
    res.status(204).end();
});
let mockIcon = null;
// Files the page wrote through the upload (the bytes of the file part), so that reading them again shows the change.
const mockWrites = {};
app.get('/mock-written', (req, res) => res.type('application/octet-stream').send(mockWrites[String(req.query.p)]));
app.get('/mock-game-rules', (req, res) => res.type('application/octet-stream').send(require('node:fs').readFileSync(path.join(__dirname, 'fixtures/game_rules.dat'))));
api.get('/servers/:id/files/download', (req, res) => {
    if (String(req.query.file).endsWith('server-icon.png')) return mockIcon ? res.json({ attributes: { url: '/mock-icon' } }) : res.status(404).json({ errors: [{ detail: 'not found' }] });
    const wanted = '/' + String(req.query.file).replace(/^\/+/, '');
    if (wanted in mockWrites) return res.json({ attributes: { url: `/mock-written?p=${encodeURIComponent(wanted)}` } });
    if (wanted.endsWith('/data/minecraft/game_rules.dat')) return res.json({ attributes: { url: '/mock-game-rules' } });
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
app.get('/mock-world', (req, res) => {
    if (req.query.time !== undefined) { mockWorld.time = Number(req.query.time) % 24000; mockWorld.startedAt = Date.now(); }
    if (req.query.weather) mockWorld.weather = String(req.query.weather);
    if (req.query.frozen !== undefined) mockWorld.frozen = req.query.frozen === '1';
    res.json({ ...mockWorld, now: mockWorldNow() });
});
app.get('/mock-sleep', (req, res) => {
    if (req.query.sleeping !== undefined) { mockSleep.enabled = true; mockSleep.slept_at = req.query.sleeping === '1' ? new Date().toISOString() : null; }
    if (req.query.idle !== undefined) { mockSleep.enabled = true; mockSleep.idle_since = req.query.idle === '1' ? new Date(Date.now() - 4 * 60000).toISOString() : null; }
    if (req.query.wake !== undefined) mockSleep.wake_available = req.query.wake === '1';
    res.json(sleepAttrs());
});
app.get('/mock-missing', (req, res) => res.status(404).end());
const mockUploads = [];
app.get('/mock-uploads', (req, res) => res.json(mockUploads));
app.post('/mock-upload', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
    const boundary = req.body.subarray(0, req.body.indexOf('\r\n')).toString('latin1');
    const headerEnd = req.body.indexOf('\r\n\r\n');
    const tail = req.body.lastIndexOf(Buffer.from(`\r\n${boundary}--`));
    const uploaded = (/filename="([^"]*)"/.exec(req.body.subarray(0, 400).toString('latin1')) || [])[1];
    if (uploaded && headerEnd > 0 && tail > headerEnd) mockWrites[`${String(req.query.directory).replace(/\/+$/, '')}/${uploaded}`] = req.body.subarray(headerEnd + 4, tail);
    mockUploads.push({ directory: req.query.directory, filename: (/filename="([^"]*)"/.exec(req.body.subarray(0, 400).toString('latin1')) || [])[1], bytes: req.body.length });
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
api.get('/servers/:id/domains', (req, res) => res.json({ object: 'list', data: state.domains, meta: { enabled: true, zones: [{ id: 1, domain: 'example.com' }, { id: 2, domain: 'mc-hosting.net' }], target_ip: '203.0.113.10', max: 5 } }));
api.get('/servers/:id/domains/check', (req, res) => { const l = String(req.query.label || ''); const z = Number(req.query.zone_id) === 2 ? 'mc-hosting.net' : 'example.com'; const taken = ['taken', 'survival'].includes(l); res.json({ object: 'domain_check', attributes: { available: !taken, domain: `${l}.${z}`, reason: taken ? 'That name is already taken.' : null } }); });
api.post('/servers/:id/domains', (req, res) => { const d = { id: state.nextId++, managed: req.body.zone_id ? (Number(req.body.zone_id) === 2 ? 'mc-hosting.net' : 'example.com') : null, domain: req.body.zone_id ? `${req.body.label}.${Number(req.body.zone_id) === 2 ? 'mc-hosting.net' : 'example.com'}` : String(req.body.domain).toLowerCase(), allocation_id: req.body.allocation_id, allocation: 'play.example.com:26614', dns_ok: false }; if (state.domains.some((x) => x.domain === d.domain)) return res.status(422).json({ errors: [{ detail: 'That domain is already in use.' }] }); state.domains.push(d); res.status(201).json({ object: 'server_domain', attributes: d }); });
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

// The panel's CurseForge endpoints, answered from made-up data, see preview/curseforge.js. PREVIEW_CURSEFORGE=off turns it off.
const mountCurseForgeImages = require('./curseforge')(api, mockWrites, express);

api.get('/servers/:id/settings/auto-sleep', (req, res) => res.json(sleepAttrs()));
api.put('/servers/:id/settings/auto-sleep', (req, res) => {
    const { enabled, idle_minutes: idle, wake_on_join: wake } = req.body || {};
    if (typeof enabled !== 'boolean' || ![5, 10, 15, 30, 60, 120, 240].includes(idle) || typeof wake !== 'boolean') return res.status(422).json({ errors: [{ code: 'ValidationException', status: '422', detail: 'The selected idle minutes is invalid.' }] });
    Object.assign(mockSleep, { enabled, idle_minutes: idle, wake_on_join: wake });
    if (!enabled) { mockSleep.slept_at = null; mockSleep.idle_since = null; }
    res.json(sleepAttrs());
});

// Sign in methods: the services and passkeys of the account (Account > Providers and Passkeys).
const mockProviders = [
    { key: 'github', name: 'GitHub', type: 'github', enabled: true, linked: true, account: 'octocat', linked_at: now(), last_used_at: now() },
    { key: 'discord', name: 'Discord', type: 'discord', enabled: true, linked: false, account: null, linked_at: null, last_used_at: null },
    { key: 'google', name: 'Google', type: 'google', enabled: true, linked: false, account: null, linked_at: null, last_used_at: null },
];
let mockPasskeys = [{ id: 1, name: 'MacBook (Touch ID)', created_at: now(), last_used_at: now() }];
api.get('/account/providers', (req, res) => res.json({ password_set: true, data: mockProviders }));
api.delete('/account/providers/:key', (req, res) => {
    const row = mockProviders.find((p) => p.key === req.params.key);
    if (row) Object.assign(row, { linked: false, account: null, linked_at: null, last_used_at: null });
    res.status(204).end();
});
api.get('/account/passkeys', (req, res) => res.json({ enabled: true, data: mockPasskeys }));
api.delete('/account/passkeys/:id', (req, res) => {
    mockPasskeys = mockPasskeys.filter((k) => String(k.id) !== req.params.id);
    res.status(204).end();
});

// The trash bin of the server.
let mockTrash = [
    { id: 't1', type: 'directory', name: 'world_old', path: '/', size: null, deleted_by: 'preview', deleted_at: now(), expires_at: new Date(Date.now() + 29 * 864e5).toISOString() },
    { id: 't2', type: 'file', name: 'server.properties', path: '/', size: 1530, deleted_by: 'preview', deleted_at: now(), expires_at: new Date(Date.now() + 3 * 864e5).toISOString() },
    { id: 't3', type: 'schedule', name: 'Nightly restart', path: null, size: null, deleted_by: 'friend', deleted_at: now(), expires_at: new Date(Date.now() + 5 * 36e5).toISOString() },
];
api.get('/servers/:id/trash', (req, res) => res.json({ enabled: true, retention_days: 30, data: mockTrash }));
api.post('/servers/:id/trash/:item/restore', (req, res) => { mockTrash = mockTrash.filter((t) => t.id !== req.params.item); res.json({ restored_to: '/restored' }); });
api.delete('/servers/:id/trash/:item', (req, res) => { mockTrash = mockTrash.filter((t) => t.id !== req.params.item); res.status(204).end(); });
api.delete('/servers/:id/trash', (req, res) => { mockTrash = []; res.status(204).end(); });

// The server importer: a test connection, then the work runs as a job (see the jobs below).
api.post('/servers/:id/files/import/test', (req, res) => {
    if (req.body && req.body.host === 'private.example') return res.status(400).json({ errors: [{ code: 'DisplayException', status: '400', detail: 'That address is on a private network and the node may not connect to it.' }] });
    setTimeout(() => res.json({
        fingerprint: req.body && req.body.protocol === 'sftp' ? 'SHA256:3x0kP9mVq2YtK1c7nWb5e8Fh0yLr4sZaDuJ6oXiGpAQ' : '',
        total: 5,
        entries: [
            { name: 'world', dir: true, size: 0 }, { name: 'plugins', dir: true, size: 0 }, { name: 'logs', dir: true, size: 0 },
            { name: 'server.properties', dir: false, size: 1530 }, { name: 'paper-1.21.1.jar', dir: false, size: 48234500 },
        ],
    }), 600);
});

// Background jobs: they progress with the clock, like on a node.
let jobSeq = 0;
const mockJobs = [
    { id: 'old-1', type: 'compress', title: 'Archive world', status: 'finished', t0: Date.now() - 3600e3, dur: 1, files: 120, done: 120, bytes: 52428800, bytes_total: 52428800, result: { name: 'archive-2026-10-16.tar.gz', directory: '/', size: 31000000 }, finished_at: new Date(Date.now() - 3590e3).toISOString(), failures: [], warnings: [] },
    { id: 'old-2', type: 'import', title: 'Import /srv/mc from old-host.example.com', status: 'interrupted', t0: Date.now() - 86400e3, files: 300, done: 120, bytes: 9e6, bytes_total: 40e6, error: 'The node was restarted while this was running. What was done is kept; run it again to continue (existing files can be skipped).', finished_at: new Date(Date.now() - 86000e3).toISOString(), failures: [], warnings: [] },
];
const jobShape = (j) => ({ id: j.id, server: UUID, type: j.type, title: j.title, status: j.status, params: {}, scanned: j.scanned || 0, folders: j.folders || 0, scan_path: j.scan_path || '', files: j.files || 0, dirs: j.dirs || 0, done: j.done || 0, skipped: j.skipped || 0, failed: j.failed || 0, bytes: j.bytes || 0, bytes_total: j.bytes_total || 0, current: j.current || '', failures: j.failures || [], warnings: j.warnings || [], error: j.error, result: j.result, created_at: new Date(j.t0).toISOString(), finished_at: j.finished_at });
const tickJob = (j) => {
    if (j.status !== 'scanning' && j.status !== 'running') return j;
    if (j.cancelled) { Object.assign(j, { status: 'cancelled', finished_at: now(), current: '' }); return j; }
    const t = (Date.now() - j.t0) / 1000;
    if (j.type === 'import') {
        if (t < 4) return Object.assign(j, { status: 'scanning', scanned: Math.floor(t * 900), folders: Math.floor(t * 70), scan_path: 'world/region' });
        const files = 40; const done = Math.min(files, Math.floor((t - 4) * 2.5)); const total = 75e6;
        Object.assign(j, { status: 'running', files, dirs: 6, done, bytes: Math.floor(total * done / files), bytes_total: total, current: done < files ? `plugins/Plugin${done}.jar` : '', skipped: done > 5 ? 1 : 0, failed: done > 13 ? 1 : 0, failures: done > 13 ? [{ path: 'plugins/Plugin13.jar', error: 'permission denied' }] : [] });
        if (done >= files) Object.assign(j, { status: 'finished', finished_at: now(), current: '' });
    } else if (j.type === 'compress' || j.type === 'decompress') {
        const total = 200e6; const bytes = Math.min(total, Math.floor(t * 25e6));
        Object.assign(j, { status: bytes >= total ? 'finished' : 'running', files: 800, bytes, bytes_total: total, done: Math.floor(800 * bytes / total) });
        if (bytes >= total) Object.assign(j, { finished_at: now(), done: 800, result: j.type === 'compress' ? { name: 'archive-2026-10-16.tar.gz', directory: '/', size: 90e6 } : null });
    } else if (j.type === 'pull') {
        const done = Math.min(j.files, Math.floor(t / 1.2));
        Object.assign(j, { status: done >= j.files ? 'finished' : 'running', done, bytes: done * 2.1e6, current: `mod-${done + 1}.jar` });
        if (done >= j.files) Object.assign(j, { finished_at: now(), current: '' });
    }
    return j;
};
const addJob = (job) => { const j = { id: `job-${++jobSeq}`, status: 'scanning', t0: Date.now(), failures: [], warnings: [], ...job }; mockJobs.unshift(j); return j; };
api.get('/servers/:id/jobs', (req, res) => res.json({ object: 'list', data: mockJobs.map((j) => ({ object: 'server_job', attributes: jobShape(tickJob(j)) })) }));
api.get('/servers/:id/jobs/:job', (req, res) => {
    const j = mockJobs.find((x) => x.id === req.params.job);
    return j ? res.json({ object: 'server_job', attributes: jobShape(tickJob(j)) }) : res.status(404).json({ errors: [{ code: 'NotFoundHttpException', status: '404', detail: 'There is no such job.' }] });
});
api.delete('/servers/:id/jobs/:job', (req, res) => {
    const i = mockJobs.findIndex((x) => x.id === req.params.job);
    if (i < 0) return res.status(404).end();
    if (['scanning', 'running'].includes(mockJobs[i].status)) mockJobs[i].cancelled = true; else mockJobs.splice(i, 1);
    res.status(204).end();
});
api.post('/servers/:id/jobs/import', (req, res) => {
    if (mockJobs.some((j) => j.type === 'import' && ['scanning', 'running'].includes(j.status))) return res.status(400).json({ errors: [{ code: 'DisplayException', status: '400', detail: 'An import is already running for this server.' }] });
    const j = addJob({ type: 'import', title: `Import ${req.body.path || '/'} from ${req.body.host}` });
    res.status(202).json({ object: 'server_job', attributes: jobShape(j) });
});
api.post('/servers/:id/jobs/pull', (req, res) => {
    const files = req.body.files || [];
    const j = addJob({ type: 'pull', title: files.length === 1 ? `Download ${files[0].filename || 'file'}` : `Download ${files.length} files`, files: files.length, status: 'running' });
    res.status(202).json({ object: 'server_job', attributes: jobShape(j) });
});

// Power actions over the API (the buttons of the server list): the state changes a moment later, like on a node.
api.post('/servers/:id/power', (req, res) => {
    const signal = req.body && req.body.signal;
    if (!['start', 'stop', 'restart', 'kill'].includes(signal)) return res.status(422).end();
    if (signal === 'start') { state.status = 'starting'; setTimeout(() => { state.status = 'running'; }, 2500); }
    else if (signal === 'restart') { state.status = 'stopping'; setTimeout(() => { state.status = 'starting'; }, 1500); setTimeout(() => { state.status = 'running'; }, 4000); }
    else { state.status = 'stopping'; setTimeout(() => { state.status = 'offline'; }, 2000); }
    res.status(204).end();
});

// Anything else that mutates: pretend it worked.
api.all('*', (req, res) => (req.method === 'GET' ? res.json({ object: 'list', data: [] }) : res.status(204).end()));
app.use('/api/client', api);
app.get('/locales/locale.json', (req, res) => res.json({}));

const user = { uuid: 'preview-user', username: 'preview', email: 'preview@example.com', root_admin: true, can_access_admin: true, admin_permissions: [], use_totp: false, language: 'en', updated_at: now(), created_at: now() };
const page = (title, guest = false) => `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<script>window.fetch=(function(f){return function(u,o){return f(typeof u==='string'?u.replace('https://api.modrinth.com/v2','/mr'):u,o)}})(window.fetch.bind(window));</script><script>${guest ? '' : `window.PterodactylUser=${JSON.stringify(user)};`}window.SiteConfiguration=${JSON.stringify({ theme: themeSaved.config, name: 'Stratosphere', locale: 'en', recaptcha: { enabled: false, siteKey: '' }, captcha: { provider: 'none', siteKey: '' }, auth: { registration: true, passwordRegistration: true, passkeys: true, providers: [{ key: 'github', name: 'GitHub', type: 'github', signup: true }, { key: 'discord', name: 'Discord', type: 'discord', signup: true }, { key: 'google', name: 'Google', type: 'google', signup: false }] }, branding: { favicon: process.env.PREVIEW_FAVICON || null, announcements: [{ id: 'a1', key: 'a1:1', title: 'Maintenance tonight', message: 'The Frankfurt node restarts at 22:00 UTC.\nServers come back by themselves.', type: 'warning', enabled: true, dismissible: true, link_label: 'Status page', link_url: 'https://status.example.com' }, { id: 'a2', key: 'a2:1', title: '', message: 'Welcome to Stratosphere, read the rules before you start.', type: 'info', enabled: true, dismissible: false, link_label: '', link_url: '' }], links: [{ label: 'Discord', url: 'https://discord.gg/example', location: 'navbar', new_tab: true }, { label: 'Rules', url: '/rules', location: 'sidebar', new_tab: false }, { label: 'Terms', url: '/terms', location: 'footer', new_tab: true }, { label: 'Privacy', url: '/privacy', location: 'footer', new_tab: true }] } })};</script><style>html.dark { background: #0c1017; color-scheme: dark; }</style><style id="stratosphere-custom-theme">${themeSaved.css}</style><script>var marks=${JSON.stringify(themeSaved.attributes || {})};for(var k in marks)document.documentElement.setAttribute(k,marks[k]);</script></head>
<body><div id="modal-portal"></div><div id="app"></div><script src="/assets/bundle.js"></script></body></html>`;

app.use(middleware(webpack(config), { publicPath: '/assets/', writeToDisk: false }));
// A picture for the background of the theme editor, as the panel serves from public/branding.
app.get('/branding/background-demo.svg', (req, res) => res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="900" cy="250" r="180" fill="#fff" opacity=".35"/></svg>'));
app.use('/themes', express.static(path.join(root, 'public/themes')));
app.use('/helper', express.static(path.join(root, 'public/helper')));
app.use('/tools', express.static(path.join(root, 'public/tools')));
// Modrinth is asked through here: the browser pane of the preview can not reach it, this process can. The page is told to
// use it by the script that is put in front of the panel's own.
app.use('/mr', async (req, res) => {
    try {
        const response = await fetch('https://api.modrinth.com/v2' + req.url, { headers: { 'User-Agent': 'stratosphere-preview/1.0' } });
        res.status(response.status).type('json').send(await response.text());
    } catch (e) {
        res.status(502).json({ error: String(e) });
    }
});
mountCurseForgeImages(app);
app.use('/js', express.static(path.join(root, 'public/js')));
app.use('/favicons', express.static(path.join(root, 'public/favicons')));
app.get('*', (req, res) => res.send(page('Panel preview', req.path.startsWith('/auth'))));

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
    '[19:40:02] [Server thread/ERROR]: java.lang.OutOfMemoryError: Java heap space',
    '[19:40:03] [Server thread/WARN]: Can\'t keep up! Is the server overloaded? Running 5123ms or 102 ticks behind',
];
const startup = ['[17:04:11] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9', '[17:04:13] [main/INFO]: Preparing spawn area: 100%', '[17:04:14] [Server thread/INFO]: Done (3.412s)! For help, type "help"'];
wss.on('connection', (ws) => {
    const send = (event, ...args) => ws.readyState === 1 && ws.send(JSON.stringify({ event, args }));
    let uptime = 0, rx = 0, tx = 0, timer, burstUsec = 0, burstTick = 0;
    const stats = () => {
        const on = state.status === 'running';
        if (on) { uptime += 1000; rx += Math.random() * 4000; tx += Math.random() * 9000; burstTick += 1; if (burstTick % 24 > 14) burstUsec += 40000 + Math.random() * 30000; }
        send('stats', JSON.stringify({ memory_bytes: on ? 1.4e9 + Math.random() * 2e8 : 0, memory_limit_bytes: 6.4e9, cpu_absolute: on ? 20 + Math.random() * 50 : 0, network: { rx_bytes: rx, tx_bytes: tx }, state: state.status, disk_bytes: 201457664, uptime: on ? uptime : 0, cpu_burst: { periods: Math.floor(burstUsec / 50000), microseconds: Math.floor(burstUsec) } }));
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
                send('console output', prefix + '{"event":"handshake","version":"1.0.0","platform":"paper","minecraft":"26.3","protocol":9}');
                send('console output', prefix + players);
            } else if (sub === 'vitals') {
                send('console output', prefix + JSON.stringify({ event: 'vitals', players: [
                    { name: 'kokofixcomputers', uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03', health: mockPlayer.health, maxHealth: 20, absorption: 0, food: mockPlayer.food, saturation: Math.min(mockPlayer.food, mockPlayer.saturation), level: mockPlayer.level, exp: 0.42, gameMode: mockPlayer.mode },
                    { name: 'Notch', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5', health: 20, maxHealth: 40, absorption: 4, food: 20, saturation: 5, level: 3, exp: 0.9 },
                ] }));
            } else if (['shulker', 'shulkerswap', 'shulkerdelete'].includes(sub)) {
                const [, , who, where, slotText, c, d] = String(args[0]).split(' ');
                const uuid = '13bc7d5e-f906-41ff-a949-6c1eb677fe03';
                if (who !== 'kokofixcomputers') return send('console output', prefix + JSON.stringify({ event: 'player-error', name: who, action: sub, error: 'That player is not online.' }));
                const slot = Number(slotText);
                const parent = where === 'ender' ? mockPlayer.ender : mockPlayer.items;
                const box = parent.find((i) => i.slot === slot);
                const key = `${where}:${slot}`;
                if (!box || !/shulker_box$/.test(box.id) || !mockPlayer.boxes[key]) mockPlayer.boxes[key] = box && /shulker_box$/.test(box.id) ? [] : null;
                if (!mockPlayer.boxes[key]) return send('console output', prefix + JSON.stringify({ event: 'player-error', name: who, action: sub, error: 'That is not a shulker box.' }));
                let inside = mockPlayer.boxes[key];
                if (sub === 'shulkerswap') {
                    const from = Number(c), to = Number(d), x = inside.find((i) => i.slot === from), y = inside.find((i) => i.slot === to);
                    inside = inside.filter((i) => i.slot !== from && i.slot !== to);
                    if (x) inside.push({ ...x, slot: to });
                    if (y) inside.push({ ...y, slot: from });
                }
                if (sub === 'shulkerdelete') inside = inside.filter((i) => i.slot !== Number(c));
                mockPlayer.boxes[key] = inside;
                send('console output', prefix + JSON.stringify({ event: 'shulkerbox', name: who, uuid, where, box: slot, boxId: box.id, items: inside }));
            } else if (['inventory', 'heal', 'feed', 'swap', 'delete', 'ender', 'enderswap', 'enderdelete', 'health', 'hunger', 'levels', 'gamemode'].includes(sub)) {
                const [, , who, a, b] = String(args[0]).split(' ');
                if (who !== 'kokofixcomputers') return send('console output', prefix + JSON.stringify({ event: 'player-error', name: who, action: sub, error: 'That player is not online.' }));
                const wears = { 39: /_helmet$|^carved_pumpkin$|_head$|_skull$/, 38: /_chestplate$|^elytra$/, 37: /_leggings$/, 36: /_boots$/ };
                const fits = (slot, item) => !item || !wears[slot] || wears[slot].test(item.id.replace('minecraft:', ''));
                const at = (slot) => mockPlayer.items.find((i) => i.slot === slot);
                if (sub === 'ender' || sub === 'enderswap' || sub === 'enderdelete') {
                    const from = Number(a), to = Number(b);
                    if (sub === 'enderswap') {
                        const x = mockPlayer.ender.find((i) => i.slot === from), y = mockPlayer.ender.find((i) => i.slot === to);
                        mockPlayer.ender = mockPlayer.ender.filter((i) => i.slot !== from && i.slot !== to);
                        if (x) mockPlayer.ender.push({ ...x, slot: to });
                        if (y) mockPlayer.ender.push({ ...y, slot: from });
                    }
                    if (sub === 'enderdelete') mockPlayer.ender = mockPlayer.ender.filter((i) => i.slot !== from);
                    return send('console output', prefix + JSON.stringify({ event: 'enderchest', name: who, uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03', items: mockPlayer.ender }));
                }
                if (sub === 'gamemode') {
                    if (['survival', 'creative', 'adventure', 'spectator'].includes(a)) mockPlayer.mode = a;
                    return setTimeout(() => ws.emit('message', JSON.stringify({ event: 'send command', args: ['stratpanelhidepanellogs vitals'] })), 50);
                }
                if (sub === 'health' || sub === 'hunger' || sub === 'levels') {
                    const delta = Number(a);
                    if (sub === 'health') mockPlayer.health = Math.min(20, Math.max(1, mockPlayer.health + delta));
                    if (sub === 'hunger') { mockPlayer.food = Math.min(20, Math.max(0, mockPlayer.food + delta)); mockPlayer.saturation = Math.min(mockPlayer.saturation, mockPlayer.food); }
                    if (sub === 'levels') mockPlayer.level = Math.min(100000, Math.max(0, mockPlayer.level + delta));
                    return setTimeout(() => ws.emit('message', JSON.stringify({ event: 'send command', args: ['stratpanelhidepanellogs vitals'] })), 50);
                }
                if (sub === 'heal') { mockPlayer.health = 20; return setTimeout(() => ws.emit('message', JSON.stringify({ event: 'send command', args: ['stratpanelhidepanellogs vitals'] })), 50); }
                if (sub === 'feed') { mockPlayer.food = 20; mockPlayer.saturation = 20; return setTimeout(() => ws.emit('message', JSON.stringify({ event: 'send command', args: ['stratpanelhidepanellogs vitals'] })), 50); }
                if (sub === 'swap') {
                    const from = Number(a), to = Number(b), x = at(from), y = at(to);
                    if (!fits(to, x) || !fits(from, y)) send('console output', prefix + JSON.stringify({ event: 'player-error', name: who, action: 'swap', error: 'That item can not go in that slot.' }));
                    else {
                        mockPlayer.items = mockPlayer.items.filter((i) => i.slot !== from && i.slot !== to);
                        if (x) mockPlayer.items.push({ ...x, slot: to });
                        if (y) mockPlayer.items.push({ ...y, slot: from });
                    }
                }
                if (sub === 'delete') mockPlayer.items = mockPlayer.items.filter((i) => i.slot !== Number(a));
                send('console output', prefix + JSON.stringify({ event: 'inventory', name: who, uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03', items: mockPlayer.items }));
            } else if (sub === 'perf') {
                const wobble = 17 + Math.random() * 3;
                const avg = 8 + Math.random() * 40;
                send('console output', prefix + JSON.stringify({ event: 'performance', world: mockWorldNow(), tps: [Math.min(20, +wobble.toFixed(2)), 19.97, 20], mspt: { avg: +avg.toFixed(2), min: 2.35, max: +(avg * 2.4).toFixed(2) }, supported: true }));
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
