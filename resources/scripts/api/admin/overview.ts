import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { Level } from '@/lib/adminFormat';

export interface Usage {
    used: number;
    limit: number;
    percent: number;
    level: Level;
}

export interface Overview {
    totals: {
        servers: { total: number; installing: number; suspended: number; failed: number };
        users: { total: number; admins: number; two_factor: number; new: number };
        nodes: { total: number; maintenance: number };
        domains: { total: number };
    };
    capacity: { memory: Usage; disk: Usage; allocations: Usage };
    nodes: {
        id: number;
        name: string;
        fqdn: string;
        location: string | null;
        maintenance: boolean;
        servers: number;
        memory: Usage;
        disk: Usage;
        allocations: Usage;
    }[];
    eggs: { id: number; name: string; servers: number }[];
    recent_servers: { id: number; name: string; owner: string | null; node: string | null; created_at: string }[];
    recent_users: { id: number; username: string; email: string; root_admin: boolean; created_at: string }[];
    activity: { event: string; actor: string | null; ip: string | null; timestamp: string }[];
    links: { discord: string; donations: string };
}

export default () =>
    useSWR<Overview, AxiosError>('admin:overview', async () => (await http.get('/api/client/admin/overview')).data, {
        revalidateOnFocus: false,
    });
