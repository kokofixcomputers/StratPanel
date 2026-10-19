import http from '@/api/http';
import { AdminEntry } from '@/lib/palette';

/** The admin pages and actions the person may open (empty when they have no admin access). */
export const getAdminPalette = async (): Promise<AdminEntry[]> => {
    const { data } = await http.get('/api/client/palette');

    return data.attributes?.admin ?? [];
};

export interface PlayerCount {
    online: number;
    max: number;
}

/** How many players are on each of the servers, asked of the servers themselves (only the ones that answered are in it). */
export const getPlayerCounts = async (uuids: string[]): Promise<Record<string, PlayerCount>> => {
    if (uuids.length === 0) return {};
    const { data } = await http.get('/api/client/dashboard/players', {
        params: { servers: uuids.join(',') },
        headers: { 'X-Panel-Background': '1' },
    });

    return data.attributes ?? {};
};
