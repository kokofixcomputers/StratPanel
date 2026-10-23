import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export type State = 'grant' | 'deny' | 'default';

export interface RoleSummary {
    id: number;
    name: string;
    description: string | null;
    color: string;
    permissions: number;
    denied: number;
    users: number;
}

export interface PermissionInfo {
    key: string;
    label: string;
    // The "see" permission of its group that comes with it.
    needs: string | null;
    // What everybody can do by default, as opposed to an admin permission.
    everybody: boolean;
}

export interface PermissionGroup {
    id: string;
    label: string;
    description: string;
    permissions: PermissionInfo[];
}

export interface Role {
    id: number;
    name: string;
    description: string | null;
    color: string;
    granted: string[];
    denied: string[];
}

export interface Member {
    id: number;
    username: string;
    email: string;
    root_admin: boolean;
    since: string | null;
}

export const useRoles = () =>
    useSWR<{ root_admins: number; roles: RoleSummary[] }, AxiosError>(
        'admin:roles',
        async () => (await http.get('/api/client/admin/roles')).data,
        { revalidateOnFocus: false }
    );

export const usePermissions = () =>
    useSWR<{ groups: PermissionGroup[]; mine: string[] | null }, AxiosError>(
        'admin:roles:permissions',
        async () => (await http.get('/api/client/admin/roles/permissions')).data,
        { revalidateOnFocus: false }
    );

export const useRole = (id: string | undefined) =>
    useSWR<{ role: Role; covers: boolean; members: Member[] }, AxiosError>(
        id ? `admin:roles:${id}` : null,
        async () => (await http.get(`/api/client/admin/roles/${id}`)).data,
        { revalidateOnFocus: false }
    );

export interface RoleInput {
    name: string;
    description: string;
    color: string;
    states: Record<string, State>;
}

export const createRole = async (input: RoleInput): Promise<Role> =>
    (await http.post('/api/client/admin/roles', input)).data;

export const updateRole = async (id: number, input: RoleInput): Promise<Role> =>
    (await http.patch(`/api/client/admin/roles/${id}`, input)).data;

export const deleteRole = (id: number) => http.delete(`/api/client/admin/roles/${id}`);

export const addMember = (id: number, user: string) => http.post(`/api/client/admin/roles/${id}/members`, { user });

export const removeMember = (id: number, user: number) => http.delete(`/api/client/admin/roles/${id}/members/${user}`);

/** What each permission of a role says: the ones it grants and the ones it denies, the rest is the default. */
export const statesOf = (role: Pick<Role, 'granted' | 'denied'>): Record<string, State> => {
    const states: Record<string, State> = {};
    role.granted.forEach((key) => (states[key] = 'grant'));
    role.denied.forEach((key) => (states[key] = 'deny'));

    return states;
};

/**
 * Sets what a role says about one permission. A permission needs the "see" permission of its group, so granting one grants that too, and
 * taking "see" away takes what needed it away (back to the default).
 */
export const setState = (
    states: Record<string, State>,
    groups: PermissionGroup[],
    key: string,
    state: State,
    allowed: (key: string) => boolean = () => true
): Record<string, State> => {
    const next = { ...states, [key]: state };
    const all = groups.reduce<PermissionInfo[]>((list, group) => list.concat(group.permissions), []);
    const info = all.find((p) => p.key === key);

    if (state === 'grant' && info?.needs && next[info.needs] !== 'grant' && allowed(info.needs)) {
        next[info.needs] = 'grant';
    }
    if (state !== 'grant') {
        all.filter((p) => p.needs === key && next[p.key] === 'grant').forEach((p) => (next[p.key] = 'default'));
    }

    return next;
};
