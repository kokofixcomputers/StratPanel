import { PermissionGroup, setState, statesOf } from '@/api/admin/roles';

const groups: PermissionGroup[] = [
    {
        id: 'servers',
        label: 'Servers',
        description: '',
        permissions: [
            { key: 'servers.view', label: 'See', needs: null, everybody: false },
            { key: 'servers.update', label: 'Change', needs: 'servers.view', everybody: false },
            { key: 'servers.delete', label: 'Delete', needs: 'servers.view', everybody: false },
        ],
    },
    {
        id: 'self',
        label: 'Everybody',
        description: '',
        permissions: [{ key: 'self.servers.create', label: 'Create', needs: null, everybody: true }],
    },
];

describe('statesOf', () => {
    it('is grant for what a role grants and deny for what it denies', () => {
        expect(statesOf({ granted: ['servers.view'], denied: ['servers.delete'] })).toEqual({
            'servers.view': 'grant',
            'servers.delete': 'deny',
        });
    });
});

describe('setState', () => {
    it('grants the see permission of the group along with a permission', () => {
        expect(setState({}, groups, 'servers.update', 'grant')).toEqual({
            'servers.update': 'grant',
            'servers.view': 'grant',
        });
    });

    it('takes what needed the see permission away with it, back to the default', () => {
        const states = setState({}, groups, 'servers.delete', 'grant');
        expect(setState(states, groups, 'servers.view', 'default')).toEqual({
            'servers.view': 'default',
            'servers.delete': 'default',
        });
    });

    it('leaves a denial of something else alone when the see permission is denied', () => {
        const states = { 'servers.delete': 'grant' as const, 'self.servers.create': 'deny' as const };
        const next = setState(states, groups, 'servers.view', 'deny');
        expect(next['servers.delete']).toBe('default');
        expect(next['self.servers.create']).toBe('deny');
    });

    it('does not grant the see permission when the person may not give it', () => {
        expect(setState({}, groups, 'servers.update', 'grant', (key) => key !== 'servers.view')).toEqual({
            'servers.update': 'grant',
        });
    });

    it('does not mix up permissions that are not of a group', () => {
        expect(setState({}, groups, 'self.servers.create', 'deny')).toEqual({ 'self.servers.create': 'deny' });
    });
});
