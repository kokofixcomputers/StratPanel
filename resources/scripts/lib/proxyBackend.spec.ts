import { isLimboProperties, setLimboVelocity, setPaperVelocity, yamlText } from '@/lib/proxyBackend';

const paper = `# Paper global configuration
_version: 29

proxies:
  bungee-cord:
    online-mode: true
  proxy-protocol: false
  velocity:
    enabled: false
    online-mode: false
    secret: ''
timings:
  enabled: true
`;

describe('lib/proxyBackend', function () {
    it('turns velocity on with the secret and keeps the rest of the file', function () {
        const out = setPaperVelocity(paper, 'Ui4MjRMJU5LT');

        expect(out).toContain(
            '  velocity:\n    enabled: true\n    online-mode: true\n    secret: Ui4MjRMJU5LT\ntimings:'
        );
        expect(out).toContain('# Paper global configuration');
        expect(out).toContain('  bungee-cord:\n    online-mode: true\n  proxy-protocol: false');
        expect(out.endsWith('timings:\n  enabled: true\n')).toBe(true);
    });

    it('is the same the second time', function () {
        const once = setPaperVelocity(paper, 'abc');

        expect(setPaperVelocity(once, 'abc')).toBe(once);
        expect(setPaperVelocity(once, 'xyz')).toContain('secret: xyz');
    });

    it('adds what is missing', function () {
        const bare = 'proxies:\n  velocity:\n    enabled: false\n  proxy-protocol: false\nother: 1\n';

        expect(setPaperVelocity(bare, 'abc')).toBe(
            'proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: abc\n  proxy-protocol: false\nother: 1\n'
        );
        expect(setPaperVelocity('proxies:\n  proxy-protocol: false\n', 'abc')).toBe(
            'proxies:\n  proxy-protocol: false\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: abc\n'
        );
        expect(setPaperVelocity('_version: 1\n', 'abc')).toBe(
            '_version: 1\nproxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: abc\n'
        );
    });

    it('keeps a comment at the end of a line and the line endings', function () {
        expect(setPaperVelocity('proxies:\r\n  velocity:\r\n    enabled: false # on?\r\n', 'abc')).toBe(
            'proxies:\r\n  velocity:\r\n    enabled: true # on?\r\n    online-mode: true\r\n    secret: abc\r\n'
        );
    });

    it('quotes a secret that would not be read as text', function () {
        expect(yamlText('Ui4MjRMJU5LT')).toBe('Ui4MjRMJU5LT');
        expect(yamlText('12345')).toBe("'12345'");
        expect(yamlText('true')).toBe("'true'");
        expect(yamlText("it's")).toBe("'it''s'");
    });

    it('sets LooHP Limbo up in its server.properties', function () {
        const limbo = 'server-port=25565\nvelocity-modern=false\nforwarding-secrets=\nbungeecord=false\n';

        expect(isLimboProperties(limbo)).toBe(true);
        expect(isLimboProperties('online-mode=true\nmotd=A Minecraft Server\n')).toBe(false);
        expect(setLimboVelocity(limbo, 'Ui4MjRMJU5LT')).toBe(
            'server-port=25565\nvelocity-modern=true\nforwarding-secrets=Ui4MjRMJU5LT\nbungeecord=false\n'
        );
        expect(setLimboVelocity('server-port=25565\n', 'abc')).toBe(
            'server-port=25565\nvelocity-modern=true\nforwarding-secrets=abc\n'
        );
    });
});
