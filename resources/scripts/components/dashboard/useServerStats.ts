import { useCallback, useEffect, useRef, useState } from 'react';
import { Server } from '@/api/server/getServer';
import getServerResourceUsage, { ServerStats } from '@/api/server/getServerResourceUsage';

const EVERY = 30000;
const AT_ONCE = 5;

const reachable = (server: Server) => server.status !== 'suspended' && !server.isNodeUnderMaintenance;

/**
 * The state of all the given servers, looked at now and then (the list can be filtered by it, so it cannot be left to the rows,
 * which come and go with the filter). A few at a time, so a long list does not open a hundred connections at once.
 */
export default (servers: Server[]) => {
    const [stats, setStats] = useState<Record<string, ServerStats>>({});
    const list = useRef(servers);
    list.current = servers;
    const key = servers.map((s) => s.uuid).join(',');
    const statsRef = useRef(stats);
    statsRef.current = stats;

    const look = useCallback((uuid: string) => {
        return getServerResourceUsage(uuid)
            .then((data) => setStats((all) => ({ ...all, [uuid]: data })))
            .catch((error) => console.error(error));
    }, []);

    const lookAll = useCallback(
        async (only?: (server: Server) => boolean) => {
            const queue = list.current.filter((s) => reachable(s) && (!only || only(s)));
            await Promise.all(
                Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
                    for (let s = queue.shift(); s; s = queue.shift()) await look(s.uuid);
                })
            );
        },
        [look]
    );

    useEffect(() => {
        // The ones that came in first, then everything again every 30 seconds.
        lookAll((s) => !(s.uuid in statsRef.current));
        const timer = setInterval(() => lookAll(), EVERY);

        return () => clearInterval(timer);
    }, [key]);

    return { stats, refresh: look };
};
