import http from '@/api/http';

export interface ServerDomain {
    id: number;
    domain: string;
    allocationId: number;
    allocation: string | null;
    dnsOk: boolean;
}

export interface DomainList {
    domains: ServerDomain[];
    enabled: boolean;
    targetIp: string;
    max: number;
}

export const getDomains = async (uuid: string): Promise<DomainList> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/domains`);

    return {
        domains: (data.data || []).map(
            (d: any): ServerDomain => ({
                id: d.id,
                domain: d.domain,
                allocationId: d.allocation_id,
                allocation: d.allocation,
                dnsOk: d.dns_ok,
            })
        ),
        enabled: data.meta.enabled,
        targetIp: data.meta.target_ip,
        max: data.meta.max,
    };
};

export const createDomain = async (uuid: string, domain: string, allocationId: number): Promise<void> => {
    await http.post(`/api/client/servers/${uuid}/domains`, { domain, allocation_id: allocationId });
};

export const deleteDomain = async (uuid: string, id: number): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/domains/${id}`);
};
