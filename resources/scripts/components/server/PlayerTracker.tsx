import { useEffect, useRef } from 'react';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import { ServerContext } from '@/state/server';
import { SocketEvent } from '@/components/server/events';
import loadDirectory from '@/api/server/files/loadDirectory';
import { clearOnlinePlayers, handleBridgeMessage, handleLogLine } from '@/lib/onlinePlayers';
import {
    askPlugin,
    handleBridgeStatusMessage,
    isBridgeLine,
    parseTrustedBridgeLine,
    resetBridgeStatus,
} from '@/lib/bridge';
import { COMMANDS_FILE } from '@/lib/commandTree';

/**
 * Follows the console for the whole time a server is open, so the Players tab is right when it is opened. Players come
 * from the StratPanel plugin when it is installed, and from the server's own log lines otherwise.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);
    const plugin = useRef(false);
    const asked = useRef('');

    // The plugin leaves pterodactyl.commands.json in the server root, which also tells the panel it is installed.
    useEffect(() => {
        plugin.current = false;
        loadDirectory(uuid, '/')
            .then((files) => {
                plugin.current = files.some((f) => f.isFile && f.name === COMMANDS_FILE);
            })
            .catch(() => undefined);
    }, [uuid]);

    // Say hello to the plugin once per connection and start. It answers with who it is and who is online, so players who
    // joined before the panel was opened are in the list too. Servers without the plugin are not bothered.
    useEffect(() => {
        if (!connected || !instance || status !== 'running') {
            asked.current = '';
            if (status === 'offline' || status === 'starting') resetBridgeStatus(uuid);
            return;
        }

        const key = `${uuid}:${status}`;
        const timer = setTimeout(() => {
            if (plugin.current && asked.current !== key) {
                asked.current = key;
                askPlugin(uuid, instance, 'handshake');
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [uuid, status, connected, instance]);

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (line: string) => {
        const message = parseTrustedBridgeLine(line);
        if (message) {
            handleBridgeStatusMessage(uuid, message);

            return handleBridgeMessage(uuid, message);
        }

        // Anything else with the tag is not to be believed, and the log lines of the server are used as before.
        if (!isBridgeLine(line)) handleLogLine(uuid, line);
    });
    useWebsocketEvent(SocketEvent.STATUS, (state: string) => {
        if (state === 'offline' || state === 'starting') clearOnlinePlayers(uuid);
    });

    return null;
};
