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

/** How far an import is, built up from the lines the node sends. */
export interface ImportProgress {
    phase: 'connecting' | 'scanning' | 'copying' | 'finished' | 'error';
    scanned: number;
    files: number;
    dirs: number;
    bytes: number;
    bytesTotal: number;
    done: number;
    skipped: number;
    current: string;
    failed: { path: string; error: string }[];
    warnings: string[];
    error: string | null;
}

export const initialProgress = (): ImportProgress => ({
    phase: 'connecting',
    scanned: 0,
    files: 0,
    dirs: 0,
    bytes: 0,
    bytesTotal: 0,
    done: 0,
    skipped: 0,
    current: '',
    failed: [],
    warnings: [],
    error: null,
});

export const applyEvent = (state: ImportProgress, e: any): ImportProgress => {
    switch (e?.event) {
        case 'scanning':
            return { ...state, phase: 'scanning', scanned: Number(e.entries) || state.scanned };
        case 'listing':
            return {
                ...state,
                phase: 'copying',
                files: Number(e.files) || 0,
                dirs: Number(e.dirs) || 0,
                bytesTotal: Number(e.bytes) || 0,
            };
        case 'file':
            return {
                ...state,
                phase: 'copying',
                done: Number(e.done) || state.done,
                files: Number(e.total) || state.files,
                bytes: Math.max(state.bytes, Number(e.bytes) || 0),
                bytesTotal: Number(e.bytesTotal) || state.bytesTotal,
                skipped: state.skipped + (e.skipped ? 1 : 0),
                current: String(e.path || state.current),
                failed:
                    e.ok === false
                        ? [...state.failed, { path: String(e.path || ''), error: String(e.error || 'It failed.') }]
                        : state.failed,
            };
        case 'warning':
            return { ...state, warnings: [...state.warnings, `${e.path}: ${e.error}`] };
        case 'finished':
            return { ...state, phase: 'finished', current: '' };
        case 'error':
            return { ...state, phase: 'error', error: String(e.error || 'The import stopped.') };
        default:
            return state;
    }
};

/** 0 to 100. */
export const percent = (done: number, total: number): number =>
    total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;

export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let i = -1;
    do {
        value /= 1024;
        i++;
    } while (value >= 1024 && i < units.length - 1);

    return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[i]}`;
};
