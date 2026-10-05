import { complete } from './commandComplete';
import { buildCommandTree, parseCommandsDocument } from './commandTree';

const doc = JSON.stringify({
    version: 1,
    generatedAt: '2026-10-05T12:00:00Z',
    root: {
        children: [
            {
                name: 'gamemode',
                aliases: ['gm'],
                description: 'Changes a game mode',
                children: [
                    {
                        name: 'mode',
                        type: 'argument',
                        parser: 'minecraft:gamemode',
                        children: [{ name: 'target', type: 'argument', parser: 'minecraft:entity' }],
                    },
                ],
            },
            {
                name: 'warp',
                plugin: 'Essentials',
                description: 'Go to a warp',
                children: [
                    { name: 'name', type: 'argument', parser: 'brigadier:string', suggestions: ['spawn', 'mine'] },
                    { name: 'set', children: [{ name: 'name', type: 'argument', parser: 'brigadier:string' }] },
                ],
            },
            {
                name: 'execute',
                children: [
                    {
                        name: 'as',
                        children: [
                            { name: 'targets', type: 'argument', parser: 'minecraft:entity', redirect: ['execute'] },
                        ],
                    },
                    { name: 'run', redirect: [] },
                ],
            },
        ],
    },
});

describe('commands.json', () => {
    it('rejects files it does not understand', () => {
        expect(parseCommandsDocument('nope')).toBeNull();
        expect(parseCommandsDocument(JSON.stringify({ version: 2, root: { children: [] } }))).toBeNull();
        expect(parseCommandsDocument(JSON.stringify({ version: 1 }))).toBeNull();
    });

    it('completes the commands, aliases and sub commands of the plugin', () => {
        const { tree, count } = buildCommandTree(parseCommandsDocument(doc)!);
        expect(count).toBeGreaterThan(5);

        expect(complete('wa', tree).items).toEqual(['warp']);
        expect(complete('gm ', tree).items).toEqual(['survival', 'creative', 'adventure', 'spectator']);
        expect(complete('gamemode creative ', tree).items).toEqual(expect.arrayContaining(['@a', '@p']));
        expect(complete('warp ', tree).items).toEqual(['set', 'spawn', 'mine']);
        expect(complete('warp set ', tree).hint).toBe('name');
    });

    it('keeps descriptions and follows redirects', () => {
        const { tree } = buildCommandTree(parseCommandsDocument(doc)!);

        expect(complete('wa', tree).descriptions).toEqual({ warp: 'Go to a warp' });
        expect(complete('execute as @a ', tree).items).toEqual(expect.arrayContaining(['as', 'run']));
        expect(complete('execute run warp ', tree).items).toContain('spawn');
    });

    it('skips broken nodes without losing the rest', () => {
        const broken = JSON.stringify({
            version: 1,
            root: { children: [{ nope: true }, { name: 'has space' }, { name: 'ok' }, 5, null] },
        });
        const { tree } = buildCommandTree(parseCommandsDocument(broken)!);

        expect(complete('', tree).items).toEqual(['ok']);
    });
});
