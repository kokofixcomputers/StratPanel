import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

const base = '/api/client/admin/settings';

/** What a page of Settings has now. The page keeps its own copy to edit, this is the saved one. */
export const useSetting = <T>(path: string) =>
    useSWR<T, AxiosError>(`admin:settings:${path}`, async () => (await http.get(`${base}/${path}`)).data, {
        revalidateOnFocus: false,
    });

export const saveSetting = async <T = unknown>(
    path: string,
    body: unknown,
    method: 'patch' | 'post' = 'patch'
): Promise<T> =>
    (
        await http[method](
            `${base}/${path}`,
            body,
            body instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
        )
    ).data;

export const postSetting = async <T = unknown>(path: string, body: unknown = {}): Promise<T> =>
    (await http.post(`${base}/${path}`, body)).data;

export const deleteSetting = async (path: string): Promise<void> => {
    await http.delete(`${base}/${path}`);
};

export interface General {
    name: string;
    two_factor: number;
    locale: string;
    languages: Record<string, string>;
}

export interface Advanced {
    timeout: number;
    connect_timeout: number;
}

export interface Mail {
    disabled: boolean;
    host: string;
    port: number;
    encryption: '' | 'tls' | 'ssl';
    username: string;
    password_saved: boolean;
    from_address: string;
    from_name: string;
}

export interface Trash {
    enabled: boolean;
    retention_days: number;
    items: number;
    bytes: number;
}

export interface PoolNumbers {
    memory: number;
    disk: number;
    cpu: number;
    allocations: number;
    backups: number;
}

export interface Pools {
    enabled: boolean;
    defaults: PoolNumbers;
    own: number;
}

export interface CurseForge {
    enabled: boolean;
    from_environment: boolean;
}

export interface Authentication {
    captcha: 'none' | 'recaptcha' | 'turnstile';
    recaptcha_site_key: string;
    recaptcha_shipped: boolean;
    turnstile_site_key: string;
    turnstile_secret_saved: boolean;
    passkeys: boolean;
    registration: boolean;
    registration_password: boolean;
    providers: number;
}

export interface Announcement {
    id: string;
    title: string;
    message: string;
    type: string;
    enabled: boolean;
    dismissible: boolean;
    link_label: string;
    link_url: string;
}

export interface BrandLink {
    label: string;
    url: string;
    location: string;
    new_tab: boolean;
}

export interface Branding {
    favicon: string | null;
    console_prompt: string;
    announcements: Announcement[];
    links: BrandLink[];
    locations: Record<string, string>;
    types: string[];
}

export interface ProviderRow {
    id: number;
    name: string;
    key: string;
    type: string;
    enabled: boolean;
    allow_signup: boolean;
    accounts: number;
}

export interface ProviderForm {
    id: number | null;
    type: string;
    preset: { name: string; docs: string | null };
    name: string;
    key: string;
    client_id: string;
    secret_saved: boolean;
    scopes: string;
    default_scopes: string;
    enabled: boolean;
    allow_signup: boolean;
    generic: boolean;
    authorize_url: string;
    token_url: string;
    userinfo_url: string;
    mapping: Record<string, string | null>;
    callback: string;
}

export interface ZoneRow {
    id: number;
    name: string;
    domain: string;
    type: string;
    enabled: boolean;
    names: number;
}

export interface ZoneField {
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    help: string | null;
    value: string;
    saved: boolean | null;
}

export interface ZoneForm {
    id: number | null;
    type: string;
    provider: string;
    help: string | null;
    name: string;
    domain: string;
    ttl: number;
    enabled: boolean;
    names: number;
    fields: ZoneField[];
}

export interface Domains {
    custom_enabled: boolean;
    zones: ZoneRow[];
    types: { type: string; name: string }[];
    target_ip: string | null;
}

export interface CertificateRow {
    id: number;
    name: string;
    domains: string[];
    is_default: boolean;
    enabled: boolean;
    source: string | null;
    acme_method: string | null;
    renew_error: string | null;
    no_chain: boolean;
    expired: boolean;
    expiring: boolean;
    days_left: number | null;
    not_after: string | null;
}

export interface CertificateDetail extends CertificateRow {
    issuer: string | null;
    not_before: string | null;
    fingerprint: string | null;
}

export interface Certificates {
    certificates: CertificateRow[];
    token_configured: boolean;
    edge: { at: string; recent: boolean; ip: string; count: number; http: boolean } | null;
    acme: { enabled: boolean; email: string; staging: boolean };
}
