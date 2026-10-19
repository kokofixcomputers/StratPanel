/*
 * What the search box learns from: many ways of saying each thing, as small grammars. tools/train-nlu.js expands them (with polite
 * beginnings and endings, other words for the same thing, and typing mistakes) into a few thousand phrases and trains the classifier on them.
 *
 * In a phrase {t} is "the server" in any of the ways people point at one (the name is masked as _srv_, as the engine does), _name_ is
 * the name of a backup, _cmd_ a console command. To teach it a new way of saying something, add it here and run `node tools/train-nlu.js`.
 */

// The ways of pointing at a server.
const TARGETS = [
    '_srv_', '_srv_', '_srv_', 'the _srv_ server', 'my _srv_ server', 'server _srv_', 'the server _srv_', 'my minecraft server _srv_', 'my minecraft server called _srv_',
    'the minecraft server named _srv_', 'my server _srv_', 'the server called _srv_', 'my _srv_', 'the _srv_', 'minecraft server _srv_', 'the _srv_ minecraft server',
    'my server called _srv_', 'the mc server _srv_', 'world _srv_', 'the world _srv_',
];
// Pointing at "the one that is open" or "my only one", no name.
const NO_TARGETS = ['', 'it', 'the server', 'my server', 'my minecraft server', 'this server', 'the minecraft server', 'this', 'the mc server', 'everything', 'the world'];

const POLITE_BEFORE = [
    '', '', '', '', 'please ', 'pls ', 'plz ', 'can you ', 'could you ', 'would you ', 'could you please ', 'can you please ', 'i want to ', "i'd like to ", 'i need to ',
    'i wanna ', 'go ahead and ', 'hey ', 'hey can you ', 'just ', "let's ", 'lets ', 'quickly ', 'ok ', 'okay ', 'yo ', 'time to ', 'i would like to ', 'help me ',
    'i want you to ', 'will you ', 'would you please ', 'ok now ', 'now ',
];
const POLITE_AFTER = [
    '', '', '', '', ' please', ' now', ' for me', ' real quick', ' thanks', ' asap', ' pls', ' right now', ' if you can', ' thank you', ' quickly', ' already', ' immediately',
];

// Verb phrases: {t} marks where the server goes; without it the server comes after.
const VERBS = {
    start: [
        'start', 'launch', 'boot', 'boot up', 'power on', 'turn on', 'switch on', 'fire up', 'spin up', 'bring up', 'run', 'wake up', 'start up', 'kick off', 'get {t} running',
        'get {t} up', 'get {t} started', 'turn {t} on', 'power {t} on', 'boot {t} up', 'start {t} up', 'switch {t} on', 'begin', 'activate', 'enable', 'open up', 'light up',
        'start running', 'get going with', 'bring {t} online', 'put {t} online', 'make {t} go live',
    ],
    stop: [
        'stop', 'shut down', 'shutdown', 'turn off', 'power off', 'halt', 'bring down', 'switch off', 'close', 'end', 'take down', 'shut off', 'turn {t} off', 'power {t} down',
        'shut {t} down', 'switch {t} off', 'stop running', 'take {t} offline', 'bring {t} offline', 'put {t} to sleep', 'pause', 'deactivate', 'disable', 'terminate gracefully',
        'power down', 'stop {t} from running', 'close down', 'save and stop', 'gracefully stop',
    ],
    restart: [
        'restart', 'reboot', 'bounce', 'cycle', 'power cycle', 'relaunch', 'reboot', 'turn {t} off and on again', 'restart {t} again', 'give {t} a restart',
        'do a restart of', 'do a reboot of', 'reset', 'bring {t} back up', 'cycle the power of',
        'reboot {t} for me', 'recycle',
    ],
    kill: [
        'kill', 'force stop', 'force kill', 'terminate', 'force quit', 'hard stop', 'force shut down', 'forcibly stop', 'force close', 'force shutdown', 'kill {t} now',
        'murder', 'end the process of', 'force off', 'hard kill', 'kill -9', 'forcefully stop', 'force {t} to stop', 'force {t} off', 'pull the plug on', 'nuke',
    ],
    backup: [
        'create a backup of', 'create a backup for', 'make a backup of', 'make a backup for', 'take a backup of', 'take a backup of', 'back up', 'backup', 'create backup',
        'make backup', 'new backup of', 'new backup for', 'start a backup of', 'start a backup for', 'snapshot', 'take a snapshot of', 'make a snapshot of', 'save a copy of',
        'save a backup of', 'back {t} up', 'run a backup of', 'run a backup for', 'create a backup', 'make a backup', 'take a backup', 'do a backup of', 'do a backup for',
        'i need a backup of', 'generate a backup of', 'create a new backup for', 'archive', 'save a snapshot of', 'create a snapshot of', 'make a copy of', 'copy', 'backup up',
        'trigger a backup of', 'schedule a backup of', 'perform a backup of', 'back up now', 'create a backup now for', 'take a fresh backup of', 'save {t}',
    ],
    open: [
        'open', 'go to', 'jump to', 'show', 'take me to', 'switch to', 'find', 'view', 'manage', 'look at', 'show me', 'open up', 'bring up', 'navigate to', 'visit', 'pull up',
        'let me see', 'i want to see', 'where is', 'take me to the console of', 'go into', 'enter', 'select', 'load', 'access', 'check on', 'check', 'look up', 'open the page of',
    ],
};

