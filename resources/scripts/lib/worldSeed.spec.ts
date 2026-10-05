import { gzipSync } from 'fflate';
import { parseNbt, seedFromNbt } from '@/lib/worldSeed';

const enc = new TextEncoder();
const str = (s: string) => {
    const b = enc.encode(s);

    return [b.length >> 8, b.length & 255, ...b];
};
const long = (n: bigint) =>
    Array.from({ length: 8 }, (_, i) => Number((BigInt.asUintN(64, n) >> BigInt(56 - i * 8)) & BigInt('255')));
const named = (type: number, name: string, body: number[]) => [type, ...str(name), ...body];
const compound = (name: string, ...children: number[][]) => named(10, name, [...children.flat(), 0]);

describe('worldSeed', () => {
    it('reads data.seed from a world_gen_settings file', () => {
        const seed = BigInt('3618440937952319688');
        const bytes = new Uint8Array(
            compound('', named(3, 'DataVersion', [0, 0, 0, 1]), compound('data', named(4, 'seed', long(seed))))
        );

        expect(seedFromNbt(parseNbt(bytes))).toBe('3618440937952319688');
    });

    it('keeps negative seeds exact', () => {
        const bytes = new Uint8Array(
            compound('', compound('data', named(4, 'seed', long(BigInt('-9007199254740993')))))
        );

        expect(seedFromNbt(parseNbt(bytes))).toBe('-9007199254740993');
    });

    it('reads Data.WorldGenSettings.seed from level.dat', () => {
        const bytes = new Uint8Array(
            compound(
                '',
                compound(
                    'Data',
                    named(8, 'LevelName', str('world')),
                    compound('WorldGenSettings', named(4, 'seed', long(BigInt('42'))))
                )
            )
        );

        expect(seedFromNbt(parseNbt(bytes))).toBe('42');
    });

    it('reads the old Data.RandomSeed and skips arrays and lists on the way', () => {
        const bytes = new Uint8Array(
            compound(
                '',
                compound(
                    'Data',
                    named(7, 'bytes', [0, 0, 0, 2, 1, 2]),
                    named(11, 'ints', [0, 0, 0, 1, 0, 0, 0, 5]),
                    named(9, 'list', [3, 0, 0, 0, 1, 0, 0, 0, 9]),
                    named(4, 'RandomSeed', long(BigInt('-5')))
                )
            )
        );

        expect(seedFromNbt(parseNbt(bytes))).toBe('-5');
    });

    it('is null without a seed', () => {
        expect(
            seedFromNbt(parseNbt(new Uint8Array(compound('', compound('Data', named(3, 'x', [0, 0, 0, 1]))))))
        ).toBeNull();
    });

    it('survives a gzip round trip', () => {
        const raw = new Uint8Array(compound('', compound('data', named(4, 'seed', long(BigInt('7'))))));

        expect(gzipSync(raw)[0]).toBe(0x1f);
    });
});
