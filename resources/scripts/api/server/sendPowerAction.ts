import http from '@/api/http';

export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';

/** Sends a power action to a server over the API, for places that have no console connection (the server list). */
export default async (uuid: string, signal: PowerSignal): Promise<void> => {
    await http.post(`/api/client/servers/${uuid}/power`, { signal });
};