// Pages: what they are called is in the engine; here only how people ask for one.
const PAGE_PHRASES = [
    'open the {p} of {t}', 'show me the {p} for {t}', "go to {t}'s {p}", '{t} {p}', 'open {t} {p}', 'take me to the {p} of {t}', 'i want to see the {p} of {t}', 'show {p}',
    'open {p}', 'go to {p}', 'go to the {p}', 'take me to the {p} page', 'open the {p} page', 'show the {p} tab', 'open the {p} tab of {t}', 'view {t} {p}', 'manage the {p} of {t}',
    'check the {p} of {t}', '{p} for {t}', '{p} of {t}', 'jump to {p}', 'jump to {t} {p}', 'bring up the {p}', 'bring up {p} for {t}', 'let me see the {p}', 'let me see {t} {p}',
    'where are the {p} of {t}', 'navigate to {p}', 'take me to {p}', 'edit the {p} of {t}', 'look at the {p} of {t}', 'i need the {p} of {t}', 'open {t} and go to {p}', 'see {p}',
    'show me {p}', 'show me {t} {p}', 'go to {t} then {p}', 'switch to the {p}', 'switch to {p} for {t}',
];
const PAGE_WORDS = [
    'console', 'logs', 'terminal', 'players', 'player list', 'who is online', 'whitelist', 'versions', 'version', 'software', 'properties', 'server properties', 'motd', 'difficulty',
    'game rules', 'content', 'mods', 'plugins', 'datapacks', 'modrinth', 'worlds', 'seed', 'tools', 'files', 'file manager', 'file editor', 'config files', 'importer', 'databases',
    'database', 'schedules', 'scheduled tasks', 'cron', 'users', 'subusers', 'access', 'backups', 'backup list', 'snapshots', 'network', 'ports', 'allocations', 'domains',
    'subdomain', 'trash', 'recycle bin', 'deleted files', 'startup', 'environment variables', 'java version', 'startup command', 'settings', 'sftp', 'activity', 'activity log', 'audit log',
    'restore backup', 'restore', 'output', 'editor', 'folders', 'variables', 'ip address',
];

const SITE_PHRASES = [
    'go to {s}', 'open {s}', 'take me to {s}', 'show {s}', 'show me {s}', 'i want to see {s}', 'open my {s}', 'go to my {s}', 'open the {s} page', 'jump to {s}', 'navigate to {s}',
    'bring up {s}', 'where is {s}', 'let me see {s}', 'manage {s}', 'change {s}', 'edit {s}', 'view {s}', 'open up {s}', 'i need {s}', 'take me back to {s}',
];
const SITE_WORDS = [
    'dashboard', 'home', 'home page', 'all my servers', 'server list', 'my servers', 'main page', 'account', 'account settings', 'profile', 'my account', 'change my password',
    'password', 'email', 'two factor', '2fa', 'authenticator', 'api keys', 'api key', 'api credentials', 'token', 'ssh keys', 'ssh key', 'public key', 'providers', 'linked accounts',
    'passkeys', 'passkey', 'security key', 'account activity', 'login history', 'logins', 'front page',
];

