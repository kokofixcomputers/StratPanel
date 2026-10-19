import http from '@/api/http';

/** Sends a command to the console of a running server over the API, for places that have no console connection. */
export default async (uuid: string, command: string): Promise<void> => {
    await http.post(`/api/client/servers/${uuid}/command`, { command });
};
