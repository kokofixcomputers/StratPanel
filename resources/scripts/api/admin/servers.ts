import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';

export type ServerState = 'active' | 'installing' | 'suspended';

export interface ServerRow {
    id: number;
    uuid: string;
    uuid_short: string;
    name: string;
    owner: { id: number; username: string };
    node: { id: number; name: string };
    connection: string | null;
    state: ServerState;
}

export interface Person {
    id: number;
    username: string;
    email: string;
    name_first: string;
    name_last: string;
    gravatar: string;
}

export interface ServerDetails {
    id: number;
    uuid: string;
    uuid_short: string;
    external_id: string | null;
    name: string;
    description: string;
    state: ServerState;
    cpu: number;
    threads: string | null;
    memory: number;
    swap: number;
    disk: number;
    io: number;
    oom_disabled: boolean;
    database_limit: number | null;
    allocation_limit: number | null;
    backup_limit: number | null;
    nest: { id: number; name: string };
    egg: { id: number; name: string };
    owner: Person;
    node: { id: number; name: string };
    allocation: { ip: string; alias: string; port: number; has_alias: boolean } | null;
}

export interface EggVariable {
    id: number;
    name: string;
    description: string;
    env_variable: string;
    default_value: string;
    rules: string;
    required: boolean;
}

export interface EggChoice {
    id: number;
    uuid?: string;
    name: string;
    docker_images: Record<string, string>;
    startup: string;
    variables: EggVariable[];
}

export interface NestChoice {
    id: number;
    name: string;
    eggs: EggChoice[];
}

export interface ServerForm {
    locations: { id: number; short: string; long: string; nodes: { id: number; name: string }[] }[];
    nests: NestChoice[];
}

export interface AllocationOption {
    id: number;
    text: string;
}

export interface BuildState {
    id: number;
    name: string;
    cpu: number;
    threads: string;
    memory: number;
    swap: number;
    disk: number;
    io: number;
    oom_disabled: boolean;
    database_limit: number | null;
    allocation_limit: number | null;
    backup_limit: number | null;
    allocation_id: number;
    assigned: AllocationOption[];
    unassigned: AllocationOption[];
}

export interface StartupState {
    id: number;
    name: string;
    startup: string;
    image: string;
    skip_scripts: boolean;
    nest_id: number;
    egg_id: number;
    environment: Record<string, string>;
    nests: NestChoice[];
}

export interface ServerDatabase {
    id: number;
    database: string;
    username: string;
    remote: string;
    host: string;
    max_connections: number | null;
}

export interface DatabasesState {
    id: number;
    name: string;
    uuid_short: string;
    databases: ServerDatabase[];
    hosts: { id: number; name: string }[];
}

export interface MountsState {
    id: number;
    name: string;
    mounts: { id: number; name: string; source: string; target: string; mounted: boolean }[];
}

export interface DomainsState {
    id: number;
    name: string;
    enabled: boolean;
    target_ip: string | null;
    max: number;
    allocations: (AllocationOption & { primary: boolean })[];
    domains: { id: number; domain: string; leads_to: string | null; ready: boolean }[];
}

export interface ManageState {
    id: number;
    name: string;
    installed: boolean;
    suspended: boolean;
    can_reinstall: boolean;
    can_transfer: boolean;
    node_id: number;
    transfer: { started: string } | null;
    locations: { id: number; short: string; long: string; nodes: { id: number; name: string }[] }[];
}

export interface CreateServerInput {
    name: string;
    owner_id: string;
    description: string;
    start_on_completion: boolean;
    node_id: string;
    allocation_id: string;
    allocation_additional: string[];
    database_limit: string;
    allocation_limit: string;
    backup_limit: string;
    cpu: string;
    threads: string;
    memory: string;
    swap: string;
    disk: string;
    io: string;
    oom_disabled: boolean;
    nest_id: string;
    egg_id: string;
    skip_scripts: boolean;
    image: string;
    custom_image: string;
    startup: string;
    environment: Record<string, string>;
    import_document?: string;
}

const base = '/api/client/admin/servers';

