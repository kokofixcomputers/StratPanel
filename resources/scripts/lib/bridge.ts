/**
 * Messages from the plugin/mod to the panel travel as console lines, the console is already streamed to the browser
 * so no other connection is needed. A message is a line that contains the tag followed by a JSON object:
 *
 *   [12:00:00 INFO]: ::stratpanel:: {"event":"commands-updated","generatedAt":"2026-10-05T12:00:00Z"}
 *
 * The panel hides these lines from the console it shows. Anyone can type text into the console or chat, so events must
 * only ever make the panel look something up again, never trust what the line says.
 */
import { useEffect, useState } from 'react';
import { stripAnsi } from '@/components/server/console/consoleChunks';

export const BRIDGE_TAG = '::stratpanel::';

export interface BridgeMessage {
    event: string;
    [key: string]: unknown;
}

/** The console command the panel uses to talk to the plugin. Any console line that mentions it is hidden. */
export const BRIDGE_COMMAND = 'stratpanelhidepanellogs';

export const isBridgeLine = (line: string): boolean => line.includes(BRIDGE_TAG) || line.includes(BRIDGE_COMMAND);

/** The message of a bridge line, or null when the line is not one or does not hold valid JSON after the tag. */
export const parseBridgeLine = (line: string): BridgeMessage | null => {
    const text = stripAnsi(line);
    const index = text.indexOf(BRIDGE_TAG);
    if (index < 0) return null;

    try {
        const data = JSON.parse(text.slice(index + BRIDGE_TAG.length).trim());

        return data && typeof data === 'object' && typeof data.event === 'string' ? data : null;
    } catch (e) {
        return null;
    }
};

/**
 * Messages that carry data (players joining and leaving) are only believed when the line is exactly what the plugin's
 * logger prints: the log header, then the plugin's own prefix, then the tag. Chat cannot start a new line, so a player
 * cannot forge such a line, while text typed into chat or logged by another plugin always has something else first.
 */
const TRUSTED = /^(?:\[[^\]\n]*\]\s*)+:\s*\[StratPanel\]\s+::stratpanel::/;

export const isTrustedBridgeLine = (line: string): boolean => TRUSTED.test(stripAnsi(line).trimStart());

export const parseTrustedBridgeLine = (line: string): BridgeMessage | null =>
    isTrustedBridgeLine(line) ? parseBridgeLine(line) : null;

const NAME = /^[A-Za-z0-9_.\- ]{1,32}$/;
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export interface BridgePlayer {
    name: string;
    uuid: string | null;
}

/** A player from a message, or null when the name is not something a player can be called. */
export const toPlayer = (value: unknown): BridgePlayer | null => {
    if (!value || typeof value !== 'object') return null;
    const { name, uuid } = value as Record<string, unknown>;
    if (typeof name !== 'string' || !NAME.test(name)) return null;

    return { name, uuid: typeof uuid === 'string' && UUID.test(uuid) ? uuid : null };
};

// ---- the state of the connection with the plugin ----------------------------------------------------------------------

export interface BridgeStatus {
    // unknown: not asked yet, checking: waiting for the answer, connected: the plugin answered, missing: it did not.
    state: 'unknown' | 'checking' | 'connected' | 'missing';
    version?: string;
    platform?: string;
    minecraft?: string;
    refreshing: boolean;
    lastRefreshed?: number;
}

const idle: BridgeStatus = { state: 'unknown', refreshing: false };
const statuses = new Map<string, BridgeStatus>();
const listeners = new Set<() => void>();
// While a probe is out, the server's "unknown command" answer is hidden when the plugin is not installed.
let hideUnknownUntil = 0;

export const readBridgeStatus = (server: string): BridgeStatus => statuses.get(server) || idle;

export const setBridgeStatus = (server: string, patch: Partial<BridgeStatus>) => {
    statuses.set(server, { ...readBridgeStatus(server), ...patch });
    listeners.forEach((listener) => listener());
};

export const resetBridgeStatus = (server: string) => {
    statuses.delete(server);
    listeners.forEach((listener) => listener());
};

/** True for the server's answer to a command it does not know, right after the panel asked the plugin something. */
export const isProbeNoise = (line: string): boolean =>
    Date.now() < hideUnknownUntil && /Unknown or incomplete command|<--\[HERE\]/i.test(stripAnsi(line));

export const useBridgeStatus = (server: string): BridgeStatus => {
    const [status, setStatus] = useState(readBridgeStatus(server));

    useEffect(() => {
        const update = () => setStatus(readBridgeStatus(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return status;
};

/**
 * Asks the plugin something. "handshake" finds out whether it is there (and sends the players), "refresh" makes it send
 * the players again and write the command list again, then say it is done.
 */
export const askPlugin = (
    server: string,
    instance: { send: (event: string, ...args: string[]) => void },
    what: 'handshake' | 'refresh'
) => {
    hideUnknownUntil = Date.now() + 4000;
    if (what === 'handshake') {
        setBridgeStatus(server, { state: readBridgeStatus(server).state === 'connected' ? 'connected' : 'checking' });
    } else {
        setBridgeStatus(server, { refreshing: true });
    }
    instance.send('send command', `${BRIDGE_COMMAND} ${what}`);

    // No answer: the plugin is not there (or too old to know the command).
    setTimeout(
        () => {
            const current = readBridgeStatus(server);
            if (what === 'handshake' && current.state === 'checking') setBridgeStatus(server, { state: 'missing' });
            if (what === 'refresh' && current.refreshing) {
                setBridgeStatus(server, {
                    refreshing: false,
                    state: current.state === 'connected' ? 'connected' : 'missing',
                });
            }
        },
        what === 'handshake' ? 5000 : 15000
    );
};

/** What a message from the plugin means for the status. */
export const handleBridgeStatusMessage = (server: string, message: BridgeMessage) => {
    const patch: Partial<BridgeStatus> = { state: 'connected' };

    if (message.event === 'handshake') {
        if (typeof message.version === 'string') patch.version = message.version.slice(0, 40);
        if (typeof message.platform === 'string') patch.platform = message.platform.slice(0, 20);
        if (typeof message.minecraft === 'string') patch.minecraft = message.minecraft.slice(0, 20);
    } else if (message.event === 'refreshed') {
        patch.refreshing = false;
        patch.lastRefreshed = Date.now();
    }

    setBridgeStatus(server, patch);
};
