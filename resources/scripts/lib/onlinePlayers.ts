/**
 * Tracks who is online from the server's own log lines. The "joined the game" / "left the game" messages are
 * avoided on purpose because plugins rewrite or hide them. These two lines are written by the server itself:
 *   Steve[/1.2.3.4:51234] logged in with entity id 123 at (0.0, 64.0, 0.0)
 *   Steve lost connection: Disconnected
 * The store lives outside React so players are still tracked while the Players tab is not open.
 */
import { useEffect, useState } from 'react';
import { stripAnsi } from '@/components/server/console/consoleChunks';
import { BridgeMessage, toPlayer } from '@/lib/bridge';

const LOGIN = /(?:^|\]: |\] )([^\s[\]]+)\[\/[^\]]+\] logged in with entity id/;
const LOST = /(?:^|\]: |\] )([^\s[\]]+) lost connection: /;
const UUID_LINE = /UUID of player ([^\s]+) is ([0-9a-f-]{32,36})/i;

export type LogEvent =
    | { type: 'join'; name: string }
    | { type: 'leave'; name: string }
    | { type: 'uuid'; name: string; uuid: string };

export const parseLogLine = (line: string): LogEvent | null => {
    const text = stripAnsi(line).trim();

    const login = LOGIN.exec(text);
    if (login) return { type: 'join', name: login[1] };

    const lost = LOST.exec(text);
    if (lost) return { type: 'leave', name: lost[1] };

    const uuid = UUID_LINE.exec(text);
    if (uuid) return { type: 'uuid', name: uuid[1], uuid: uuid[2] };

    return null;
};

interface State {
    online: string[];
    uuids: Record<string, string>;
}

const states = new Map<string, State>();
const listeners = new Set<() => void>();
const empty: State = { online: [], uuids: {} };

export const readOnlinePlayers = (server: string): State => states.get(server) || empty;

const write = (server: string, state: State) => {
    states.set(server, state);
    listeners.forEach((listener) => listener());
};

export const handleLogLine = (server: string, line: string) => {
    const event = parseLogLine(line);
    if (!event) return;

    const state = readOnlinePlayers(server);
    if (event.type === 'join') {
        if (!state.online.includes(event.name)) write(server, { ...state, online: [...state.online, event.name] });
    } else if (event.type === 'leave') {
        if (state.online.includes(event.name)) {
            write(server, { ...state, online: state.online.filter((name) => name !== event.name) });
        }
    } else if (state.uuids[event.name] !== event.uuid) {
        write(server, { ...state, uuids: { ...state.uuids, [event.name]: event.uuid } });
    }
};

/**
 * What the plugin tells the panel about players: someone joined, someone left, or the whole list (answering a sync).
 * Only call this with messages that passed the trust check of the bridge.
 */
export const handleBridgeMessage = (server: string, message: BridgeMessage) => {
    const state = readOnlinePlayers(server);

    if (message.event === 'player-join' || message.event === 'player-leave') {
        const player = toPlayer(message);
        if (!player) return;

        const uuids =
            player.uuid && state.uuids[player.name] !== player.uuid
                ? { ...state.uuids, [player.name]: player.uuid }
                : state.uuids;
        const online =
            message.event === 'player-join'
                ? state.online.includes(player.name)
                    ? state.online
                    : [...state.online, player.name]
                : state.online.filter((name) => name !== player.name);
        if (online !== state.online || uuids !== state.uuids) write(server, { online, uuids });
    } else if (message.event === 'players' && Array.isArray(message.players)) {
        const players = message.players.map(toPlayer).filter((p): p is NonNullable<ReturnType<typeof toPlayer>> => !!p);
        const uuids = { ...state.uuids };
        players.forEach((p) => p.uuid && (uuids[p.name] = p.uuid));
        write(server, { online: players.map((p) => p.name), uuids });
    }
};

/** Nobody can be online while the server is not running. */
export const clearOnlinePlayers = (server: string) => {
    if (readOnlinePlayers(server).online.length) write(server, { ...readOnlinePlayers(server), online: [] });
};

export const useOnlinePlayers = (server: string): State => {
    const [state, setState] = useState(readOnlinePlayers(server));

    useEffect(() => {
        const update = () => setState(readOnlinePlayers(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return state;
};
