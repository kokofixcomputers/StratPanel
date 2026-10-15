import { getTag, readNbt, Tag, withTag, writeNbt } from '@/lib/nbt';

// The game_rules.dat of a 26.3 world, as the game wrote it.
const GAME_RULES = Uint8Array.from(
    atob(
        'H4sIAAAAAAAA/4VVyY7TQBBtK5wGISSWYRm2YTsgwQdw5gM4cW1V3BW7SS+mu50QTnwTX8hrxxO3HSSkkTJJlatevXqvfCHEhbilKFElrq12XAfapM+xo72Te3KKg3aNTIHwX6wq8XBKWhtfb6UKvsuBZ1MgsOprVlLxum+kdhsvKvG8qN76PYKUWmk5Rmo4F3i+aM9BDh2i3PuwRcLjJT7rXUxHWJdTLLkk+WdnvBrKvpwinaEDqlq/Y8vIqluuc+GrKUVby0pTYhl4aALkb5cjD9Wj9m4YHpPUdJhjiF1gUnKHH2K1Kkez9FOit04HiR8sAo0Q4nElXkw5Gx8aveNMkZJH0AvqN2SMVGRB3XzEyE7J2luL1ckNs1rTMGKBoDF+TUZG3yOFdwCzoInNAfte0rQSH4r+OrAch4Q0dB8lhaHgES5G+l2JR8UDgfkXT5DfTSFHqQ8A1DIZKCJww9g9JfCLxNcFdX79b+pX4uNyyVE6Ti2W3fmQUFzxhnqT8Ikw0H2txP155X/o2PhGksL3G0YXSsuPNUHzBktE5MG5Ptf5iTsFuF1XzQQVO64TJQ/A49gMvnu3zbJ5dz5VNMxddmTHocZywCamUSvx6X8M1FhWOqrqSMG8QdbljW4i/+jZ1SwNuya1sAD+nky5pHaUw/tsYQ4odD0vdLSJ9UpvdD1sMkIQYlU6rWwIwW/jWRtsZO/yrCfVFB65efTYyvep69PcIwhkYuWaAgJvFudnnGEQ+OkIrcobMx6AUd8g7KISd4sw6UEPZ1epa8klb3O19/Nxo8uN67q3vRlYgeZ106a8jEo8LaBrqxMO6PAtX4iqVDi8jzoAfrzN45r7OMhiWHbG9aooRzvKfodiQLnbQRxoLmbmOl3NhbnEbMIt1IeDno+GD4f5unqnc2VIjVyDEzDz/0gNpeBNZuaqJNIpb2XS2CPswAp0rObXLl+bkwgKA46H9Ma6l+cSTdry/PzNhHN6t5xB3VNQ7HLVQtt72DOcM4mkYtNd8N9ham04ypqcXMN427HdPJPz6xVOpmCiBF4dW5nJz7aq4JbbX/Be/jZuS9z7I/4C5vArhq4HAAA='
    ),
    (c) => c.charCodeAt(0)
);

describe('readNbt', () => {
    it('reads the game rules of a real world', () => {
        const file = readNbt(GAME_RULES);

        expect(file.name).toBe('');
        expect(getTag(file.root, 'DataVersion')).toEqual({ t: 3, v: 4786 });
        expect(getTag(file.root, 'data', 'minecraft:pvp')).toEqual({ t: 1, v: 1 });
        expect(getTag(file.root, 'data', 'minecraft:random_tick_speed')).toEqual({ t: 3, v: 3 });
        expect(getTag(file.root, 'data', 'minecraft:keep_inventory')).toEqual({ t: 1, v: 0 });
        expect(getTag(file.root, 'data', 'minecraft:nothing')).toBeUndefined();
    });

    it('refuses what is not NBT or is cut off', () => {
        expect(() => readNbt(new Uint8Array([1, 2, 3]))).toThrow();
        expect(() => readNbt(writeNbt(readNbt(GAME_RULES), false).slice(0, 40))).toThrow();
    });
});

describe('writeNbt', () => {
    it('writes a file that reads back the same, with the entries in the same order', () => {
        const original = readNbt(GAME_RULES);
        const again = readNbt(writeNbt(original));

        expect(again).toEqual(original);
        expect([...(getTag(again.root, 'data') as any).v.keys()]).toEqual([
            ...(getTag(original.root, 'data') as any).v.keys(),
        ]);
    });

    it('keeps every kind of tag', () => {
        const root: Tag = {
            t: 10,
            v: new Map<string, Tag>([
                ['byte', { t: 1, v: -5 }],
                ['short', { t: 2, v: -300 }],
                ['int', { t: 3, v: 123456 }],
                ['long', { t: 4, v: BigInt('-9223372036854775808') }],
                ['float', { t: 5, v: 1.5 }],
                ['double', { t: 6, v: 2.25 }],
                ['bytes', { t: 7, v: new Int8Array([1, -2, 3]) }],
                ['text', { t: 8, v: 'héllo' }],
                [
                    'list',
                    {
                        t: 9,
                        item: 3,
                        v: [
                            { t: 3, v: 1 },
                            { t: 3, v: 2 },
                        ],
                    },
                ],
                ['ints', { t: 11, v: new Int32Array([7, 8]) }],
                ['longs', { t: 12, v: new BigInt64Array([BigInt(1), BigInt(2)]) }],
                ['nested', { t: 10, v: new Map<string, Tag>([['a', { t: 1, v: 1 }]]) }],
            ]),
        };

        expect(readNbt(writeNbt({ name: 'Data', root }, false))).toEqual({ name: 'Data', root });
        expect(readNbt(writeNbt({ name: '', root }))).toEqual({ name: '', root });
    });
});

describe('withTag', () => {
    it('changes one tag in a copy and leaves the original alone', () => {
        const file = readNbt(GAME_RULES);
        const changed = withTag(file.root, ['data', 'minecraft:pvp'], { t: 1, v: 0 });

        expect(getTag(changed, 'data', 'minecraft:pvp')).toEqual({ t: 1, v: 0 });
        expect(getTag(file.root, 'data', 'minecraft:pvp')).toEqual({ t: 1, v: 1 });
        expect(getTag(changed, 'data', 'minecraft:raids')).toEqual({ t: 1, v: 1 });
    });

    it('does not make up a tag that is not there', () => {
        expect(() => withTag(readNbt(GAME_RULES).root, ['data', 'minecraft:nope'], { t: 1, v: 1 })).toThrow();
    });
});
