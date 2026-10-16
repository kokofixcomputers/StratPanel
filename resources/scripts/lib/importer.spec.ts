import { defaultPort, emptyForm, formProblem, ImportForm, toPayload } from '@/lib/importer';

const form = (patch: Partial<ImportForm> = {}): ImportForm => ({
    ...emptyForm(),
    host: 'play.example.com',
    username: 'mc',
    password: 'secret',
    ...patch,
});

describe('lib/importer', () => {
    it('uses the usual port of each protocol', () => {
        expect(defaultPort('sftp')).toBe(22);
        expect(defaultPort('ftp')).toBe(21);
        expect(defaultPort('ftps')).toBe(21);
    });

    it('sends FTPS as FTP with TLS', () => {
        expect(toPayload(form({ protocol: 'ftps', insecureTls: true }))).toMatchObject({
            protocol: 'ftp',
            tls: true,
            insecure_tls: true,
            port: 21,
        });
        expect(toPayload(form({ protocol: 'ftp', insecureTls: true }))).toMatchObject({
            protocol: 'ftp',
            tls: false,
            insecure_tls: false,
        });
    });

    it('sends the key only for SFTP and the fingerprint and options when given', () => {
        expect(toPayload(form({ privateKey: 'KEY' }))).toMatchObject({ protocol: 'sftp', private_key: 'KEY' });
        expect(toPayload(form({ protocol: 'ftp', privateKey: 'KEY' })).private_key).toBe('');
        expect(
            toPayload(form({ port: '2222', path: '', directory: '' }), { fingerprint: 'SHA256:x', overwrite: true })
        ).toMatchObject({
            port: 2222,
            fingerprint: 'SHA256:x',
            overwrite: true,
            path: '/',
            directory: '/',
        });
    });

    it('says what is wrong with the form', () => {
        expect(formProblem(form())).toBeNull();
        expect(formProblem(form({ host: '' }))).toContain('address');
        expect(formProblem(form({ host: 'sftp://play.example.com' }))).toContain('without');
        expect(formProblem(form({ port: '99999' }))).toContain('port');
        expect(formProblem(form({ username: '' }))).toContain('user');
        expect(formProblem(form({ password: '' }))).toContain('password or a private key');
        expect(formProblem(form({ password: '', privateKey: 'KEY' }))).toBeNull();
        // FTP may be anonymous.
        expect(formProblem(form({ protocol: 'ftp', username: '', password: '' }))).toBeNull();
    });
});
