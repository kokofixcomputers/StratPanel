import { iconFor, SOFTWARE } from '@/lib/mcjars';

describe('SOFTWARE', () => {
    it('has the hybrid servers, one of each', () => {
        const types = SOFTWARE.map((s) => s.type);
        for (const type of ['MOHIST', 'YOUER', 'MAGMA', 'ARCLIGHT'] as const)
            expect(types.filter((t) => t === type)).toHaveLength(1);
        expect(iconFor('MOHIST')).toBe('https://s3.mcjars.app/icons/mohist.png');
    });

    it('marks Quilt as experimental and nothing else', () => {
        expect(SOFTWARE.filter((s) => s.experimental).map((s) => s.type)).toEqual(['QUILT']);
    });

    it('has names that fit what the panel keeps for a software (banners, announcements)', () => {
        for (const s of SOFTWARE) expect(s.type).toMatch(/^[A-Z]{3,12}$/);
    });
});