export const useServers = (search: string, ownerId: string | null, page: number) =>
    useSWR<{ servers: ServerRow[]; pagination: PaginationDataSet }, AxiosError>(
        ['admin:servers', search, ownerId, page],
        async () => {
            const { data } = await http.get(base, {
                params: { search: search || undefined, owner_id: ownerId || undefined, page },
            });

            return { ...data, pagination: getPaginationSet(data.pagination) };
        },
        { revalidateOnFocus: false }
    );

export const useServerForm = () =>
    useSWR<ServerForm, AxiosError>('admin:servers:form', async () => (await http.get(`${base}/form`)).data, {
        revalidateOnFocus: false,
    });

export const useServer = (id: string) =>
    useSWR<ServerDetails, AxiosError>(`admin:servers:${id}`, async () => (await http.get(`${base}/${id}`)).data, {
        revalidateOnFocus: false,
    });

export const findPeople = async (search: string): Promise<Person[]> =>
    (await http.get('/api/client/admin/lookups/people', { params: { search } })).data.people;

export const getPerson = async (id: number): Promise<Person | undefined> =>
    (await http.get('/api/client/admin/lookups/people', { params: { user_id: id } })).data.people[0];

export const freeAllocations = async (node: number | string): Promise<AllocationOption[]> =>
    (await http.get(`/api/client/admin/nodes/${node}/free-allocations`)).data.allocations;

export const createServer = async (input: CreateServerInput): Promise<{ id: number; schedules: number }> => {
    const { custom_image, import_document, ...rest } = input;
    const body: Record<string, unknown> = { ...rest, custom_image: custom_image || undefined };
    if (import_document) body.import_document = import_document;

    return (await http.post(base, body)).data;
};

export const updateDetails = async (
    id: number,
    input: { name: string; description: string; external_id: string; owner_id: number }
): Promise<ServerDetails> =>
    (await http.patch(`${base}/${id}`, { ...input, external_id: input.external_id || null })).data;

export const deleteServer = async (id: number, force: boolean): Promise<void> => {
    await http.delete(`${base}/${id}`, { data: { force } });
};

const part =
    <T>(name: string) =>
    (id: string) =>
        useSWR<T, AxiosError>(
            `admin:servers:${id}:${name}`,
            async () => (await http.get(`${base}/${id}/${name}`)).data,
            {
                revalidateOnFocus: false,
            }
        );

export const useBuild = part<BuildState>('build');
export const useStartup = part<StartupState>('startup');
export const useServerDatabases = part<DatabasesState>('databases');
export const useServerMounts = part<MountsState>('mounts');
export const useServerDomains = part<DomainsState>('domains');
export const useManage = part<ManageState>('manage');

export const updateBuild = async (id: number, input: Record<string, unknown>): Promise<BuildState> =>
    (await http.patch(`${base}/${id}/build`, input)).data;

export const updateStartup = async (id: number, input: Record<string, unknown>): Promise<StartupState> =>
    (await http.patch(`${base}/${id}/startup`, input)).data;

export const createServerDatabase = async (
    id: number,
    input: { database_host_id: string; database: string; remote: string; max_connections: string }
): Promise<DatabasesState> => (await http.post(`${base}/${id}/databases`, input)).data;

export const resetServerDatabasePassword = async (id: number, database: number): Promise<void> => {
    await http.patch(`${base}/${id}/databases/${database}`);
};

export const deleteServerDatabase = async (id: number, database: number): Promise<void> => {
    await http.delete(`${base}/${id}/databases/${database}`);
};

export const addServerMount = async (id: number, mount: number): Promise<MountsState> =>
    (await http.post(`${base}/${id}/mounts`, { mount_id: mount })).data;

export const removeServerMount = async (id: number, mount: number): Promise<MountsState> =>
    (await http.delete(`${base}/${id}/mounts/${mount}`)).data;

export const addServerDomain = async (
    id: number,
    input: { domain: string; allocation_id: string }
): Promise<DomainsState> => (await http.post(`${base}/${id}/domains`, input)).data;

export const removeServerDomain = async (id: number, domain: number): Promise<DomainsState> =>
    (await http.delete(`${base}/${id}/domains/${domain}`)).data;

export const manageAction = async (
    id: number,
    action: 'reinstall' | 'toggle' | 'suspension' | 'transfer',
    body: Record<string, unknown> = {}
): Promise<ManageState> => (await http.post(`${base}/${id}/manage/${action}`, body)).data;
