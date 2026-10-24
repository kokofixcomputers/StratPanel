import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';
import { Level } from '@/lib/adminFormat';

export interface NodeRow {
    id: number;
    name: string;
    location: string;
    memory: number;
    disk: number;
    servers: number;
    secure: boolean;
    public: boolean;
    maintenance: boolean;
}

export interface Usage {
    value: number;
    max: number;
    percent: number;
    level: Level;
}

export interface NodeDetails {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    location: { id: number; short: string; long: string };
    location_id: number;
    public: boolean;
    fqdn: string;
    scheme: 'http' | 'https';
    behind_proxy: boolean;
    maintenance_mode: boolean;
    cpu_burst_enabled: boolean;
    cpu_burst_percent: number;
    memory: number;
    memory_overallocate: number;
    disk: number;
    disk_overallocate: number;
    upload_size: number;
    daemonListen: number;
    daemonSFTP: number;
    daemonBase: string;
    servers: number;
    usage: { memory: Usage; disk: Usage };
    wings_latest: string | null;
}

export interface NodeInput {
    name: string;
    description: string;
    location_id: string;
    public: boolean;
    fqdn: string;
    scheme: 'http' | 'https';
    behind_proxy: boolean;
    maintenance_mode: boolean;
    cpu_burst_enabled: boolean;
    cpu_burst_percent: string;
    memory: string;
    memory_overallocate: string;
    disk: string;
    disk_overallocate: string;
    upload_size: string;
    daemonListen: string;
    daemonSFTP: string;
    daemonBase: string;
    reset_secret?: boolean;
}

export interface SystemInformation {
    online: boolean;
    error?: string;
    version?: string;
    system?: { type: string; arch: string; release: string; cpus: number };
}

export interface Allocation {
    id: number;
    ip: string;
    ip_alias: string | null;
    port: number;
    server: { id: number; name: string } | null;
}

export interface NodeCertificateState {
    ok?: boolean;
    message?: string;
    node: {
        id: number;
        fqdn: string;
        scheme: string;
        port: number;
        certificate_id: number | null;
        certificate_auto: boolean;
        pushed_at: string | null;
        error: string | null;
    };
    certificates: { id: number; name: string; domains: string[]; covers: boolean }[];
    candidate: { id: number; name: string } | null;
    assigned: { id: number; name: string; fingerprint: string } | null;
    live: {
        present: boolean;
        error?: string;
        certificate?: { fingerprint: string; names: string[]; source: string; not_after: string; not_before: string };
    };
}

const base = '/api/client/admin/nodes';

export const useNodes = (search: string, page: number) =>
    useSWR<{ nodes: NodeRow[]; pagination: PaginationDataSet; wings_latest: string | null }, AxiosError>(
        ['admin:nodes', search, page],
        async () => {
            const { data } = await http.get(base, { params: { search: search || undefined, page } });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const useNodeForm = () =>
    useSWR<{ locations: { id: number; short: string; long: string }[]; secure: boolean }, AxiosError>(
        'admin:nodes:form',
        async () => (await http.get(`${base}/form`)).data,
        { revalidateOnFocus: false }
    );

export const useNode = (id: string) =>
    useSWR<NodeDetails, AxiosError>(`admin:nodes:${id}`, async () => (await http.get(`${base}/${id}`)).data, {
        revalidateOnFocus: false,
    });

/** What Wings on the node says; asked again every few seconds so the page shows whether it is up. */
export const useSystemInformation = (id: number | string) =>
    useSWR<SystemInformation, AxiosError>(
        `admin:nodes:${id}:system`,
        async () => (await http.get(`${base}/${id}/system-information`)).data,
        { refreshInterval: 10000, revalidateOnFocus: false }
    );

const body = (input: NodeInput) => ({
    ...input,
    description: input.description,
    behind_proxy: input.behind_proxy,
});

export const createNode = async (input: NodeInput): Promise<NodeDetails> => (await http.post(base, body(input))).data;

export const updateNode = async (id: number, input: NodeInput): Promise<NodeDetails> =>
    (await http.patch(`${base}/${id}`, body(input))).data;

export const deleteNode = async (id: number): Promise<void> => {
    await http.delete(`${base}/${id}`);
};

export const updateWings = async (id: number): Promise<{ status: string; message: string }> =>
    (await http.post(`${base}/${id}/update`)).data;

export const updateAllWings = async (): Promise<{ results: { name: string; message: string }[] }> =>
    (await http.post(`${base}/update`, {}, { timeout: 0 })).data;

export const useNodeConfiguration = (id: string) =>
    useSWR<{ yaml: string; panel_url: string; insecure: boolean }, AxiosError>(
        `admin:nodes:${id}:configuration`,
        async () => (await http.get(`${base}/${id}/configuration`)).data,
        { revalidateOnFocus: false }
    );

export const createDeployToken = async (id: number): Promise<{ node: number; token: string }> =>
    (await http.post(`${base}/${id}/configuration/token`)).data;

export const useAllocations = (id: string, page: number) =>
    useSWR<{ allocations: Allocation[]; pagination: PaginationDataSet; ips: string[] }, AxiosError>(
        ['admin:nodes:allocations', id, page],
        async () => {
            const { data } = await http.get(`${base}/${id}/allocations`, { params: { page } });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const addAllocations = async (
    id: number,
    input: { allocation_ip: string; allocation_alias: string; allocation_ports: string[] }
): Promise<void> => {
    await http.post(`${base}/${id}/allocations`, input);
};

export const setAlias = async (id: number, allocation: number, alias: string): Promise<void> => {
    await http.post(`${base}/${id}/allocations/alias`, { allocation_id: allocation, alias });
};

export const removeAllocation = async (id: number, allocation: number): Promise<void> => {
    await http.delete(`${base}/${id}/allocations/${allocation}`);
};

export const removeAllocations = async (id: number, allocations: number[]): Promise<void> => {
    await http.delete(`${base}/${id}/allocations`, { data: { allocations } });
};

export const removeBlock = async (id: number, ip: string): Promise<void> => {
    await http.post(`${base}/${id}/allocations/remove-block`, { ip });
};

export const useNodeServers = (id: string, page: number) =>
    useSWR<
        {
            servers: {
                id: number;
                uuid_short: string;
                name: string;
                owner: { id: number; username: string };
                nest: string;
                egg: string;
            }[];
            pagination: PaginationDataSet;
        },
        AxiosError
    >(
        ['admin:nodes:servers', id, page],
        async () => {
            const { data } = await http.get(`${base}/${id}/servers`, { params: { page } });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const useNodeCertificate = (id: string) =>
    useSWR<NodeCertificateState, AxiosError>(
        `admin:nodes:${id}:certificate`,
        async () => (await http.get(`${base}/${id}/certificate`)).data,
        { revalidateOnFocus: false }
    );

export const chooseCertificate = async (id: number, certificate: string): Promise<NodeCertificateState> =>
    (await http.patch(`${base}/${id}/certificate`, { certificate })).data;

export const pushCertificate = async (id: number, confirm: boolean): Promise<NodeCertificateState> =>
    (await http.post(`${base}/${id}/certificate/push`, { confirm })).data;

export const enableHttps = async (id: number, confirm: boolean): Promise<NodeCertificateState> =>
    (await http.post(`${base}/${id}/certificate/enable`, { confirm })).data;
