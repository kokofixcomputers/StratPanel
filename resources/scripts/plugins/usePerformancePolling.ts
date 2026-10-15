import { useEffect } from 'react';
import { ServerContext } from '@/state/server';
import { askPerformance, useBridgeStatus } from '@/lib/bridge';
import { POLL_MS } from '@/lib/performance';

/**
 * Asks the plugin for TPS and MSPT every few seconds, but only while the server is running, the plugin is new enough to
 * know how and the tab is in front. Every answer is a line in the server's log, so nobody looking means no questions.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const bridge = useBridgeStatus(uuid);
    const capable = bridge.state === 'connected' && (bridge.protocol || 1) >= 2;

    useEffect(() => {
        if (!connected || !instance || status !== 'running' || !capable) return;

        const ask = () => {
            if (!document.hidden) askPerformance(instance);
        };
        ask();
        const timer = setInterval(ask, POLL_MS);

        return () => clearInterval(timer);
    }, [uuid, status, connected, instance, capable]);
};
