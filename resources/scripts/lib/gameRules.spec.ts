import { parseRuleNumber, readGameRules, setGameRule } from '@/lib/gameRules';
import { NbtFile, Tag } from '@/lib/nbt';

const file = (entries: [string, Tag][], extra: [string, Tag][] = []): NbtFile => ({
    name: '',
    root: {
        t: 10,
        v: new Map<string, Tag>([
            ['data', { t: 10, v: new Map(entries) }],
            ['DataVersion', { t: 3, v: 4786 }],
            ...extra,
        ]),
    },
});

const sample = () =>
    file([
        ['minecraft:pvp', { t: 1, v: 1 }],
        ['minecraft:keep_inventory', { t: 1, v: 0 }],
        ['minecraft:random_tick_speed', { t: 3, v: 3 }],
        ['minecraft:some_new_rule', { t: 1, v: 1 }],
        ['minecraft:odd', { t: 4, v: BigInt(5) }],
    ]);

describe('readGameRules', () => {
    it('lists switches and numbers with their labels and groups', () => {
        const { rules, dataVersion } = readGameRules(sample());

        expect(dataVersion).toBe(4786);
        expect(rules.map((r) => r.key)).toEqual([
            'minecraft:pvp',
            'minecraft:keep_inventory',
            'minecraft:random_tick_speed',
            'minecraft:some_new_rule',
        ]);
        expect(rules[0]).toMatchObject({ id: 'pvp', label: 'Pvp', group: 'Players', kind: 'boolean', value: true });
        expect(rules[1].value).toBe(false);
        expect(rules[2]).toMatchObject({ kind: 'integer', value: 3, group: 'World' });
    });

    it('lists a rule it does not know under Other, with a readable name', () => {
        const rule = readGameRules(sample()).rules.find((r) => r.id === 'some_new_rule')!;

        expect(rule).toMatchObject({ label: 'Some new rule', group: 'Other', description: '' });
    });

    it('survives a file without rules', () => {
        expect(readGameRules({ name: '', root: { t: 10, v: new Map() } })).toEqual({ rules: [], dataVersion: null });
    });
});

describe('setGameRule', () => {
    it('changes a switch and keeps it a byte', () => {
        const changed = setGameRule(sample(), 'minecraft:keep_inventory', true);

        expect((changed.root as any).v.get('data').v.get('minecraft:keep_inventory')).toEqual({ t: 1, v: 1 });
    });

    it('changes a number and keeps it an int, and leaves everything else as it was', () => {
        const original = sample();
        const changed = setGameRule(original, 'minecraft:random_tick_speed', 20);
        const data = (changed.root as any).v.get('data').v;

        expect(data.get('minecraft:random_tick_speed')).toEqual({ t: 3, v: 20 });
        expect(data.get('minecraft:odd')).toEqual({ t: 4, v: BigInt(5) });
        expect((original.root as any).v.get('data').v.get('minecraft:random_tick_speed')).toEqual({ t: 3, v: 3 });
        expect([...data.keys()]).toEqual([...(original.root as any).v.get('data').v.keys()]);
    });

    it('refuses the wrong kind of value and rules it cannot edit', () => {
        expect(() => setGameRule(sample(), 'minecraft:pvp', 3)).toThrow();
        expect(() => setGameRule(sample(), 'minecraft:random_tick_speed', 1.5)).toThrow();
        expect(() => setGameRule(sample(), 'minecraft:random_tick_speed', 3e10)).toThrow();
        expect(() => setGameRule(sample(), 'minecraft:odd', 1)).toThrow();
        expect(() => setGameRule(sample(), 'minecraft:missing', true)).toThrow();
    });
});

describe('parseRuleNumber', () => {
    it('takes whole numbers the game can store', () => {
        expect(parseRuleNumber('24')).toBe(24);
        expect(parseRuleNumber(' -1 ')).toBe(-1);
        expect(parseRuleNumber('2147483647')).toBe(2147483647);
        expect(parseRuleNumber('2147483648')).toBeNull();
        expect(parseRuleNumber('1.5')).toBeNull();
        expect(parseRuleNumber('')).toBeNull();
        expect(parseRuleNumber('abc')).toBeNull();
    });
});
