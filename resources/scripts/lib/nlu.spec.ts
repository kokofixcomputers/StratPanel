/** @jest-environment node */
// The language of the search box: what it understands, what it leaves alone, and that the trained file is up to date.
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlu = require('../../../public/js/stratosphere-nlu.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const trainer = require('../../../tools/train-nlu.js');

const server = (name: string) => ({
    uuid: `u-${name}`,
    id: name.toLowerCase().replace(/\W/g, ''),
    name,
    node: 'Frankfurt',
    canControl: { start: true, stop: true, restart: true },
});
const SERVERS = [
    'Survival SMP',
    'Creative Plots',
    'Lobby',
    'Skyblock',
    'Bedwars',
    'Modded Fun',
    'Test Server 10',
    'Test Server 2',
    'Hardcore',
].map(server);
const ctx = { servers: SERVERS, current: null };

interface Expect {
    intent: string;
    server?: string | string[];
    name?: string;
    command?: string;
    page?: string;
    site?: string;
    mode?: string;
}

const run = (phrase: string, context: any = ctx) => {
    const r = nlu.interpret(phrase, context);

    return (
        r && {
            intent: r.intent,
            server: r.servers.map((s: any) => s.name),
            name: r.backupName,
            command: r.command,
            page: r.page?.path,
            site: r.site?.path,
            mode: r.mode,
        }
    );
};

const check = (phrase: string, expected: Expect | null, context: any = ctx) => {
    const got = run(phrase, context);
    if (expected === null) {
        expect({ phrase, got }).toEqual({ phrase, got: null });

        return;
    }
    expect({ phrase, intent: got?.intent }).toEqual({ phrase, intent: expected.intent });
    if (expected.server !== undefined) {
        expect({ phrase, server: got?.server }).toEqual({
            phrase,
            server: Array.isArray(expected.server) ? expected.server : [expected.server],
        });
    }
    if (expected.name !== undefined) expect({ phrase, name: got?.name }).toEqual({ phrase, name: expected.name });
    if (expected.command !== undefined)
        expect({ phrase, command: got?.command }).toEqual({ phrase, command: expected.command });
    if (expected.page !== undefined) expect({ phrase, page: got?.page }).toEqual({ phrase, page: expected.page });
    if (expected.site !== undefined) expect({ phrase, site: got?.site }).toEqual({ phrase, site: expected.site });
    if (expected.mode !== undefined) expect({ phrase, mode: got?.mode }).toEqual({ phrase, mode: expected.mode });
};

describe('the trained file', () => {
    it('is what the training makes (run `node tools/train-nlu.js` after changing tools/nlu)', () => {
        const file = fs.readFileSync(path.join(__dirname, '../../../public/js/stratosphere-nlu.js'), 'utf8');
        expect(file).toBe(trainer.build().output);
    });

    it('learned all the intents', () => {
        expect(nlu.model.classes).toEqual([
            'backup',
            'command',
            'kill',
            'none',
            'open',
            'page',
            'restart',
            'site',
            'start',
            'stop',
            'theme',
        ]);
        expect(nlu.model.features.length).toBeGreaterThan(500);
    });
});

describe('starting, stopping and restarting', () => {
    const cases: [string, Expect][] = [
        ['start survival', { intent: 'start', server: 'Survival SMP' }],
        ['start my minecraft server survival', { intent: 'start', server: 'Survival SMP' }],
        ['please start the lobby server', { intent: 'start', server: 'Lobby' }],
        ['can you boot up skyblock for me', { intent: 'start', server: 'Skyblock' }],
        ['turn on bedwars', { intent: 'start', server: 'Bedwars' }],
        ['power on hardcore', { intent: 'start', server: 'Hardcore' }],
        ['fire up modded fun', { intent: 'start', server: 'Modded Fun' }],
        ['launch creative plots', { intent: 'start', server: 'Creative Plots' }],
        ['get lobby running', { intent: 'start', server: 'Lobby' }],
        ['spin up the survival smp server please', { intent: 'start', server: 'Survival SMP' }],
        ['i want to start my server called hardcore', { intent: 'start', server: 'Hardcore' }],
        ['wake up bedwars', { intent: 'start', server: 'Bedwars' }],
        ['stop survival', { intent: 'stop', server: 'Survival SMP' }],
        ['turn off creative', { intent: 'stop', server: 'Creative Plots' }],
        ['shut down the lobby', { intent: 'stop', server: 'Lobby' }],
        ['please shut down my minecraft server skyblock', { intent: 'stop', server: 'Skyblock' }],
        ['power off bedwars now', { intent: 'stop', server: 'Bedwars' }],
        ['can you stop hardcore', { intent: 'stop', server: 'Hardcore' }],
        ['halt modded fun', { intent: 'stop', server: 'Modded Fun' }],
        ['take lobby offline', { intent: 'stop', server: 'Lobby' }],
        ['switch off survival smp', { intent: 'stop', server: 'Survival SMP' }],
        ['shutdown the creative plots server', { intent: 'stop', server: 'Creative Plots' }],
        ['restart lobby', { intent: 'restart', server: 'Lobby' }],
        ['reboot survival', { intent: 'restart', server: 'Survival SMP' }],
        ['please restart my minecraft server called skyblock', { intent: 'restart', server: 'Skyblock' }],
        ['restart the bedwars server', { intent: 'restart', server: 'Bedwars' }],
        ['could you reboot hardcore', { intent: 'restart', server: 'Hardcore' }],
        ['bounce modded fun', { intent: 'restart', server: 'Modded Fun' }],
        ['power cycle creative', { intent: 'restart', server: 'Creative Plots' }],
        ['give lobby a restart', { intent: 'restart', server: 'Lobby' }],
        ['relaunch skyblock', { intent: 'restart', server: 'Skyblock' }],
        ['restart test server 2', { intent: 'restart', server: 'Test Server 2' }],
        ['restart test server 10 please', { intent: 'restart', server: 'Test Server 10' }],
        ['kill the frozen modded fun', { intent: 'kill', server: 'Modded Fun' }],
        ['force stop lobby', { intent: 'kill', server: 'Lobby' }],
        ['kill survival', { intent: 'kill', server: 'Survival SMP' }],
        ['terminate bedwars', { intent: 'kill', server: 'Bedwars' }],
        ['force quit hardcore now', { intent: 'kill', server: 'Hardcore' }],
        ['hard stop skyblock', { intent: 'kill', server: 'Skyblock' }],
    ];
    it.each(cases)('%s', (phrase, expected) => check(phrase, expected));

    it('survives typing mistakes', () => {
        check('restrat lobby', { intent: 'restart', server: 'Lobby' });
        check('strat survival', { intent: 'start', server: 'Survival SMP' });
        check('reboot survivel', { intent: 'restart', server: 'Survival SMP' });
        check('shut dwon skyblock', { intent: 'stop', server: 'Skyblock' });
        check('rstart creativ', { intent: 'restart', server: 'Creative Plots' });
    });

    it('offers every server that fits when the name is not enough', () => {
        // "test server" is two servers, "restart test server" cannot tell which.
        const r = run('restart test server');
        expect(r?.intent).toBe('restart');
        expect(r?.server).toEqual(expect.arrayContaining(['Test Server 10', 'Test Server 2']));
    });
});

describe('backups', () => {
    const cases: [string, Expect][] = [
        [
            'create a backup for my minecraft server called Survival SMP',
            { intent: 'backup', server: 'Survival SMP', name: '' },
        ],
        ['create backup lobby', { intent: 'backup', server: 'Lobby', name: '' }],
        ['create a backup for skyblock', { intent: 'backup', server: 'Skyblock', name: '' }],
        ['back up bedwars', { intent: 'backup', server: 'Bedwars', name: '' }],
        ['backup hardcore', { intent: 'backup', server: 'Hardcore', name: '' }],
        ['make a backup of creative plots', { intent: 'backup', server: 'Creative Plots', name: '' }],
        ['please take a backup of survival', { intent: 'backup', server: 'Survival SMP', name: '' }],
        ['snapshot modded fun', { intent: 'backup', server: 'Modded Fun', name: '' }],
        ['save a copy of lobby', { intent: 'backup', server: 'Lobby', name: '' }],
        ['can you back up the lobby server', { intent: 'backup', server: 'Lobby', name: '' }],
        ['create a backup called weekly for skyblock', { intent: 'backup', server: 'Skyblock', name: 'weekly' }],
        [
            'create a backup named before the update for lobby',
            { intent: 'backup', server: 'Lobby', name: 'before the update' },
        ],
        [
            'make a backup called "Pre Update 1.21" of survival',
            { intent: 'backup', server: 'Survival SMP', name: 'Pre Update 1.21' },
        ],
        ['back up bedwars and name it before update', { intent: 'backup', server: 'Bedwars', name: 'before update' }],
        ['back up hardcore with the name monday', { intent: 'backup', server: 'Hardcore', name: 'monday' }],
        [
            'create a backup of my server called survival smp named friday',
            { intent: 'backup', server: 'Survival SMP', name: 'friday' },
        ],
        [
            'take a backup called nightly for creative plots',
            { intent: 'backup', server: 'Creative Plots', name: 'nightly' },
        ],
        ['snapshot lobby called safe point', { intent: 'backup', server: 'Lobby', name: 'safe point' }],
    ];
    it.each(cases)('%s', (phrase, expected) => check(phrase, expected));

    it('uses the server that is open when none is named', () => {
        const open = { ...ctx, current: SERVERS[2] };
        check('create a backup', { intent: 'backup', server: 'Lobby', name: '' }, open);
        check('make a backup called safe', { intent: 'backup', server: 'Lobby', name: 'safe' }, open);
        check('back it up', { intent: 'backup', server: 'Lobby' }, open);
        check('restart', { intent: 'restart', server: 'Lobby' }, open);
        // A name wins over the one that is open.
        check('create a backup for skyblock', { intent: 'backup', server: 'Skyblock' }, open);
    });

    it('uses the only server there is', () => {
        check(
            'start my minecraft server',
            { intent: 'start', server: 'Lobby' },
            { servers: [SERVERS[2]], current: null }
        );
        check(
            'create a backup of my server',
            { intent: 'backup', server: 'Lobby' },
            { servers: [SERVERS[2]], current: null }
        );
    });

    it('asks nothing it cannot answer: no server named, several servers, none open', () => {
        check('start my minecraft server', null);
        check('create a backup', null);
    });
});

describe('commands', () => {
    const cases: [string, Expect][] = [
        ['run say hello on lobby', { intent: 'command', server: 'Lobby', command: 'say hello' }],
        [
            'send command /time set day to creative plots',
            { intent: 'command', server: 'Creative Plots', command: 'time set day' },
        ],
        ['execute save-all in survival', { intent: 'command', server: 'Survival SMP', command: 'save-all' }],
        [
            'run the command weather clear on skyblock',
            { intent: 'command', server: 'Skyblock', command: 'weather clear' },
        ],
        [
            'send "say the server restarts soon" to bedwars',
            { intent: 'command', server: 'Bedwars', command: 'say the server restarts soon' },
        ],
        [
            'issue whitelist add notch on hardcore',
            { intent: 'command', server: 'Hardcore', command: 'whitelist add notch' },
        ],
        ['please run op steve on modded fun', { intent: 'command', server: 'Modded Fun', command: 'op steve' }],
        [
            'type difficulty hard in the console of lobby',
            { intent: 'command', server: 'Lobby', command: 'difficulty hard' },
        ],
    ];
    it.each(cases)('%s', (phrase, expected) => check(phrase, expected));

    it('runs it on the server that is open', () => {
        const open = { ...ctx, current: SERVERS[0] };
        check('run say hi', { intent: 'command', server: 'Survival SMP', command: 'say hi' }, open);
        check('send command list to this server', { intent: 'command', server: 'Survival SMP', command: 'list' }, open);
    });
});

describe('pages and places', () => {
    const cases: [string, Expect][] = [
        ['open the files of survival', { intent: 'page', server: 'Survival SMP', page: '/files' }],
        ['show me the console for lobby', { intent: 'page', server: 'Lobby', page: '/' }],
        ['go to skyblock players', { intent: 'page', server: 'Skyblock', page: '/players' }],
        ['take me to the backups of bedwars', { intent: 'page', server: 'Bedwars', page: '/backups' }],
        ['hardcore properties', { intent: 'page', server: 'Hardcore', page: '/properties' }],
        ['open the schedules page of creative plots', { intent: 'page', server: 'Creative Plots', page: '/schedules' }],
        ['i want to see the plugins of survival', { intent: 'page', server: 'Survival SMP', page: '/mods' }],
        ['check the settings of lobby', { intent: 'page', server: 'Lobby', page: '/settings' }],
        ['view modded fun network', { intent: 'page', server: 'Modded Fun', page: '/network' }],
        ['edit the config files of skyblock', { intent: 'page', server: 'Skyblock', page: '/files' }],
        ['what are the players for bedwars', { intent: 'page', server: 'Bedwars', page: '/players' }],
        ['who is online on bedwars', { intent: 'page', server: 'Bedwars', page: '/players' }],
        ['how many players are on lobby', { intent: 'page', server: 'Lobby', page: '/players' }],
        ['bedwars players', { intent: 'page', server: 'Bedwars', page: '/players' }],
        ['players for skyblock', { intent: 'page', server: 'Skyblock', page: '/players' }],
        ['list the players on survival', { intent: 'page', server: 'Survival SMP', page: '/players' }],
        ['what are the backups of lobby', { intent: 'page', server: 'Lobby', page: '/backups' }],
        ['which mods are on skyblock', { intent: 'page', server: 'Skyblock', page: '/mods' }],
        ['what files does hardcore have', { intent: 'page', server: 'Hardcore', page: '/files' }],
        ['open survival', { intent: 'open', server: 'Survival SMP' }],
        ['go to creative plots', { intent: 'open', server: 'Creative Plots' }],
        ['jump to the lobby server', { intent: 'open', server: 'Lobby' }],
        ['take me to skyblock', { intent: 'open', server: 'Skyblock' }],
        ['switch to bedwars', { intent: 'open', server: 'Bedwars' }],
        ['manage hardcore', { intent: 'open', server: 'Hardcore' }],
        ['go to account settings', { intent: 'site', site: '/account' }],
        ['change my password', { intent: 'site', site: '/account' }],
        ['open my api keys', { intent: 'site', site: '/account/api' }],
        ['show ssh keys', { intent: 'site', site: '/account/ssh' }],
        ['take me to the dashboard', { intent: 'site', site: '/' }],
        ['open passkeys', { intent: 'site', site: '/account/passkeys' }],
        ['go home', { intent: 'site', site: '/' }],
    ];
    it.each(cases)('%s', (phrase, expected) => check(phrase, expected));

    it('shows a page of the server that is open', () => {
        const open = { ...ctx, current: SERVERS[3] };
        check('open the files', { intent: 'page', server: 'Skyblock', page: '/files' }, open);
        check('show backups', { intent: 'page', server: 'Skyblock', page: '/backups' }, open);
        check('go to players', { intent: 'page', server: 'Skyblock', page: '/players' }, open);
    });
});

describe('the theme', () => {
    const cases: [string, Expect][] = [
        ['dark mode', { intent: 'theme', mode: 'dark' }],
        ['switch to light mode', { intent: 'theme', mode: 'light' }],
        ['turn on dark mode please', { intent: 'theme', mode: 'dark' }],
        ['make it dark', { intent: 'theme', mode: 'dark' }],
        ['it is too bright', { intent: 'theme', mode: 'dark' }],
        ['use the light theme', { intent: 'theme', mode: 'light' }],
        ['toggle theme', { intent: 'theme', mode: 'toggle' }],
        ['night mode', { intent: 'theme', mode: 'dark' }],
        ['change the theme', { intent: 'theme', mode: 'toggle' }],
        ['i hate this bright screen', { intent: 'theme', mode: 'dark' }],
        ['lights off', { intent: 'theme', mode: 'dark' }],
        ['turn the lights on', { intent: 'theme', mode: 'light' }],
    ];
    it.each(cases)('%s', (phrase, expected) => check(phrase, expected));
});

describe('what it leaves alone', () => {
    it.each([
        'lobby',
        'survival',
        'hello',
        'how do i restart a server',
        'what is a backup',
        'why wont my server start',
        'the quick brown fox',
        'best plugins for survival',
        'kill time',
        'backup plan',
        'asdf',
        'ab',
        '',
        'what time is it',
        'restart your computer',
        'tell me a joke',
        'is my server online',
        'what are the best plugins for survival',
        'how do i use mods',
        'my backups are broken',
    ])('%j', (phrase) => check(phrase, null));
});

describe('the pieces', () => {
    it('knows how alike words are', () => {
        expect(nlu.similarity('survival', 'survival')).toBe(1);
        expect(nlu.similarity('survival', 'surv')).toBeGreaterThan(0.8);
        expect(nlu.similarity('survival', 'survivel')).toBeGreaterThan(0.6);
        expect(nlu.similarity('lobby', 'laundry')).toBe(0);
        // Numbers are exact: server 2 is not server 10.
        expect(nlu.similarity('2', '10')).toBe(0);
        expect(nlu.similarity('10', '10')).toBe(1);
    });

    it('does not pick a server for words like "server" and "minecraft"', () => {
        expect(nlu.matchServers(nlu.words('my minecraft server'), SERVERS).servers).toEqual([]);
        const named = [server('Minecraft Server'), server('Lobby')];
        expect(nlu.matchServers(nlu.words('my minecraft server'), named).servers.map((s: any) => s.name)).toEqual([
            'Minecraft Server',
        ]);
    });

    it('does not read a name of a backup as a server', () => {
        const r = nlu.interpret('create a backup called lobby for skyblock', ctx);
        expect(r.servers.map((s: any) => s.name)).toEqual(['Skyblock']);
        expect(r.backupName).toBe('lobby');
    });
});
