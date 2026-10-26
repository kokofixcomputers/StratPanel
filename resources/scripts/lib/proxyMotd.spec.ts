import { builderToMini, miniToBuilder } from '@/lib/proxyMotd';
import { decodeMotd } from '@/lib/motd';
import { parseVelocity, serializeVelocity } from '@/lib/velocity';

const legacy = (mini: string) => decodeMotd(miniToBuilder(mini).value);

describe('lib/proxyMotd', function () {
    it('reads colours and formats', function () {
        expect(legacy('<green>Hello <bold>world')).toBe('&aHello &lworld');
        expect(legacy('<#09add3>A Velocity Server')).toBe('&#09add3A Velocity Server');
        expect(legacy('<red>a</red>b')).toBe('&ca&rb');
        expect(miniToBuilder('<red>a').exact).toBe(true);
    });

    it('keeps the formats when a colour comes after them, like MiniMessage', function () {
        expect(legacy('<bold><red>x')).toBe('&l&c&lx');
    });

    it('reads two lines, escaped signs and legacy codes', function () {
        expect(legacy('one<newline>two')).toBe('one\ntwo');
        expect(legacy('a \\<3 b')).toBe('a <3 b');
        expect(legacy('&aGreen &lBold')).toBe('&aGreen &lBold');
    });

    it('says when something would be lost', function () {
        expect(miniToBuilder('<gradient:red:blue>Hi').exact).toBe(false);
        expect(legacy('<gradient:red:blue>Hi')).toBe('Hi');
    });

    it('writes MiniMessage from what the builder makes', function () {
        const value = miniToBuilder('<#09add3>A <bold>Velocity</bold> Server<newline><gray>1 < 2').value;

        expect(builderToMini(value)).toBe(
            '<#09add3>A <bold>Velocity<reset><#09add3> Server\n<gray>1 \\< 2'.replace(
                '<reset><#09add3>',
                '<reset><#09add3>'
            )
        );
    });

    it('goes through velocity.toml with a new line in it', function () {
        const toml = 'motd = "<green>Hi"\n';
        const config = parseVelocity(toml);
        config.root.motd = 'one\ntwo "quoted"';
        const written = serializeVelocity(toml, config);

        expect(written).toContain('motd = "one\\ntwo \\"quoted\\""');
        expect(parseVelocity(written).root.motd).toBe('one\ntwo "quoted"');
    });
});
