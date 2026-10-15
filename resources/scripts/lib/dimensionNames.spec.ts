import { dimensionInfo, isSafeSegment, javaHashCode, parseSeedInput, readSeed, withSeed } from '@/lib/dimensionNames';
import { NbtFile, Tag } from '@/lib/nbt';

describe('dimensionInfo', () => {
    it('names the three dimensions of the game', () => {
        expect(dimensionInfo('minecraft', 'overworld')).toEqual({ kind: 'overworld', label: 'Overworld' });
        expect(dimensionInfo('minecraft', 'the_nether')).toEqual({ kind: 'nether', label: 'The Nether' });
        expect(dimensionInfo('minecraft', 'the_end')).toEqual({ kind: 'end', label: 'The End' });
    });

    it('writes out the folder name of any other dimension', () => {
        expect(dimensionInfo('minecraft', 'the_aether')).toEqual({ kind: 'custom', label: 'The Aether' });
        expect(dimensionInfo('mymod', 'cave-world')).toEqual({ kind: 'custom', label: 'Cave World (mymod)' });
    });
});

describe('isSafeSegment', () => {
    it('takes folder names and nothing that leaves the folder', () => {
        expect(isSafeSegment('the_nether')).toBe(true);
        expect(isSafeSegment('..')).toBe(false);
        expect(isSafeSegment('a/b')).toBe(false);
        expect(isSafeSegment('')).toBe(false);
        expect(isSafeSegment('a b')).toBe(false);
    });
});

describe('seeds', () => {
    it('hashes text like Java does', () => {
        expect(javaHashCode('hello')).toBe(99162322);
        expect(javaHashCode('')).toBe(0);
        expect(javaHashCode('The quick brown fox jumps over the lazy dog')).toBe(-609428141);
    });

    it('reads numbers as they are and text through the hash', () => {
        expect(parseSeedInput('12345')).toBe(BigInt(12345));
        expect(parseSeedInput(' -77 ')).toBe(BigInt(-77));
        expect(parseSeedInput('9223372036854775807')).toBe(BigInt('9223372036854775807'));
        expect(parseSeedInput('hello')).toBe(BigInt(99162322));
        // Too big for a long, so it is text.
        expect(parseSeedInput('9223372036854775808')).toBe(BigInt(javaHashCode('9223372036854775808')));
        expect(parseSeedInput('   ')).toBeNull();
    });

    it('reads and changes the seed of a world_gen_settings file', () => {
        const file: NbtFile = {
            name: '',
            root: {
                t: 10,
                v: new Map<string, Tag>([
                    [
                        'data',
                        {
                            t: 10,
                            v: new Map<string, Tag>([
                                ['seed', { t: 4, v: BigInt('-4172144997902289642') }],
                                ['generate_features', { t: 1, v: 1 }],
                            ]),
                        },
                    ],
                    ['DataVersion', { t: 3, v: 4786 }],
                ]),
            },
        };

        expect(readSeed(file)).toBe(BigInt('-4172144997902289642'));
        const changed = withSeed(file, BigInt(42));
        expect(readSeed(changed)).toBe(BigInt(42));
        expect(readSeed(file)).toBe(BigInt('-4172144997902289642'));
        expect((changed.root as any).v.get('data').v.get('generate_features')).toEqual({ t: 1, v: 1 });
    });

    it('has nothing to read or change in a file without a seed', () => {
        const file: NbtFile = {
            name: '',
            root: { t: 10, v: new Map<string, Tag>([['data', { t: 10, v: new Map() }]]) },
        };

        expect(readSeed(file)).toBeNull();
        expect(() => withSeed(file, BigInt(1))).toThrow();
    });
});
