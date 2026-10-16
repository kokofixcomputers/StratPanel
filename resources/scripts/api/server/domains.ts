import http from '@/api/http';

export interface ServerDomain {
    id: number;
    domain: string;
    allocationId: number;
    allocation: string | null;
    dnsOk: boolean;
    https: DomainHttps;
}

/** Whether a domain is served as a website (http, and https once it has a certificate) and what its certificate is. */
export interface DomainHttps {
    web: boolean;
    // none, pending (being requested), issued or failed
    status: 'none' | 'pending' | 'issued' | 'failed';
    message: string | null;
    // The certificate that covers the domain: one uploaded by an admin, or the free one.
    coveredBy: string | null;
    expiresAt: Date | null;
    source: string | null;
    canRequest: boolean;
    // The dns way (a TXT record added by hand): for domains Let's Encrypt can not visit, and to renew those.
    canRequestDns: boolean;
    renewByDns: boolean;
    // While waiting for the person: the TXT record to add.
    dns: { name: string; value: string } | null;
    // Why the button can not be used, null when it can.
    reason: string | null;
}

export const toDomain = (d: any): ServerDomain => ({
    id: d.id,
    domain: d.domain,
    allocationId: d.allocation_id,
    allocation: d.allocation,
    dnsOk: d.dns_ok,
    https: {
        web: !!d.https?.web,
        status: d.https?.status ?? 'none',
        message: d.https?.message ?? null,
        coveredBy: d.https?.covered_by ?? null,
        expiresAt: d.https?.expires_at ? new Date(d.https.expires_at) : null,
        source: d.https?.source ?? null,
        canRequest: !!d.https?.can_request,
        canRequestDns: !!d.https?.can_request_dns,
        renewByDns: !!d.https?.renew_by_dns,
        dns: d.https?.dns ? { name: d.https.dns.name, value: d.https.dns.value } : null,
        reason: d.https?.reason ?? null,
    },
});

export interface DomainList {
    domains: ServerDomain[];
    enabled: boolean;
    targetIp: string;
    max: number;
}

export const getDomains = async (uuid: string): Promise<DomainList> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/domains`);

    return {
        domains: (data.data || []).map(toDomain),
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

/** Asks Let's Encrypt for a certificate for the domain. It runs in the background, the state is in the domain. */
export const requestDomainCertificate = async (
    uuid: string,
    id: number,
    method: 'http' | 'dns' = 'http'
): Promise<ServerDomain> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/domains/${id}/certificate`, { method });

    return toDomain(data.attributes);
};
