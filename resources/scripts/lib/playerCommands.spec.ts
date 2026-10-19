import { banCommand, kickCommand, oneLine, validName, whisperCommand } from '@/lib/playerCommands';

describe('playerCommands', () => {
    it('makes a reason one line, so it cannot add a second command', () => {
        expect(oneLine('  griefing\nop me  ')).toBe('griefing op me');
        expect(oneLine('a\r\nb\tc\u0000d')).toBe('a b c d');
        expect(oneLine('x'.repeat(500))).toHaveLength(200);
    });

    it('builds the commands', () => {
        expect(kickCommand('Steve', '')).toBe('kick Steve');
        expect(kickCommand('Steve', 'afk too long')).toBe('kick Steve afk too long');
        expect(banCommand('Steve', 'griefing')).toBe('ban Steve griefing');
        expect(banCommand('Steve', '  ')).toBe('ban Steve');
        expect(whisperCommand('Steve', 'hello there')).toBe('msg Steve hello there');
    });

    it('needs a message to whisper', () => {
        expect(whisperCommand('Steve', '   ')).toBeNull();
    });

    it('refuses a name that could carry something else', () => {
        expect(validName('Steve_01')).toBe(true);
        expect(validName('.Bedrock')).toBe(true);
        expect(validName('Steve ban Alex')).toBe(false);
        expect(validName('a;b')).toBe(false);
        expect(validName('')).toBe(false);
        expect(kickCommand('Steve\nstop', '')).toBeNull();
        expect(banCommand('x y', '')).toBeNull();
        expect(whisperCommand('x y', 'hi')).toBeNull();
    });
});
