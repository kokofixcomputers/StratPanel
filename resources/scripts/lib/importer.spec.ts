import {
    applyEvent,
    defaultPort,
    emptyForm,
    formatBytes,
    formProblem,
    ImportForm,
    initialProgress,
    percent,
    toPayload,
} from '@/lib/importer';

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

    it('follows an import line by line', () => {
        let state = initialProgress();
        state = applyEvent(state, { event: 'scanning', entries: 500 });
        expect(state.phase).toBe('scanning');
        state = applyEvent(state, { event: 'listing', files: 3, dirs: 1, bytes: 300 });
        expect(state).toMatchObject({ phase: 'copying', files: 3, dirs: 1, bytesTotal: 300 });
        state = applyEvent(state, {
            event: 'file',
            done: 1,
            total: 3,
            path: 'a.jar',
            ok: true,
            bytes: 100,
            bytesTotal: 300,
        });
        state = applyEvent(state, {
            event: 'file',
            done: 2,
            total: 3,
            path: 'b.jar',
            ok: false,
            error: 'denied',
            bytes: 100,
            bytesTotal: 300,
        });
        state = applyEvent(state, {
            event: 'file',
            done: 3,
            total: 3,
            path: 'c.jar',
            ok: true,
            skipped: true,
            bytes: 200,
            bytesTotal: 300,
        });
        expect(state).toMatchObject({ done: 3, skipped: 1, bytes: 200 });
        expect(state.failed).toEqual([{ path: 'b.jar', error: 'denied' }]);
        state = applyEvent(state, { event: 'warning', path: 'x', error: 'no access' });
        expect(state.warnings).toEqual(['x: no access']);
        expect(applyEvent(state, { event: 'finished' }).phase).toBe('finished');
        expect(applyEvent(state, { event: 'error', error: 'disk full' })).toMatchObject({
            phase: 'error',
            error: 'disk full',
        });
        // Lines it does not know are ignored.
        expect(applyEvent(state, { event: 'something new' })).toBe(state);
    });

    it('does not let the byte count go back when files finish out of order', () => {
        let state = initialProgress();
        state = applyEvent(state, {
            event: 'file',
            done: 2,
            total: 4,
            path: 'b',
            ok: true,
            bytes: 200,
            bytesTotal: 400,
        });
        state = applyEvent(state, {
            event: 'file',
            done: 3,
            total: 4,
            path: 'a',
            ok: true,
            bytes: 150,
            bytesTotal: 400,
        });
        expect(state.bytes).toBe(200);
    });

    it('computes percentages and sizes', () => {
        expect(percent(0, 0)).toBe(0);
        expect(percent(1, 3)).toBe(33);
        expect(percent(5, 3)).toBe(100);
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
        expect(formatBytes(150 * 1024 * 1024 * 1024)).toBe('150 GB');
    });
});
