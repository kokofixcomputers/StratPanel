import {
    clearOnlinePlayers,
    handleBridgeMessage,
    handleLogLine,
    parseLogLine,
    readOnlinePlayers,
} from './onlinePlayers';

describe('online player log parsing', () => {
    it('reads logins and disconnects written by the server', () => {
        expect(
            parseLogLine(
                '[12:00:01] [Server thread/INFO]: Steve[/1.2.3.4:51234] logged in with entity id 123 at (0.5, 64.0, 0.5)'
            )
        ).toEqual({ type: 'join', name: 'Steve' });
        expect(parseLogLine('[12:05:01] [Server thread/INFO]: Steve lost connection: Disconnected')).toEqual({
            type: 'leave',
            name: 'Steve',
        });
        expect(
            parseLogLine('\u001b[33m[12:00:00 INFO]: .Bedrock_Guy[/10.0.0.1:1] logged in with entity id 9 at (1, 2, 3)')
        ).toEqual({
            type: 'join',
            name: '.Bedrock_Guy',
        });
    });

    it('ignores messages plugins can change and unrelated lines', () => {
        expect(parseLogLine('[12:00:00 INFO]: Steve joined the game')).toBeNull();
        expect(parseLogLine('[12:00:00 INFO]: <Steve> logged in with entity id')).toBeNull();
        expect(parseLogLine('[12:00:00 INFO]: Done (3.4s)! For help, type "help"')).toBeNull();
    });

    it('reads the uuid line', () => {
        expect(parseLogLine('[12:00:00 INFO]: UUID of player Steve is 13bc7d5e-f906-41ff-a949-6c1eb677fe03')).toEqual({
            type: 'uuid',
            name: 'Steve',
            uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03',
        });
    });

    it('keeps a set of online players and clears it', () => {
        const login = (n: string) => `[1:00:00 INFO]: ${n}[/1.1.1.1:1] logged in with entity id 1 at (0, 0, 0)`;
        handleLogLine('s', login('A'));
        handleLogLine('s', login('B'));
        handleLogLine('s', login('A'));
        handleLogLine('s', '[1:00:00 INFO]: A lost connection: Timed out');
        handleLogLine('s', '[1:00:00 INFO]: A lost connection: Timed out');
        expect(readOnlinePlayers('s').online).toEqual(['B']);
        clearOnlinePlayers('s');
        expect(readOnlinePlayers('s').online).toEqual([]);
    });

    it('follows the plugin: joins, leaves and a full list', () => {
        handleBridgeMessage('b', { event: 'player-join', name: 'A', uuid: '13bc7d5e-f906-41ff-a949-6c1eb677fe03' });
        handleBridgeMessage('b', { event: 'player-join', name: 'B' });
        handleBridgeMessage('b', { event: 'player-join', name: 'A' });
        handleBridgeMessage('b', { event: 'player-join', name: '<bad>' });
        expect(readOnlinePlayers('b').online).toEqual(['A', 'B']);
        expect(readOnlinePlayers('b').uuids.A).toBe('13bc7d5e-f906-41ff-a949-6c1eb677fe03');

        handleBridgeMessage('b', { event: 'player-leave', name: 'A' });
        expect(readOnlinePlayers('b').online).toEqual(['B']);

        handleBridgeMessage('b', { event: 'players', players: [{ name: 'C' }, { name: 'D' }, { nope: 1 }] });
        expect(readOnlinePlayers('b').online).toEqual(['C', 'D']);
    });
});
