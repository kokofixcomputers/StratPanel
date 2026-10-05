import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import { ServerContext } from '@/state/server';
import { SocketEvent } from '@/components/server/events';
import { clearOnlinePlayers, handleLogLine } from '@/lib/onlinePlayers';

/** Follows the console for the whole time a server is open, so the Players tab is right when it is opened. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (line: string) => handleLogLine(uuid, line));
    useWebsocketEvent(SocketEvent.STATUS, (state: string) => {
        if (state === 'offline' || state === 'starting') clearOnlinePlayers(uuid);
    });

    return null;
};
