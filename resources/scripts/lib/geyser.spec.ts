import { applyBedrock, readBedrock } from '@/lib/geyser';

const CONFIG = `# Geyser config
bedrock:
  # The IP address that Geyser will bind on.
  address: 0.0.0.0

  # The port that Geyser will listen on for incoming Bedrock connections.
  port: 19132

  # The UDP port used for NetherNet connections. When set to 0, Geyser uses the "port" value set above.
  webrtc-port: 0

  # How Bedrock players can connect. Changes require a restart.
  transport: raknet

  # The server name
  server-name: "Geyser"

remote:
  address: auto
  port: 25565
`;

const OLD = `bedrock:
  address: 0.0.0.0
  port: 19132
remote:
  port: 25565
`;

describe('readBedrock', () => {
    it('reads the transport and the two ports of the bedrock section only', () => {
        expect(readBedrock(CONFIG)).toEqual({
            transport: 'raknet',
            port: 19132,
            webrtcPort: 0,
            hasTransport: true,
            hasWebrtcPort: true,
        });
    });

    it('knows an older Geyser that only has one port', () => {
        expect(readBedrock(OLD)).toMatchObject({
            port: 19132,
            transport: null,
            hasTransport: false,
            hasWebrtcPort: false,
        });
    });

    it('does not mistake the port of the Java server for the one of Bedrock', () => {
        expect(readBedrock('remote:\n  port: 25565\n').port).toBeNull();
    });
});

describe('applyBedrock', () => {
    it('points RakNet at one allocation and leaves everything else as it was', () => {
        const next = applyBedrock(CONFIG, 'raknet', 25570, null);
        expect(next).toContain('  port: 25570\n');
        expect(next).toContain('  transport: raknet\n');
        expect(next).toContain('  port: 25565\n'); // the Java server in the remote section is not touched
        expect(next).toContain('# The port that Geyser will listen on for incoming Bedrock connections.');
        expect(next.split('\n')).toHaveLength(CONFIG.split('\n').length);
    });

    it('uses the one port for NetherNet and sets the second one to 0', () => {
        const next = applyBedrock(applyBedrock(CONFIG, 'both', 25570, 25571), 'nethernet', 25572, null);
        expect(readBedrock(next)).toMatchObject({ transport: 'nethernet', port: 25572, webrtcPort: 0 });
    });

    it('needs two ports for NetherNet and RakNet together', () => {
        const next = applyBedrock(CONFIG, 'both', 25570, 25571);
        expect(readBedrock(next)).toMatchObject({ transport: 'both', port: 25570, webrtcPort: 25571 });
        expect(() => applyBedrock(CONFIG, 'both', 25570, null)).toThrow(/second port/);
    });

    it('keeps a comment after a value and the line endings', () => {
        const next = applyBedrock('bedrock:\n  port: 19132 # udp\n  transport: raknet\n', 'raknet', 25570, null);
        expect(next).toBe('bedrock:\n  port: 25570 # udp\n  transport: raknet\n');
    });

    it('refuses what it cannot change', () => {
        expect(() => applyBedrock('remote:\n  port: 1\n', 'raknet', 25570, null)).toThrow(/no bedrock section/);
        expect(() => applyBedrock(OLD, 'nethernet', 25570, null)).toThrow(/no NetherNet/);
        expect(applyBedrock(OLD, 'raknet', 25570, null)).toContain('port: 25570');
    });
});
