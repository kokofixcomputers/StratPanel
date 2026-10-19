/** @jest-environment node */
import { PaletteItem, rankItems, scoreItem, verbItems } from '@/lib/palette';

// The admin pages cannot use the React code, so their search is a plain script. This keeps the two matching the same.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plain = require('../../../public/js/admin-palette.js');

const items: PaletteItem[] = [
    {
        id: '1',
        label: 'Update the panel',
        hint: 'Admin action',
        group: 'Admin',
        words: 'update upgrade install',
        icon: 'plus',
        action: { type: 'go', to: '/' },
    },
    {
        id: '2',
        label: 'Updates',
        hint: 'Admin',
        group: 'Admin',
        words: 'version nightly',
        icon: 'admin',
        action: { type: 'go', to: '/' },
    },
    {
        id: '3',
        label: 'Survival SMP',
        hint: 'Frankfurt',
        group: 'Servers',
        words: '10.0.0.5:25565 play',
        icon: 'server',
        action: { type: 'go', to: '/' },
    },
    {
        id: '4',
        label: 'Creative Plots',
        hint: 'Dallas',
        group: 'Servers',
        words: 'minigames',
        icon: 'server',
        action: { type: 'go', to: '/' },
    },
    {
        id: '5',
        label: 'Dashboard',
        hint: 'Your servers',
        group: 'Go to',
        words: 'home',
        icon: 'server',
        action: { type: 'go', to: '/' },
    },
    {
        id: '6',
        label: 'API credentials',
        group: 'Account',
        words: 'keys token',
        icon: 'user',
        action: { type: 'go', to: '/' },
    },
];

describe('the plain admin search matches like the React one', () => {
    it.each([
        '',
        'up',
        'update',
        'update panel',
        'surv',
        'smp',
        '25565',
        'bkups',
        'cred',
        'dash',
        'nothing',
        'servers',
        'zz',
    ])('scores "%s"', (query) => {
        for (const item of items) expect(plain.scoreItem(item, query)).toBe(scoreItem(item, query));
    });

    it.each(['', 'up', 'survival', 'servers', 'a'])('ranks "%s" in the same order', (query) => {
        const ids = (sections: { items: { id: string }[] }[]) => sections.map((s) => s.items.map((i) => i.id));
        expect(ids(plain.rankItems(items, query))).toEqual(ids(rankItems(items, query)));
    });

    it('reads "restart name" the same way', () => {
        const servers = [
            {
                id: 'a',
                uuid: 'u1',
                name: 'Survival SMP',
                node: 'Frankfurt',
                internalId: 1,
                description: '',
                address: '',
                canControl: { start: true, stop: true, restart: true },
            },
            {
                id: 'b',
                uuid: 'u2',
                name: 'Locked',
                node: 'x',
                internalId: 2,
                description: '',
                address: '',
                canControl: { start: false, stop: false, restart: false },
            },
        ];
        const labels = (list: { label: string }[]) => list.map((i) => i.label);
        expect(labels(plain.verbItems('restart surv', servers, jest.fn()))).toEqual(
            labels(verbItems('restart surv', servers, jest.fn()))
        );
        expect(plain.verbItems('restart lock', servers, jest.fn())).toEqual([]);
        expect(plain.verbItems('nothing', servers, jest.fn())).toEqual([]);
    });
});