const COMMANDS = [
    'say hello everyone', 'say the server restarts soon', 'time set day', 'weather clear', 'op steve', 'deop alex', 'whitelist add notch', 'save-all', 'list', 'kick griefer',
    'gamemode creative steve', 'difficulty hard', 'tp steve alex', 'give steve diamond 64', 'ban cheater', 'pardon steve', 'whitelist reload', 'stop', 'seed', 'tellraw @a hi',
    'gamerule keepinventory true', 'time set night', 'say hi', 'effect give steve speed', 'kill @e[type=zombie]', 'title @a title welcome', 'say welcome back', 'plugins', 'tps',
    'weather rain', 'worldborder set 1000', 'clear steve', 'xp add steve 10 levels', 'summon cow', 'help', 'version', 'save-off', 'save-on', 'reload',
];
const COMMAND_PHRASES = [
    'run _cmd_ on {t}', 'run the command _cmd_ on {t}', 'send command _cmd_ to {t}', 'send _cmd_ to {t}', 'execute _cmd_ in {t}', 'execute _cmd_ on {t}', 'run command _cmd_ in {t}',
    'type _cmd_ in the console of {t}', 'send _cmd_ to the console of {t}', 'issue _cmd_ on {t}', 'run _cmd_', 'execute _cmd_', 'send command _cmd_', 'run the command _cmd_',
    'send the command _cmd_ to {t}', 'in {t} run _cmd_', 'on {t} run _cmd_', 'tell {t} to run _cmd_', 'tell {t} to do _cmd_', 'console _cmd_ on {t}', 'run console command _cmd_ on {t}',
    'send _cmd_ to the console', 'type _cmd_ into the console', 'execute the command _cmd_ on {t}', 'fire _cmd_ at {t}', 'make {t} run _cmd_', 'have {t} execute _cmd_',
    'run _cmd_ for {t}', 'enter _cmd_ in {t}', 'enter the command _cmd_ on {t}', 'issue the command _cmd_ to {t}', 'command _cmd_ on {t}', 'console command _cmd_ on {t}',
    'use the console of {t} to run _cmd_', 'pass _cmd_ to {t}', '/_cmd_ on {t}', 'send _cmd_ command to {t}',
];

const THEME_PHRASES = [
    'dark mode', 'light mode', 'switch to dark mode', 'switch to light mode', 'turn on dark mode', 'turn off dark mode', 'enable dark mode', 'disable dark mode', 'use dark mode',
    'use the dark theme', 'use the light theme', 'switch to the dark theme', 'switch to the light theme', 'make it dark', 'make it light', 'make it bright', 'make the panel dark',
    'make the screen dark', 'too bright', 'it is too bright', 'it is too dark', 'toggle theme', 'toggle dark mode', 'change the theme', 'change theme', 'switch theme', 'night mode',
    'turn on night mode', 'day mode', 'go dark', 'go light', 'dark theme', 'light theme', 'switch the theme', 'change to dark', 'change to light', 'i want dark mode', 'i want light mode',
    'dark mode please', 'light mode please', 'my eyes hurt', 'appearance dark', 'set the theme to dark', 'set the theme to light', 'set dark mode', 'set light mode', 'toggle the theme',
    'enable the dark theme', 'enable the light theme', 'turn the lights off', 'turn the lights on', 'bright mode', 'dim mode',
];

// Not requests: names, questions, chat. Teaches it to stay quiet.
const NONE_PHRASES = [
    'hello', 'hi there', 'how are you', 'what time is it', 'what is the weather', 'thanks', 'thank you', 'good morning', 'who are you', 'what can you do', 'help', 'help me',
    'how do i restart a server', 'how do i make a backup', 'what does restart do', 'why does my server crash', 'why wont my server start', 'how to install mods', 'what is a backup',
    'best minecraft mods', 'best plugins for survival', 'how many players can join', 'is my server online', 'what is my server ip', 'what version is my server',
    'tell me a joke', 'play some music', 'what is the meaning of life', 'my password is secret', 'i love minecraft', 'minecraft', 'survival', 'creative mode', 'bedwars',
    'skyblock', 'lobby', 'play', 'test', 'asdf', 'qwerty', 'abc', 'lorem ipsum dolor sit amet', 'the quick brown fox', 'nothing', 'something', 'whatever', 'cool', 'nice server',
    'why is it slow', 'where did my world go', 'when does it restart', 'how long does a backup take', 'can i restart it later', 'did the backup finish', 'who is online',
    'how do i start', 'how to stop lag', 'what happens when i kill a server', 'is it safe to stop', 'restarting is fun', 'the server is great', 'start menu', 'stop sign',
    'backup plan', 'a backup singer', 'kill time', 'restart your computer', 'reboot the universe', 'create a sandwich', 'make me a coffee', 'open the door', 'close the window',
    'run to the store', 'send a letter', 'back to the future', 'the files are here', 'my account is great', 'dark souls', 'light bulb', 'start a band', 'turn left',
    'install a plugin', 'update minecraft', 'buy a server', 'delete everything', 'format the disk', 'rm rf', 'drop table users', 'sudo make me a sandwich',
];

module.exports = {
    TARGETS, NO_TARGETS, POLITE_BEFORE, POLITE_AFTER, VERBS, PAGE_PHRASES, PAGE_WORDS, SITE_PHRASES, SITE_WORDS, COMMANDS, COMMAND_PHRASES, THEME_PHRASES, NONE_PHRASES,
};
