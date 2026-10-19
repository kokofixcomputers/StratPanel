import {
    adminItems,
    goToItems,
    hasPermission,
    ListedServer,
    rankItems,
    scoreItem,
    serverActionItems,
    serverItems,
    serverPageItems,
    verbItems,
} from '@/lib/palette';

const server = { id: 'abc123', uuid: 'u-1', name: 'Survival SMP', trash: { enabled: false } };
const listed = (name: string, extra: Partial<ListedServer> = {}): ListedServer => ({
    id: name.toLowerCase().replace(/\W/g, ''),
    uuid: `u-${name}`,
    name,
    node: 'Frankfurt',
    internalId: 7,
    description: '',
    address: '10.0.0.5:25565',
    canControl: { start: true, stop: true, restart: true },
    ...extra,
});

describe('hasPermission', () => {
    it('knows wildcards, any-of and the owner', () => {
        expect(hasPermission([], null)).toBe(true);
        expect(hasPermission(['*'], 'backup.create')).toBe(true);
        expect(hasPermission(['file.read'], 'file.*')).toBe(true);
        expect(hasPermission(['file.read'], 'backup.*')).toBe(false);
        expect(hasPermission(['backup.create'], 'backup.create')).toBe(true);
        expect(hasPermission(['file.sftp'], ['settings.*', 'file.sftp'])).toBe(true);
        expect(hasPermission([], ['settings.*', 'file.sftp'])).toBe(false);
    });
});

describe('scoreItem', () => {
    const [backups] = serverPageItems(server, ['*']).filter((i) => i.label === 'Backups');

    it('needs every word', () => {
        expect(scoreItem(backups, '')).toBeGreaterThan(0);
        expect(scoreItem(backups, 'back')).toBeGreaterThan(scoreItem(backups, 'ups'));
        expect(scoreItem(backups, 'backups survival')).toBeGreaterThan(0);
        expect(scoreItem(backups, 'backups nothing')).toBe(0);
    });

    it('finds by the words that are not in the name, and by letters in order', () => {
        expect(scoreItem(backups, 'snapshot')).toBeGreaterThan(0);
        expect(scoreItem(backups, 'bkups')).toBeGreaterThan(0);
        expect(scoreItem(backups, 'zz')).toBe(0);
    });
});

describe('rankItems', () => {
    const items = [...serverPageItems(server, ['*']), ...goToItems(), ...serverItems([listed('Lobby')], false, '')];

    it('keeps the usual order of the groups when nothing is typed', () => {
        expect(rankItems(items, '').map((s) => s.group)).toEqual(['This server', 'Servers', 'Go to', 'Account']);
    });

    it('puts the group of the best match first', () => {
        expect(rankItems(items, 'lobby')[0].group).toBe('Servers');
        expect(rankItems(items, 'backups')[0].items[0].label).toBe('Backups');
        expect(rankItems(items, 'passkey')[0].items[0].label).toBe('Passkeys');
        expect(rankItems(items, 'qqqq')).toEqual([]);
    });
});

describe('serverPageItems', () => {
    it('lists only what the person may open', () => {
        const labels = serverPageItems(server, ['control.console']).map((i) => i.label);
        expect(labels).toContain('Console');
        expect(labels).toContain('Players');
        expect(labels).not.toContain('Files');
        expect(labels).not.toContain('Trash');
        expect(serverPageItems({ ...server, trash: { enabled: true } }, ['*']).map((i) => i.label)).toContain('Trash');
    });

    it('links to the page of that server', () => {
        const files = serverPageItems(server, ['*']).find((i) => i.label === 'Files')!;
        expect(files.action).toEqual({ type: 'go', to: '/server/abc123/files' });
        expect(serverPageItems(server, ['*']).find((i) => i.label === 'Console')!.action).toEqual({
            type: 'go',
            to: '/server/abc123',
        });
    });
});

describe('serverActionItems', () => {
    it('offers the power actions and a backup, as far as allowed', async () => {
        const power = jest.fn().mockResolvedValue(undefined);
        const backup = jest.fn().mockResolvedValue(undefined);

        const all = serverActionItems(server, ['*'], { power, backup });
        expect(all.map((i) => i.label)).toEqual([
            'Start the server',
            'Restart the server',
            'Stop the server',
            'Kill the server',
            'Back up now',
        ]);
        expect(serverActionItems(server, ['control.start'], { power, backup }).map((i) => i.label)).toEqual([
            'Start the server',
        ]);
        expect(serverActionItems(server, [], { power, backup })).toEqual([]);

        const restart = all.find((i) => i.id === 'power:restart')!;
        expect(restart.action.type).toBe('run');
        if (restart.action.type === 'run') expect(await restart.action.run()).toBe('Restart sent to Survival SMP');
        expect(power).toHaveBeenCalledWith('restart');
    });
});

describe('verbItems', () => {
    const servers = [
        listed('Survival SMP'),
        listed('Creative Plots'),
        listed('Locked', { canControl: { start: false, stop: false, restart: false } }),
    ];

    it('turns "restart surv" into the servers it names', async () => {
        const power = jest.fn().mockResolvedValue(undefined);
        const items = verbItems('restart surv', servers, power);
        expect(items.map((i) => i.label)).toEqual(['Restart Survival SMP']);
        if (items[0].action.type === 'run') await items[0].action.run();
        expect(power).toHaveBeenCalledWith('u-Survival SMP', 'restart');
    });

    it('does nothing for other queries and skips servers the person cannot control', () => {
        expect(verbItems('survival', servers, jest.fn())).toEqual([]);
        expect(verbItems('restart', servers, jest.fn())).toEqual([]);
        expect(verbItems('stop lock', servers, jest.fn())).toEqual([]);
    });
});

describe('serverItems and adminItems', () => {
    it('gives admins the admin page of a server only while searching', () => {
        expect(serverItems([listed('Lobby')], true, '')).toHaveLength(1);
        const found = serverItems([listed('Lobby')], true, 'lob');
        expect(found.map((i) => i.action)).toEqual([
            { type: 'go', to: '/server/lobby' },
            { type: 'open', href: '/admin/servers/view/7' },
        ]);
        expect(serverItems([listed('Lobby')], false, 'lob')).toHaveLength(1);
    });

    it('opens admin pages with a normal page load', () => {
        const [update] = adminItems([
            { id: 'admin:1', label: 'Update the panel', url: '/admin/updates', kind: 'action', words: 'update' },
        ]);
        expect(update.action).toEqual({ type: 'open', href: '/admin/updates' });
        expect(scoreItem(update, 'update')).toBeGreaterThan(0);
        expect(update.hint).toBe('Admin action');
    });
});
