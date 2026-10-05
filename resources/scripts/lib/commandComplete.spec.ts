import { commonPrefix, complete } from './commandComplete';

describe('console command completion', () => {
    it('suggests commands that start with what was typed', () => {
        const { items } = complete('gam');
        expect(items).toEqual(expect.arrayContaining(['gamemode', 'gamerule']));
        expect(items).not.toContain('tp');
    });

    it('suggests selectors for tp and coordinates alongside them', () => {
        expect(complete('tp ').items).toEqual(expect.arrayContaining(['@a', '@e', '@p', '@r', '@s', '@n']));
        expect(complete('tp @a ').items).toEqual(expect.arrayContaining(['@p', '~']));
        expect(complete('tp @a ').start).toBe(6);
    });

    it('completes sub commands', () => {
        expect(complete('time set ').items).toEqual(expect.arrayContaining(['day', 'night', 'noon', 'midnight']));
        expect(complete('gamemode ').items).toEqual(['survival', 'creative', 'adventure', 'spectator']);
        expect(complete('paper ').items).toEqual(expect.arrayContaining(['version', 'mobcaps', 'dumpitem']));
    });

    it('follows execute chains and run', () => {
        expect(complete('execute as @a at @s ').items).toEqual(expect.arrayContaining(['run', 'if', 'positioned']));
        expect(complete('execute as @a run gamemode c').items).toEqual(['creative']);
    });

    it('ignores a leading slash, aliases and unknown commands', () => {
        expect(complete('/tele').items).toEqual(['teleport']);
        expect(complete('xp add @a 5 ').items).toEqual(['points', 'levels']);
        expect(complete('nope ').items).toEqual([]);
    });

    it('hints at the next value when it cannot be completed', () => {
        expect(complete('say ').hint).toBe('message');
    });

    it('finds the common prefix', () => {
        expect(commonPrefix(['gamemode', 'gamerule'])).toBe('game');
        expect(commonPrefix([])).toBe('');
    });
});
