import { pageWindow } from './pageWindow';
import { readQuery } from './useContentQuery';

describe('pageWindow', () => {
    it('shows every page when there are few', () => {
        expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
    });

    it('keeps the first, the last and the pages around the current one', () => {
        expect(pageWindow(1, 382)).toEqual([1, 2, 3, null, 382]);
        expect(pageWindow(100, 382)).toEqual([1, null, 98, 99, 100, 101, 102, null, 382]);
        expect(pageWindow(382, 382)).toEqual([1, null, 380, 381, 382]);
    });
});

describe('readQuery', () => {
    it('has sensible defaults', () => {
        expect(readQuery('', '1.21.4')).toEqual({
            kind: 'plugin',
            query: '',
            categories: [],
            loader: '',
            version: '1.21.4',
            serverSide: false,
            sort: 'relevance',
            page: 1,
            view: 'browse',
        });
    });

    it('hides client side mods by default, until it is turned off', () => {
        expect(readQuery('?t=mod', '').serverSide).toBe(true);
        expect(readQuery('?t=mod&e=0', '').serverSide).toBe(false);
        expect(readQuery('?t=datapack&e=1', '').serverSide).toBe(true);
    });

    it('reads the filters out of the address', () => {
        expect(
            readQuery('?t=mod&q=map&c=library,utility&l=fabric&v=1.20.1&o=downloads&p=3&view=installed', '1.21.4')
        ).toMatchObject({
            kind: 'mod',
            query: 'map',
            categories: ['library', 'utility'],
            loader: 'fabric',
            version: '1.20.1',
            sort: 'downloads',
            page: 3,
            view: 'installed',
        });
    });

    it('means any version by "all" and the server version by nothing', () => {
        expect(readQuery('?v=all', '1.21.4').version).toBe('');
        expect(readQuery('', '1.21.4').version).toBe('1.21.4');
    });

    it('ignores what it does not know', () => {
        expect(readQuery('?t=shader&o=nonsense&p=-4', '')).toMatchObject({
            kind: 'plugin',
            sort: 'relevance',
            page: 1,
        });
    });
});
