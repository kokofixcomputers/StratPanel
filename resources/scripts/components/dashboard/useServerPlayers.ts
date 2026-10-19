import { useEffect, useState } from 'react';
import { Server } from '@/api/server/getServer';
import { ServerStats } from '@/api/server/getServerResourceUsage';
import { getPlayerCounts, PlayerCount } from '@/api/palette';

const EVERY = 30000;
const AT_ONCE = 100;

/**
 * How many players are on the servers that are running, asked of the panel (which asks the servers). Servers that are off are not
 * asked, and one that does not answer simply has no number.
 */
export default (servers: Server[], stats: Record<string, ServerStats>) => {
    const [counts, setCounts] = useState<Record<string, PlayerCount>>({});
    const running = servers
        .filter((s) => stats[s.uuid]?.status === 'running' && !stats[s.uuid].isSuspended && !s.status)
        .map((s) => s.uuid)
        .sort()
        .join(',');

    useEffect(() => {
        if (!running) {
            setCounts({});
            return;
        }
        let stale = false;
        const uuids = running.split(',');
        const load = async () => {
            const all: Record<string, PlayerCount> = {};
            for (let i = 0; i < uuids.length; i += AT_ONCE) {
                Object.assign(all, await getPlayerCounts(uuids.slice(i, i + AT_ONCE)));
            }
            if (!stale) setCounts(all);
        };
        const run = () => load().catch(() => undefined);
        run();
        const timer = setInterval(run, EVERY);

        return () => {
            stale = true;
            clearInterval(timer);
        };
    }, [running]);

    return counts;
};
