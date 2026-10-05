import { readEnabled, readPort, withPort } from './bluemap';

const FILE = `# The web server
enabled: true
webroot: "bluemap/web"
# The port
port: 8100 # default
ip: "0.0.0.0"
`;

describe('BlueMap webserver.conf', () => {
    it('reads the port', () => {
        expect(readPort(FILE)).toBe(8100);
        expect(readPort('port = 10354')).toBe(10354);
        expect(readPort('webroot: "bluemap/web"\n')).toBeNull();
        // Mentioned in a comment is not set.
        expect(readPort('# port: 9999\n')).toBeNull();
    });

    it('changes only the port line', () => {
        expect(withPort(FILE, 10354)).toBe(FILE.replace('port: 8100', 'port: 10354'));
        expect(withPort('port=8100\n', 10354)).toBe('port=10354\n');
    });

    it('adds the port when the file has none', () => {
        expect(withPort('enabled: true\n', 10354)).toBe('enabled: true\nport: 10354\n');
        expect(withPort('', 10354)).toBe('port: 10354\n');
    });

    it('knows when the web server is off', () => {
        expect(readEnabled(FILE)).toBe(true);
        expect(readEnabled('enabled: false\n')).toBe(false);
        expect(readEnabled('webroot: "x"\n')).toBe(true);
    });
});
