import { clampToPool, fitsPool, poolAfter } from '@/lib/pool';

const REMAINING = { memory: 3072, disk: 8192, cpu: 150, allocations: 3 };
const MINIMUM = { memory: 512, disk: 1024, cpu: 50, allocations: 1 };

describe('poolAfter', () => {
    it('takes the server out of what is left', () => {
        expect(poolAfter(REMAINING, { memory: 1024, disk: 2048, cpu: 100, allocations: 2 })).toEqual({
            memory: 2048,
            disk: 6144,
            cpu: 50,
            allocations: 1,
        });
    });

    it('never goes below zero and counts one allocation when none is chosen', () => {
        expect(
            poolAfter({ memory: 100, disk: 100, cpu: 10, allocations: 1 }, { memory: 512, disk: 1024, cpu: 50 })
        ).toEqual({
            memory: 0,
            disk: 0,
            cpu: 0,
            allocations: 0,
        });
    });
});

describe('fitsPool', () => {
    it('is true up to the last bit and false past it', () => {
        expect(fitsPool(REMAINING, { memory: 3072, disk: 8192, cpu: 150, allocations: 3 })).toBe(true);
        expect(fitsPool(REMAINING, { memory: 3328, disk: 1024, cpu: 50, allocations: 1 })).toBe(false);
        expect(fitsPool(REMAINING, { memory: 512, disk: 1024, cpu: 50, allocations: 4 })).toBe(false);
    });
});

describe('clampToPool', () => {
    it('cuts the usual size down to what is left', () => {
        expect(clampToPool({ memory: 4096, disk: 10240, cpu: 200, allocations: 2 }, REMAINING, MINIMUM)).toEqual({
            memory: 3072,
            disk: 8192,
            cpu: 150,
            allocations: 2,
        });
    });

    it('keeps the least a server can have when almost nothing is left', () => {
        expect(
            clampToPool(
                { memory: 2048, disk: 5120, cpu: 100, allocations: 2 },
                { memory: 100, disk: 0, cpu: 0, allocations: 0 },
                MINIMUM
            )
        ).toEqual({
            memory: 512,
            disk: 1024,
            cpu: 50,
            allocations: 1,
        });
    });
});
