import { isDirty, mostFor, setShare, toDraft, formatAmount } from '@/lib/split';

const minimum = { memory: 512, disk: 1024, cpu: 50 };
const parts = [
    { uuid: 'root', name: 'Main', isRoot: true, memory: 3072, disk: 8192, cpu: 150 },
    { uuid: 'a', name: 'A', isRoot: false, memory: 1024, disk: 2048, cpu: 50 },
];

describe('lib/split', function () {
    it('takes what a part gets from the first server', function () {
        const draft = setShare(toDraft(parts), 'root', 'a', 'memory', 2048, minimum);

        expect(draft.a.memory).toBe(2048);
        expect(draft.root.memory).toBe(2048);
    });

    it('never leaves the first server below the least', function () {
        const draft = setShare(toDraft(parts), 'root', 'a', 'memory', 99999, minimum);

        expect(draft.root.memory).toBe(512);
        expect(draft.a.memory).toBe(3584);
        expect(mostFor(toDraft(parts), 'root', 'a', 'memory', minimum)).toBe(3584);
    });

    it('never gives a part less than the least, and leaves the first server alone', function () {
        const draft = toDraft(parts);

        expect(setShare(draft, 'root', 'a', 'cpu', 0, minimum).a.cpu).toBe(50);
        expect(setShare(draft, 'root', 'root', 'cpu', 80, minimum)).toBe(draft);
    });

    it('knows when something changed, and keeps the total', function () {
        const draft = setShare(toDraft(parts), 'root', 'a', 'disk', 4096, minimum);

        expect(isDirty(toDraft(parts), parts)).toBe(false);
        expect(isDirty(draft, parts)).toBe(true);
        expect(draft.root.disk + draft.a.disk).toBe(10240);
    });

    it('says amounts the way people do', function () {
        expect(formatAmount('memory', 1536)).toBe('1.5 GB');
        expect(formatAmount('disk', 2048)).toBe('2 GB');
        expect(formatAmount('memory', 512)).toBe('512 MB');
        expect(formatAmount('cpu', 150)).toBe('150%');
    });
});
