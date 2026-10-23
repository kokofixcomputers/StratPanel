import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';

export interface UserRow {
    id: number;
    email: string;
    username: string;
    name_first: string;
    name_last: string;
    use_totp: boolean;
    root_admin: boolean;
    servers: number;
    subuser_of: number;
    gravatar: string;
    roles: { id: number; name: string; color: string }[];
}

export interface UserInput {
    email: string;
    username: string;
    name_first: string;
    name_last: string;
    language: string;
    password: string;
    root_admin: boolean;
}

export interface PoolNumbers {
    memory: number;
    disk: number;
    cpu: number;
    allocations: number;
    backups: number;
}

export interface UserPool {
    enabled: boolean;
    // Somebody who may create servers in the admin area is not limited by a pool.
    unlimited: boolean;
    defaults: PoolNumbers;
    limits: PoolNumbers;
    used: PoolNumbers;
    own: Record<keyof PoolNumbers, number | null>;
}

export interface UserRole {
    id: number;
    name: string;
    description: string | null;
    color: string;
    assigned: boolean;
    assignable: boolean;
}

export interface UserDetails {
    user: Omit<UserInput, 'password'> & { id: number };
    languages: Record<string, string>;
    can_change: boolean;
    roles: UserRole[];
    pool: UserPool;
}

export const useUsers = (search: string, page: number) =>
    useSWR<{ users: UserRow[]; pagination: PaginationDataSet }, AxiosError>(
        `admin:users:${search}:${page}`,
        async () => {
            const { data } = await http.get('/api/client/admin/users', { params: { search, page } });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const useUserMeta = () =>
    useSWR<{ languages: Record<string, string>; locale: string }, AxiosError>(
        'admin:users:meta',
        async () => (await http.get('/api/client/admin/users/meta')).data,
        { revalidateOnFocus: false }
    );

export const useUser = (id: string | undefined) =>
    useSWR<UserDetails, AxiosError>(
        id ? `admin:users:${id}` : null,
        async () => (await http.get(`/api/client/admin/users/${id}`)).data,
        {
            revalidateOnFocus: false,
        }
    );

export const createUser = async (input: UserInput): Promise<{ id: number }> =>
    (await http.post('/api/client/admin/users', input)).data;

export const updateUser = (id: number, input: UserInput) => http.patch(`/api/client/admin/users/${id}`, input);

export const deleteUser = (id: number) => http.delete(`/api/client/admin/users/${id}`);

export const syncRoles = (id: number, roles: number[]) => http.put(`/api/client/admin/users/${id}/roles`, { roles });

export const updatePool = (id: number, pool: Record<keyof PoolNumbers, string>) =>
    http.patch(`/api/client/admin/users/${id}/pool`, pool);
