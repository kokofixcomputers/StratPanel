export type ImportProtocol = 'sftp' | 'ftp' | 'ftps';

/** What the person fills in. */
export interface ImportForm {
    protocol: ImportProtocol;
    host: string;
    port: string;
    username: string;
    password: string;
    privateKey: string;
    passphrase: string;
    insecureTls: boolean;
    path: string;
    directory: string;
}

export const emptyForm = (): ImportForm => ({
    protocol: 'sftp',
    host: '',
    port: '',
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
    insecureTls: false,
    path: '/',
    directory: '/',
});

export const defaultPort = (protocol: ImportProtocol): number => (protocol === 'sftp' ? 22 : 21);

/** What the panel is sent. FTPS is FTP with TLS on the same port. */
export const toPayload = (
    form: ImportForm,
    options: { fingerprint?: string; overwrite?: boolean } = {}
): Record<string, unknown> => ({
    protocol: form.protocol === 'sftp' ? 'sftp' : 'ftp',
    host: form.host.trim(),
    port: form.port.trim() ? parseInt(form.port, 10) : defaultPort(form.protocol),
    username: form.username.trim(),
    password: form.password,
    private_key: form.protocol === 'sftp' ? form.privateKey : '',
    passphrase: form.protocol === 'sftp' ? form.passphrase : '',
    tls: form.protocol === 'ftps',
    insecure_tls: form.protocol === 'ftps' && form.insecureTls,
    fingerprint: options.fingerprint || '',
    path: form.path.trim() || '/',
    directory: form.directory.trim() || '/',
    overwrite: !!options.overwrite,
});

/** Why the form can not be sent yet, null when it can. */
export const formProblem = (form: ImportForm): string | null => {
    if (!form.host.trim()) return 'Enter the address of the server.';
    if (/[/\s]/.test(form.host.trim()))
        return 'The address is a name or an IP, such as play.example.com, without http:// or a path.';
    if (form.port.trim() && !(parseInt(form.port, 10) >= 1 && parseInt(form.port, 10) <= 65535))
        return 'The port is a number from 1 to 65535.';
    if (form.protocol === 'sftp' && !form.username.trim()) return 'Enter the user name.';
    if (form.protocol === 'sftp' && !form.password && !form.privateKey.trim())
        return 'Enter a password or a private key.';

    return null;
};
