import { backendAddressOf, findLinked, privateAddressOf, publicAddressOf, splitAddress } from '@/lib/proxyLink';

const server = (over: Record<string, any> = {}): any => ({
    uuid: 'a',
    node: 'n1',
    privateAddress: null,
    allocations: [{ ip: '1.2.3.4', alias: null, port: 10681, isDefault: true }],
    ...over,
});

describe('proxyLink', () => {
    it('adds the port of the server to its private address', () => {
        expect(privateAddressOf(server({ privateAddress: '10.180.1.2' }))).toBe('10.180.1.2:10681');
        expect(privateAddressOf(server())).toBeNull();
        expect(publicAddressOf(server())).toBe('1.2.3.4:10681');
    });

    it('uses the private address only when the proxy joined too', () => {
        const backend = server({ privateAddress: '10.180.1.2' });
        expect(backendAddressOf(backend, { privateAddress: '10.180.1.3' })).toBe('10.180.1.2:10681');
        expect(backendAddressOf(backend, { privateAddress: null })).toBe('1.2.3.4:10681');
        expect(backendAddressOf(server(), { privateAddress: '10.180.1.3' })).toBe('1.2.3.4:10681');
    });

    it('splits an address', () => {
        expect(splitAddress('Host.example:25565')).toEqual({ host: 'host.example', port: 25565 });
        expect(splitAddress('nope')).toBeNull();
    });

    it('finds the server an address belongs to', () => {
        const proxy = { uuid: 'p', node: 'n1' };
        const lobby = server({ uuid: 'l', privateAddress: '10.180.1.2' });
        const other = server({
            uuid: 'o',
            node: 'n2',
            allocations: [{ ip: '5.6.7.8', alias: 'play.x.net', port: 25566, isDefault: true }],
        });
        const all = [lobby, other];

        expect(findLinked('10.180.1.2:10681', all, proxy)).toBe(lobby);
        expect(findLinked('1.2.3.4:10681', all, proxy)).toBe(lobby);
        expect(findLinked('127.0.0.1:10681', all, proxy)).toBe(lobby);
        expect(findLinked('127.0.0.1:25566', all, proxy)).toBeNull();
        expect(findLinked('PLAY.x.net:25566', all, proxy)).toBe(other);
        expect(findLinked('10.180.1.2:9999', all, proxy)).toBeNull();
        expect(findLinked('1.2.3.4:10681', [{ ...lobby, uuid: 'p' }], proxy)).toBeNull();
    });
});
