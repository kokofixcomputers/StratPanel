import {
    BRIDGE_COMMAND,
    handleBridgeStatusMessage,
    isBridgeLine,
    isProbeNoise,
    parseBridgeLine,
    parseTrustedBridgeLine,
    readBridgeStatus,
    toPlayer,
} from './bridge';

describe('bridge messages', () => {
    it('reads a message after the tag, whatever the logger put in front of it', () => {
        expect(
            parseBridgeLine(
                '[12:00:00 INFO]: ::stratpanel:: {"event":"commands-updated","generatedAt":"2026-10-05T12:00:00Z"}'
            )
        ).toEqual({ event: 'commands-updated', generatedAt: '2026-10-05T12:00:00Z' });
        expect(parseBridgeLine('\u001b[0m[INFO] ::stratpanel:: {"event":"ping"}\u001b[0m')).toEqual({ event: 'ping' });
    });

    it('recognises a bridge line even when the message is broken, so it is still hidden', () => {
        expect(isBridgeLine('::stratpanel:: {oops')).toBe(true);
        expect(parseBridgeLine('::stratpanel:: {oops')).toBeNull();
        expect(parseBridgeLine('::stratpanel:: {"nope":1}')).toBeNull();
        expect(isBridgeLine('Steve joined the game')).toBe(false);
    });

    it('only trusts lines that start with the log header and the plugin prefix', () => {
        const message = '::stratpanel:: {"event":"player-join","name":"Steve"}';

        expect(parseTrustedBridgeLine(`[17:23:31 INFO]: [StratPanel] ${message}`)).toEqual({
            event: 'player-join',
            name: 'Steve',
        });
        expect(parseTrustedBridgeLine(`[17:23:31] [Server thread/INFO]: [StratPanel] ${message}`)).not.toBeNull();
        // What a player can type into chat, or another plugin can print, never starts like that.
        expect(parseTrustedBridgeLine(`[17:23:31 INFO]: <Steve> ${message}`)).toBeNull();
        expect(parseTrustedBridgeLine(`[17:23:31 INFO]: [Other] ${message}`)).toBeNull();
        expect(parseTrustedBridgeLine(`[17:23:31 INFO]: <Steve> [StratPanel] ${message}`)).toBeNull();
        expect(parseTrustedBridgeLine(message)).toBeNull();
    });

    it('accepts player names and uuids that can be real', () => {
        expect(toPlayer({ name: 'Steve', uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03' })).toEqual({
            name: 'Steve',
            uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03',
        });
        expect(toPlayer({ name: '.Bedrock Guy' })).toEqual({ name: '.Bedrock Guy', uuid: null });
        expect(toPlayer({ name: 'a<b>' })).toBeNull();
        expect(toPlayer({ name: 'x'.repeat(40) })).toBeNull();
        expect(toPlayer(null)).toBeNull();
    });

    it('hides every line that mentions the command of the panel', () => {
        expect(isBridgeLine(`[INFO]: ${BRIDGE_COMMAND} handshake<--[HERE]`)).toBe(true);
        expect(isBridgeLine('[INFO]: Unknown or incomplete command, see below for error')).toBe(false);
        expect(isProbeNoise('[INFO]: Unknown or incomplete command, see below for error')).toBe(false);
    });

    it('follows the answers of the plugin', () => {
        handleBridgeStatusMessage('s', { event: 'handshake', version: '1.2.3', platform: 'paper', minecraft: '26.3' });
        expect(readBridgeStatus('s')).toMatchObject({
            state: 'connected',
            version: '1.2.3',
            platform: 'paper',
            refreshing: false,
        });

        handleBridgeStatusMessage('s', { event: 'refreshed' });
        expect(readBridgeStatus('s').lastRefreshed).toBeGreaterThan(0);
    });
});
