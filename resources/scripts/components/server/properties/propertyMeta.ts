interface PropertyMeta {
    title: string;
    description: string;
    options?: string[];
}

/**
 * Friendly names and descriptions for the vanilla server.properties keys. Anything not listed here is still
 * editable, it just falls back to the raw key name.
 */
const meta: Record<string, PropertyMeta> = {
    'accepts-transfers': {
        title: 'Accept Transfers',
        description: 'Allow this server to accept player transfers from other servers.',
    },
    'allow-flight': {
        title: 'Allow Flight',
        description: 'When enabled, players in Survival mode can fly. Disable to kick players who try to fly.',
    },
    'allow-nether': { title: 'Allow Nether', description: 'Allows players to travel to the Nether.' },
    'broadcast-console-to-ops': {
        title: 'Broadcast Console to Ops',
        description: 'Show server console messages to all online operators.',
    },
    'broadcast-rcon-to-ops': {
        title: 'Broadcast RCON to Ops',
        description: 'Show RCON console output to all online operators.',
    },
    'bug-report-link': {
        title: 'Bug Report Link',
        description: 'Custom URL for players to report bugs. Leave empty to use the default.',
    },
    difficulty: {
        title: 'Difficulty',
        description: 'The difficulty of the world.',
        options: ['peaceful', 'easy', 'normal', 'hard'],
    },
    'enable-command-block': { title: 'Command Blocks', description: 'Enables command blocks.' },
    'enable-query': { title: 'Enable Query', description: 'Enables the GameSpy4 query protocol.' },
    'enable-rcon': { title: 'Enable RCON', description: 'Enables remote access to the server console.' },
    'enable-status': {
        title: 'Show in Server List',
        description: 'Makes the server appear online to clients in the server list.',
    },
    'enforce-secure-profile': {
        title: 'Enforce Secure Profile',
        description: 'Require players to have a Mojang-signed public key to join.',
    },
    'enforce-whitelist': {
        title: 'Enforce Whitelist',
        description: 'Kick players who are not on the whitelist when it is reloaded.',
    },
    'force-gamemode': { title: 'Force Gamemode', description: 'Force players to join in the default game mode.' },
    gamemode: {
        title: 'Default Gamemode',
        description: 'The game mode new players start in.',
        options: ['survival', 'creative', 'adventure', 'spectator'],
    },
    'generate-structures': {
        title: 'Generate Structures',
        description: 'Generate villages, strongholds and other structures.',
    },
    hardcore: { title: 'Hardcore', description: 'Players are banned when they die. Also forces hard difficulty.' },
    'hide-online-players': { title: 'Hide Online Players', description: 'Hide the player list from the server list.' },
    'level-name': { title: 'World Name', description: 'The name of the world folder.' },
    'level-seed': {
        title: 'World Seed',
        description: 'The seed used to generate the world. Leave empty for a random seed.',
    },
    'level-type': { title: 'World Type', description: 'The type of world to generate.' },
    'max-players': { title: 'Max Players', description: 'The number of players that can be online at once.' },
    'max-tick-time': {
        title: 'Max Tick Time',
        description: 'Milliseconds a single tick may take before the watchdog stops the server. Use -1 to disable.',
    },
    'max-world-size': { title: 'Max World Size', description: 'The maximum radius of the world in blocks.' },
    motd: { title: 'Message of the Day', description: 'The message shown in the multiplayer server list.' },
    'network-compression-threshold': {
        title: 'Network Compression',
        description: 'Packets larger than this many bytes are compressed.',
    },
    'online-mode': {
        title: 'Online Mode',
        description: 'Verify players against Mojang. Disable only for offline or proxy setups.',
    },
    'op-permission-level': {
        title: 'Op Permission Level',
        description: 'The default permission level for operators (1-4).',
    },
    'player-idle-timeout': {
        title: 'Idle Timeout',
        description: 'Minutes before idle players are kicked. 0 disables it.',
    },
    pvp: { title: 'PvP', description: 'Allow players to damage each other.' },
    'query.port': { title: 'Query Port', description: 'The port used for the query protocol.' },
    'rate-limit': {
        title: 'Rate Limit',
        description: 'Maximum packets per second before a player is kicked. 0 disables it.',
    },
    'rcon.password': { title: 'RCON Password', description: 'The password used to authenticate RCON connections.' },
    'rcon.port': { title: 'RCON Port', description: 'The port used for RCON.' },
    'resource-pack': {
        title: 'Resource Pack',
        description: 'A URL to a resource pack that clients are prompted to download.',
    },
    'resource-pack-prompt': {
        title: 'Resource Pack Prompt',
        description: 'The message shown when prompting for the resource pack.',
    },
    'resource-pack-sha1': { title: 'Resource Pack SHA-1', description: 'The SHA-1 checksum of the resource pack.' },
    'require-resource-pack': {
        title: 'Require Resource Pack',
        description: 'Disconnect players who decline the resource pack.',
    },
    'server-ip': { title: 'Server IP', description: 'The IP to bind to. Leave empty on a managed server.' },
    'server-port': {
        title: 'Server Port',
        description: 'The port the server listens on. This must match your allocation.',
    },
    'simulation-distance': {
        title: 'Simulation Distance',
        description: 'How far from players entities and blocks are ticked, in chunks.',
    },
    'spawn-animals': { title: 'Spawn Animals', description: 'Allow animals to spawn.' },
    'spawn-monsters': { title: 'Spawn Monsters', description: 'Allow monsters to spawn.' },
    'spawn-npcs': { title: 'Spawn Villagers', description: 'Allow villagers to spawn.' },
    'spawn-protection': {
        title: 'Spawn Protection',
        description: 'The radius around spawn that only operators can edit. 0 disables it.',
    },
    'sync-chunk-writes': {
        title: 'Sync Chunk Writes',
        description: 'Write chunks synchronously. Safer, but slower on slow disks.',
    },
    'use-native-transport': { title: 'Native Transport', description: 'Use optimized Linux packet handling.' },
    'view-distance': { title: 'View Distance', description: 'How many chunks are sent to each player.' },
    'white-list': { title: 'Whitelist', description: 'Only players on the whitelist can join.' },
};

const prettify = (key: string) => key;

export const getPropertyMeta = (key: string): PropertyMeta => meta[key] || { title: prettify(key), description: '' };
