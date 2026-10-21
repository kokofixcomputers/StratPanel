import { connectionAddresses, primaryAddress } from '@/lib/connection';

const allocation = (ip: string, port: number, extra: object = {}) => ({
    ip,
    alias: null,
    port,
    isDefault: false,
    ...extra,
});

describe('connectionAddresses', () => {
    const allocations = [allocation('10.0.0.5', 25566), allocation('10.0.0.5', 25565, { isDefault: true })];

    it('lists the IP address of every allocation, the default one first', () => {
        expect(connectionAddresses({ allocations }).map((a) => a.address)).toEqual([
            '10.0.0.5:25565',
            '10.0.0.5:25566',
        ]);
        expect(connectionAddresses({ allocations })[0].primary).toBe(true);
    });

    it('puts the domains before everything, in the order they were made', () => {
        const list = connectionAddresses({ domains: ['play.example.com', 'survival.example.org'], allocations });
        expect(list.map((a) => a.address)).toEqual([
            'play.example.com',
            'survival.example.org',
            '10.0.0.5:25565',
            '10.0.0.5:25566',
        ]);
        expect(list.slice(0, 2).every((a) => a.kind === 'domain')).toBe(true);
    });

    it('shows the alias of an allocation and then its raw address, once', () => {
        const list = connectionAddresses({
            allocations: [allocation('10.0.0.5', 25565, { alias: 'mc.host.net', isDefault: true })],
        });
        expect(list.map((a) => a.address)).toEqual(['mc.host.net:25565', '10.0.0.5:25565']);
        expect(connectionAddresses({ domains: ['a.com', 'a.com'], allocations: [] })).toHaveLength(1);
    });

    it('prefers a domain for the one address that is shown by itself', () => {
        expect(primaryAddress({ domains: ['play.example.com'], allocations })).toBe('play.example.com');
        expect(primaryAddress({ allocations })).toBe('10.0.0.5:25565');
        expect(primaryAddress({ allocations: [] })).toBeNull();
    });
});
