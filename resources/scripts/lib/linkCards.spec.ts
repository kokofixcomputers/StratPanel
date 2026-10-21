import { columnsFor } from '@/lib/linkCards';

describe('columnsFor', () => {
    it('puts a few links side by side over the whole width', () => {
        expect(columnsFor(1, 5)).toBe(1);
        expect(columnsFor(2, 5)).toBe(2);
        expect(columnsFor(5, 5)).toBe(5);
    });

    it('spreads more links over equal rows', () => {
        expect(columnsFor(6, 5)).toBe(3);
        expect(columnsFor(7, 5)).toBe(4);
        expect(columnsFor(12, 6)).toBe(6);
        expect(columnsFor(9, 2)).toBe(2);
    });
});
