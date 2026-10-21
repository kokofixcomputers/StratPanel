import { useMemo } from 'react';
import useSWR from 'swr';
import { getAllServers } from '@/api/getServers';
import { Server } from '@/api/server/getServer';
import { Holdings } from '@/lib/branding';
import { readCachedSoftware } from '@/components/dashboard/useServerSoftware';

/**
 * The servers of the person, for the announcements and cards that are only for people with a server of an egg, a software or on a node.
 * Nothing is asked for while `needed` is false. The list is the one the dashboard uses, so it is not fetched twice.
 */
export default (needed: boolean): Holdings => {
    const { data } = useSWR<Server[]>(needed ? ['/api/client/servers', 'all'] : null, getAllServers);

    return useMemo(
        () => ({
            servers: data ? data.map((s) => ({ uuid: s.uuid, eggId: s.eggId, node: s.node })) : null,
            software: readCachedSoftware,
        }),
        [data]
    );
};
