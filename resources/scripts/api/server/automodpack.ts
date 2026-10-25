import useSWR, { mutate } from 'swr';
import http from '@/api/http';

export interface AutomodpackFingerprint {
    fingerprint: string | null;
    foundAt: string | null;
}

// What AutoModpack logs when it starts: the panel finds it (and keeps it in stratosphere.json), see AutomodpackFingerprintService.
export const FINGERPRINT_LINE = /AutoModpack host certificate fingerprint:/i;

const key = (uuid: string) => ['server:automodpack', uuid];

const fetchFingerprint = (uuid: string, scan: boolean): Promise<AutomodpackFingerprint> =>
    http
        .get(`/api/client/servers/${uuid}/automodpack`, { params: scan ? { scan: 1 } : {} })
        .then(({ data }) => ({ fingerprint: data.fingerprint ?? null, foundAt: data.found_at ?? null }));

/** The fingerprint of the certificate AutoModpack hosts with, null when the server has none (no AutoModpack, or it did not start yet). */
export const useAutomodpack = (uuid: string) =>
    useSWR<AutomodpackFingerprint>(key(uuid), () => fetchFingerprint(uuid, false), {
        revalidateOnFocus: false,
        // A server that has none is asked again now and then, AutoModpack may be added or started later.
        dedupingInterval: 60000,
    });

/** The console just said it: look in the log now, a certificate that was made again has a new fingerprint. */
let timer: ReturnType<typeof setTimeout> | undefined;
export const refreshAutomodpack = (uuid: string) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => mutate(key(uuid), fetchFingerprint(uuid, true), false), 1500);
};
