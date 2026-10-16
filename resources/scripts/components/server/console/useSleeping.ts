import { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import { getAutoSleep } from '@/api/server/autoSleep';

/** How often a server that is off is checked for being asleep. It changes when the panel stops it, which nobody here causes. */
const CHECK_MS = 60000;

/**
 * Whether the server is asleep (stopped by auto sleep because nobody was online), for the status badge. Only a server that has
 * auto sleep on and is off is asked about, everything else is not asleep.
 */
export default (): boolean => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const enabled = ServerContext.useStoreState((state) => state.server.data!.autoSleep.enabled);
    const knownSleeping = ServerContext.useStoreState((state) => state.server.data!.autoSleep.sleeping);
    const status = ServerContext.useStoreState((state) => state.status.value) || 'offline';
    const [sleeping, setSleeping] = useState(knownSleeping);

    useEffect(() => {
        if (!enabled || status !== 'offline') {
            setSleeping(false);
            return;
        }

        let cancelled = false;
        const check = () =>
            getAutoSleep(uuid)
                .then((settings) => !cancelled && setSleeping(settings.enabled && settings.sleeping))
                .catch(() => undefined);
        // Asked at once, because the page may have been opened a while ago, and again now and then, the panel changes it.
        check();
        const timer = setInterval(() => !document.hidden && check(), CHECK_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [uuid, enabled, status]);

    return sleeping && enabled && status === 'offline';
};
