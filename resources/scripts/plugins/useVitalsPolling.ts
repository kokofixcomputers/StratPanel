import { useEffect } from 'react';
import { ServerContext } from '@/state/server';
import { BRIDGE_COMMAND, useBridgeStatus } from '@/lib/bridge';
import { VITALS_POLL_MS } from '@/lib/vitals';

/**
 * Asks the plugin for the health and hunger of the players every few seconds, but only while the server is running, the
 * plugin is new enough to know how and the tab is in front. Every answer is a line in the server's log, so nobody looking
 * means no questions.
 */
export default (enabled = true) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const bridge = useBridgeStatus(uuid);
    const capable = bridge.state === 'connected' && (bridge.protocol || 1) >= 3;

    useEffect(() => {
        if (!enabled || !connected || !instance || status !== 'running' || !capable) return;

        const ask = () => {
            if (!document.hidden) instance.send('send command', `${BRIDGE_COMMAND} vitals`);
        };
        ask();
        const timer = setInterval(ask, VITALS_POLL_MS);

        return () => clearInterval(timer);
    }, [uuid, status, connected, instance, capable, enabled]);

    return capable;
};
