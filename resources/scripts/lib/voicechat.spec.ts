import { readPort, withAllocation } from './voicechat';

describe('voice chat config', () => {
    it('reads the port', () => {
        expect(readPort('# Simple Voice Chat\nport=24454\nmax_voice_distance=48.0\n')).toBe(24454);
        expect(readPort('port=-1')).toBe(-1);
        expect(readPort('max_voice_distance=48.0')).toBeNull();
    });

    it('sets the port and the address players connect to, keeping the rest of the file', () => {
        expect(
            withAllocation('# comment\nport=24454\nvoice_host=\nmax_voice_distance=48.0\n', 25001, 'play.example.com')
        ).toBe('# comment\nport=25001\nvoice_host=play.example.com:25001\nmax_voice_distance=48.0\n');
        expect(withAllocation('port=-1\n', 25001, 'play.example.com')).toBe(
            'port=25001\nvoice_host=play.example.com:25001\n'
        );
        expect(withAllocation('', 25001, '1.2.3.4')).toBe('port=25001\nvoice_host=1.2.3.4:25001\n');
    });
});
