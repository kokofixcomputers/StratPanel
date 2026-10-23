import { plural, sizeMiB } from '@/lib/adminFormat';

describe('sizeMiB', () => {
    it('says MiB below a GiB and GiB with one decimal above', () => {
        expect(sizeMiB(512)).toBe('512 MiB');
        expect(sizeMiB(1024)).toBe('1 GiB');
        expect(sizeMiB(1536)).toBe('1.5 GiB');
        expect(sizeMiB(10240)).toBe('10 GiB');
        expect(sizeMiB(0)).toBe('0 MiB');
    });
});

describe('plural', () => {
    it('adds an s unless there is one', () => {
        expect(plural(1, 'admin')).toBe('1 admin');
        expect(plural(0, 'admin')).toBe('0 admins');
        expect(plural(2, 'person', 'people')).toBe('2 people');
    });
});
