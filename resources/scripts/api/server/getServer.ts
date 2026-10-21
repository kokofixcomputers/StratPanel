import http, { FractalResponseData, FractalResponseList } from '@/api/http';
import { rawDataToServerAllocation, rawDataToServerEggVariable } from '@/api/transformers';
import { ServerEggVariable, ServerStatus } from '@/api/server/types';
import { Identifier } from '@/api/definitions';

export interface Allocation {
    id: number;
    ip: string;
    alias: string | null;
    port: number;
    notes: string | null;
    isDefault: boolean;
}

export interface Server {
    /**
     * This value is determined by the presence of the `PTERODACTYL_USE_SERVER_IDENTIFIERS` environment
     * variable which changes what the API can respond with. It will eventually be removed and referenced
     * as the "identifier" key, but this allows users to slowly opt-in to these new URLs and trial it
     * as they wish.
     *
     * @deprecated this is the "uuid_short" which will be removed in 2.0, prefer use of "identifier"
     */
    id: string | Identifier<'serv'>;
    identifier: Identifier<'serv'>; // Set from "server_identifier" and should be used moving forward to reference a server.
    internalId: number | string;
    /**
     * Exists only to maintain support in cases where the short-uuid is necessary for server reference
     * and cannot be easily replaced with "identifier".
     *
     * @deprecated
     */
    __deprecatedUuidShort: string;
    uuid: string;
    name: string;
    node: string;
    isNodeUnderMaintenance: boolean;
    // Whether the person is the owner, as opposed to a subuser.
    isOwner: boolean;
    // Whether the node lets the server burst above its CPU limit for short spikes, and by how much of the limit.
    cpuBurst: { enabled: boolean; percent: number };
    status: ServerStatus;
    // Which of the power buttons the user may use.
    canControl: { start: boolean; stop: boolean; restart: boolean };
    // Auto sleep stops the server when nobody is online, it is off until the owner turns it on.
    autoSleep: { enabled: boolean; sleeping: boolean };
    // Whether deleted files and schedules are kept in a trash bin for a while, and for how many days.
    trash: { enabled: boolean; retentionDays: number };
    sftpDetails: {
        ip: string;
        port: number;
    };
    invocation: string;
    dockerImage: string;
    description: string;
    limits: {
        memory: number;
        swap: number;
        disk: number;
        io: number;
        cpu: number;
        threads: string;
    };
    // The egg (kind of server) it runs, for banners.
    eggId: number;
    // The domains that lead to it (names players can connect with), see lib/connection.ts.
    domains: string[];
    eggFeatures: string[];
    featureLimits: {
        databases: number;
        allocations: number;
        backups: number;
    };
    isTransferring: boolean;
    skipScripts: boolean;
    variables: ServerEggVariable[];
    allocations: Allocation[];
}

export const rawDataToServerObject = ({ attributes: data }: FractalResponseData): Server => ({
    id: data.identifier,
    identifier: data.server_identifier,
    internalId: data.internal_id,
    __deprecatedUuidShort: data.__deprecated_uuid_short,
    uuid: data.uuid,
    name: data.name,
    node: data.node,
    isNodeUnderMaintenance: data.is_node_under_maintenance,
    isOwner: !!data.server_owner,
    cpuBurst: { enabled: !!data.cpu_burst?.enabled, percent: data.cpu_burst?.percent ?? 0 },
    status: data.status,
    canControl: {
        start: !!data.can_control?.start,
        stop: !!data.can_control?.stop,
        restart: !!data.can_control?.restart,
    },
    autoSleep: { enabled: !!data.auto_sleep?.enabled, sleeping: !!data.auto_sleep?.sleeping },
    trash: { enabled: !!data.trash?.enabled, retentionDays: data.trash?.retention_days ?? 30 },
    invocation: data.invocation,
    dockerImage: data.docker_image,
    sftpDetails: {
        ip: data.sftp_details.ip,
        port: data.sftp_details.port,
    },
    description: data.description ? (data.description.length > 0 ? data.description : null) : null,
    limits: { ...data.limits },
    eggId: data.egg_id,
    domains: Array.isArray(data.domains) ? data.domains.map(String) : [],
    eggFeatures: data.egg_features || [],
    featureLimits: { ...data.feature_limits },
    isTransferring: data.is_transferring,
    skipScripts: data.skip_scripts,
    variables: ((data.relationships?.variables as FractalResponseList | undefined)?.data || []).map(
        rawDataToServerEggVariable
    ),
    allocations: ((data.relationships?.allocations as FractalResponseList | undefined)?.data || []).map(
        rawDataToServerAllocation
    ),
});

export default (uuid: string): Promise<[Server, string[]]> => {
    return new Promise((resolve, reject) => {
        http.get(`/api/client/servers/${uuid}`)
            .then(({ data }) =>
                resolve([
                    rawDataToServerObject(data),
                    // eslint-disable-next-line camelcase
                    data.meta?.is_server_owner ? ['*'] : data.meta?.user_permissions || [],
                ])
            )
            .catch(reject);
    });
};
