import { nlItems, NlActions, NlContext } from '@/lib/paletteNl';
import { rankItems } from '@/lib/palette';
import { exampleQueries } from '@/lib/nlu';

const listed = (name: string, control = { start: true, stop: true, restart: true }) => ({
    id: name.toLowerCase().replace(/\W/g, ''),
    uuid: `u-${name}`,
    name,
    node: 'Frankfurt',
    internalId: 1,
    description: '',
    address: '',
    canControl: control,
});

const servers = [
    listed('Survival SMP'),
    listed('Lobby'),
    listed('Skyblock', { start: false, stop: false, restart: false }),
    listed('Bedwars'),
];

const actions = (): NlActions & { calls: unknown[][] } => {
    const calls: unknown[][] = [];

    return {
        calls,
        power: jest.fn(async (...a) => void calls.push(['power', ...a])),
        backup: jest.fn(async (...a) => void calls.push(['backup', ...a])),
        command: jest.fn(async (...a) => void calls.push(['command', ...a])),
        theme: jest.fn((...a) => void calls.push(['theme', ...a])),
    } as any;
};

const context: NlContext = { servers, current: null };

const run = async (query: string, ctx: NlContext = context) => {
    const a = actions();
    const items = nlItems(query, ctx, a);
    const result: string[] = [];
    for (const i of items) {
        if (i.action.type === 'run') result.push((await i.action.run()) as string);
    }

    return { items, a, result };
};

describe('nlItems', () => {
    it('restarts the server that was named', async () => {
        const { items, a, result } = await run('please restart my minecraft server survival');
        expect(items.map((i) => i.label)).toEqual(['Restart Survival SMP']);
        expect(items[0].group).toBe('Suggested');
        expect(result).toEqual(['Restart sent to Survival SMP']);
        expect(a.calls).toEqual([['power', 'u-Survival SMP', 'restart']]);
    });

    it('backs up with a name', async () => {
        const { items, a, result } = await run('create a backup called weekly for lobby');
        expect(items.map((i) => i.label)).toEqual(['Back up Lobby as “weekly”']);
        expect(result).toEqual(['Backup of Lobby started']);
        expect(a.calls).toEqual([['backup', 'u-Lobby', 'weekly']]);
    });

    it('backs up without one', async () => {
        const { items, a } = await run('create backup bedwars');
        expect(items.map((i) => i.label)).toEqual(['Back up Bedwars']);
        expect(a.calls).toEqual([['backup', 'u-Bedwars', '']]);
    });

    it('sends a command', async () => {
        const { items, a } = await run('run say hello on lobby');
        expect(items.map((i) => i.label)).toEqual(['Run “say hello” on Lobby']);
        expect(a.calls).toEqual([['command', 'u-Lobby', 'say hello']]);
    });

    it('opens pages, servers and the theme', async () => {
        expect((await run('open the files of survival')).items[0].action).toEqual({
            type: 'go',
            to: '/server/survivalsmp/files',
        });
        expect((await run('show me the console for lobby')).items[0].action).toEqual({
            type: 'go',
            to: '/server/lobby',
        });
        expect((await run('take me to bedwars')).items[0].action).toEqual({ type: 'go', to: '/server/bedwars' });
        expect((await run('go to my api keys')).items[0].action).toEqual({ type: 'go', to: '/account/api' });

        const dark = await run('switch to dark mode');
        expect(dark.items[0].label).toBe('Use the dark theme');
        expect(dark.a.calls).toEqual([['theme', 'dark']]);
        expect((await run('toggle theme')).a.calls).toEqual([['theme', 'toggle']]);
    });

    it('does not offer what the person may not do', async () => {
        // Skyblock is one this person may not control.
        expect((await run('restart skyblock')).items).toEqual([]);
        // On the open server the permissions are known.
        const open: NlContext = { servers, current: { server: servers[1], permissions: ['control.start'] } };
        expect((await run('stop the server', open)).items).toEqual([]);
        expect((await run('start the server', open)).items.map((i) => i.label)).toEqual(['Start Lobby']);
        expect((await run('create a backup', open)).items).toEqual([]);
        expect((await run('run list on this server', open)).items).toEqual([]);
    });

    it('stays quiet for what is not a request', () => {
        for (const q of ['lobby', 'hello', 'how do i restart a server', 'a', ''])
            expect(nlItems(q, context, actions())).toEqual([]);
    });

    it('offers every server that fits when the name is not clear', () => {
        const two = [listed('Test Server 10'), listed('Test Server 2')];
        expect(
            nlItems('stop test server', { servers: two, current: null }, actions())
                .map((i) => i.label)
                .sort()
        ).toEqual(['Stop Test Server 10', 'Stop Test Server 2']);
    });

    it('shows the understood request first whatever is typed', () => {
        const items = nlItems('create a backup called weekly for lobby', context, actions());
        // Its words are not in the label ("create a backup called weekly for"), it still shows.
        const sections = rankItems(items, 'create a backup called weekly for lobby');
        expect(sections[0].group).toBe('Suggested');
        expect(sections[0].items).toHaveLength(1);
    });
});

describe('exampleQueries', () => {
    it('uses the names of the servers of the person', () => {
        const examples = exampleQueries(['Survival SMP', 'Lobby', 'Skyblock']);
        expect(examples).toContain('restart Survival SMP');
        expect(examples).toContain('create a backup called weekly for Lobby');
        expect(exampleQueries([]).length).toBe(examples.length);
    });
});
