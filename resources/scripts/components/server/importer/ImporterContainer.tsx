import React, { useEffect, useRef, useState } from 'react';
import {
    CheckCircleIcon,
    CloudDownloadIcon,
    DocumentIcon,
    ExclamationIcon,
    FolderIcon,
    ServerIcon,
} from '@heroicons/react/outline';
import tw from 'twin.macro';
import { Link } from 'react-router-dom';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import SectionCard from '@/components/elements/SectionCard';
import Input, { Textarea } from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import Label from '@/components/elements/Label';
import Switch from '@/components/elements/Switch';
import Spinner from '@/components/elements/Spinner';
import Can from '@/components/elements/Can';
import { Button } from '@/components/elements/button/index';
import { ServerContext } from '@/state/server';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { ImportTestResult, runImport, testImport } from '@/api/server/files/importer';
import {
    applyEvent,
    defaultPort,
    emptyForm,
    formatBytes,
    formProblem,
    ImportForm,
    ImportProgress,
    initialProgress,
    percent,
    toPayload,
} from '@/lib/importer';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div css={tw`min-w-0`}>
        <Label>{label}</Label>
        {children}
        {hint && <p css={tw`mt-1.5 text-xs text-neutral-400`}>{hint}</p>}
    </div>
);

type Step = 'form' | 'checked' | 'running' | 'done';

/** Copies everything from an SFTP or FTP server into this server: the node connects to the other server and downloads the files itself. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { clearFlashes, addFlash } = useFlash();

    const [form, setForm] = useState<ImportForm>(emptyForm);
    const [step, setStep] = useState<Step>('form');
    const [busy, setBusy] = useState(false);
    const [checked, setChecked] = useState<ImportTestResult | null>(null);
    const [overwrite, setOverwrite] = useState(true);
    const [progress, setProgress] = useState<ImportProgress>(initialProgress);
    const abort = useRef<AbortController | null>(null);

    // Leaving the page stops the import, the login does not stay in the browser longer than that.
    useEffect(() => () => abort.current?.abort(), []);

    const set = <K extends keyof ImportForm>(key: K, value: ImportForm[K]) => setForm((f) => ({ ...f, [key]: value }));

    const problem = formProblem(form);
    const running = status !== null && status !== 'offline';

    const check = () => {
        clearFlashes('importer');
        setBusy(true);

        testImport(uuid, toPayload(form))
            .then((result) => {
                setChecked(result);
                setStep('checked');
            })
            .catch((e) =>
                addFlash({ key: 'importer', type: 'error', title: 'Could not connect', message: httpErrorToHuman(e) })
            )
            .then(() => setBusy(false));
    };

    const start = () => {
        clearFlashes('importer');
        const controller = new AbortController();
        abort.current = controller;
        let state = initialProgress();
        setProgress(state);
        setStep('running');

        runImport(
            uuid,
            toPayload(form, { fingerprint: checked?.fingerprint, overwrite }),
            (line) => {
                state = applyEvent(state, line);
                setProgress(state);
            },
            controller.signal
        )
            .then(() => {
                // The node always ends with finished or error; a stream that ends without either was cut off.
                if (state.phase !== 'finished' && state.phase !== 'error') {
                    state = { ...state, phase: 'error', error: 'The connection was lost before the import was over.' };
                    setProgress(state);
                }
            })
            .catch((e) => {
                if (controller.signal.aborted) {
                    state = { ...state, phase: 'error', error: 'Cancelled.' };
                } else {
                    state = { ...state, phase: 'error', error: httpErrorToHuman(e) };
                }
                setProgress(state);
            })
            .then(() => {
                abort.current = null;
                setStep('done');
            });
    };

    const again = () => {
        // The password is gone once the import is over.
        setForm((f) => ({ ...f, password: '', passphrase: '', privateKey: '' }));
        setChecked(null);
        setProgress(initialProgress());
        setStep('form');
    };

    const sftp = form.protocol === 'sftp';

    return (
        <ServerContentBlock title={'Importer'}>
            <PageHeader
                title={'Importer'}
                subtitle={`Copy everything from another server into ${serverName}. The node connects to the other server and downloads the files itself.`}
            />
            <FlashMessageRender byKey={'importer'} css={tw`mb-4`} />

            {running && step !== 'running' && (
                <div
                    css={tw`flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 mb-4 text-sm text-yellow-700`}
                >
                    <ExclamationIcon css={tw`w-5 h-5 flex-shrink-0 mt-0.5`} />
                    <p>
                        This server is {status === 'starting' ? 'starting' : 'running'}. Stop it before importing:
                        worlds and other files that are in use can be damaged when they are replaced.
                    </p>
                </div>
            )}

            {(step === 'form' || step === 'checked') && (
                <SectionCard
                    icon={<ServerIcon className={'h-5 w-5'} />}
                    title={'The server to take the files from'}
                    description={'Its login is used for this import only. It is not saved anywhere.'}
                >
                    <div css={tw`p-5 grid gap-4 md:grid-cols-2`}>
                        <Field label={'Protocol'}>
                            <Select
                                value={form.protocol}
                                disabled={busy || step === 'checked'}
                                onChange={(e) => set('protocol', e.currentTarget.value as ImportForm['protocol'])}
                            >
                                <option value={'sftp'}>SFTP (over SSH)</option>
                                <option value={'ftp'}>FTP</option>
                                <option value={'ftps'}>FTPS (FTP with TLS)</option>
                            </Select>
                        </Field>
                        <div css={tw`grid grid-cols-3 gap-4`}>
                            <div css={tw`col-span-2 min-w-0`}>
                                <Field label={'Address'}>
                                    <Input
                                        placeholder={'play.example.com'}
                                        value={form.host}
                                        disabled={busy || step === 'checked'}
                                        onChange={(e) => set('host', e.currentTarget.value)}
                                    />
                                </Field>
                            </div>
                            <Field label={'Port'}>
                                <Input
                                    placeholder={String(defaultPort(form.protocol))}
                                    value={form.port}
                                    disabled={busy || step === 'checked'}
                                    onChange={(e) => set('port', e.currentTarget.value.replace(/\D/g, ''))}
                                />
                            </Field>
                        </div>
                        <Field label={'User name'} hint={sftp ? undefined : 'Leave empty for an anonymous login.'}>
                            <Input
                                autoComplete={'off'}
                                value={form.username}
                                disabled={busy || step === 'checked'}
                                onChange={(e) => set('username', e.currentTarget.value)}
                            />
                        </Field>
                        <Field label={'Password'}>
                            <Input
                                type={'password'}
                                autoComplete={'new-password'}
                                value={form.password}
                                disabled={busy || step === 'checked'}
                                onChange={(e) => set('password', e.currentTarget.value)}
                            />
                        </Field>
                        {sftp && (
                            <>
                                <div css={tw`md:col-span-2`}>
                                    <Field
                                        label={'Private key (instead of a password)'}
                                        hint={'Paste the key, starting with -----BEGIN. Optional.'}
                                    >
                                        <Textarea
                                            rows={4}
                                            css={tw`font-mono text-xs`}
                                            value={form.privateKey}
                                            disabled={busy || step === 'checked'}
                                            onChange={(e) => set('privateKey', e.currentTarget.value)}
                                        />
                                    </Field>
                                </div>
                                {form.privateKey.trim() && (
                                    <Field label={'Passphrase of the key'}>
                                        <Input
                                            type={'password'}
                                            autoComplete={'new-password'}
                                            value={form.passphrase}
                                            disabled={busy || step === 'checked'}
                                            onChange={(e) => set('passphrase', e.currentTarget.value)}
                                        />
                                    </Field>
                                )}
                            </>
                        )}
                        {form.protocol === 'ftps' && (
                            <div css={tw`md:col-span-2`}>
                                <Switch
                                    name={'insecure_tls'}
                                    label={'Accept any certificate'}
                                    description={'Only for servers with a self-signed certificate.'}
                                    defaultChecked={form.insecureTls}
                                    onChange={(e) => set('insecureTls', e.currentTarget.checked)}
                                />
                            </div>
                        )}
                        <Field
                            label={'Folder to take'}
                            hint={'Everything in it, with its folders. “/” is the whole login.'}
                        >
                            <Input
                                value={form.path}
                                disabled={busy || step === 'checked'}
                                onChange={(e) => set('path', e.currentTarget.value)}
                            />
                        </Field>
                        <Field label={'Put it in'} hint={`A folder of ${serverName}. “/” is the main folder.`}>
                            <Input
                                value={form.directory}
                                disabled={busy || step === 'checked'}
                                onChange={(e) => set('directory', e.currentTarget.value)}
                            />
                        </Field>
                    </div>
                    {step === 'form' && (
                        <div css={tw`flex items-center justify-between gap-4 border-t border-neutral-500 px-5 py-4`}>
                            <p css={tw`text-sm text-neutral-400`}>
                                {problem || 'Nothing is copied yet, first it connects and looks.'}
                            </p>
                            <Can action={'file.create'}>
                                <Button type={'button'} disabled={!!problem || busy} onClick={check}>
                                    {busy ? <Spinner size={'small'} /> : 'Connect'}
                                </Button>
                            </Can>
                        </div>
                    )}
                </SectionCard>
            )}

            {step === 'checked' && checked && (
                <SectionCard
                    className={'mt-4'}
                    icon={<CheckCircleIcon className={'h-5 w-5'} />}
                    title={`Connected to ${form.host}`}
                    description={
                        checked.fingerprint
                            ? 'Check that this is your server: the fingerprint below has to be the one of its SSH key. The import only goes on with this server.'
                            : 'FTP does not prove which server it is. Only continue if you trust the address.'
                    }
                >
                    <div css={tw`p-5`}>
                        {checked.fingerprint && (
                            <p
                                css={tw`mb-4 rounded-lg bg-neutral-600 px-3 py-2 font-mono text-xs break-all text-neutral-100`}
                            >
                                {checked.fingerprint}
                            </p>
                        )}
                        <p css={tw`text-sm font-medium text-neutral-100 mb-2`}>
                            In {form.path || '/'}: {checked.total} {checked.total === 1 ? 'entry' : 'entries'}
                        </p>
                        <ul
                            css={tw`divide-y divide-neutral-500 rounded-lg border border-neutral-500 text-sm max-h-64 overflow-auto`}
                        >
                            {checked.entries.slice(0, 50).map((entry) => (
                                <li key={entry.name} css={tw`flex items-center px-3 py-2`}>
                                    {entry.dir ? (
                                        <FolderIcon css={tw`w-4 h-4 mr-2 text-neutral-300 flex-shrink-0`} />
                                    ) : (
                                        <DocumentIcon css={tw`w-4 h-4 mr-2 text-neutral-300 flex-shrink-0`} />
                                    )}
                                    <span css={tw`truncate flex-1`}>{entry.name}</span>
                                    {!entry.dir && (
                                        <span css={tw`text-xs text-neutral-400 ml-3`}>{formatBytes(entry.size)}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {checked.total === 0 && (
                            <p css={tw`text-sm text-neutral-400 mt-2`}>That folder is empty. Check the folder name.</p>
                        )}
                        <div css={tw`mt-5`}>
                            <Switch
                                name={'overwrite'}
                                label={'Replace files that are already here'}
                                description={
                                    'Off: files with the same name in this server are kept and the ones from the other server are skipped.'
                                }
                                defaultChecked={overwrite}
                                onChange={(e) => setOverwrite(e.currentTarget.checked)}
                            />
                        </div>
                    </div>
                    <div css={tw`flex items-center justify-between gap-4 border-t border-neutral-500 px-5 py-4`}>
                        <Button type={'button'} variant={Button.Variants.Secondary} onClick={again}>
                            Change
                        </Button>
                        <Button type={'button'} color={'green'} disabled={running} onClick={start}>
                            Import everything
                        </Button>
                    </div>
                </SectionCard>
            )}

            {(step === 'running' || step === 'done') && (
                <SectionCard
                    icon={<CloudDownloadIcon className={'h-5 w-5'} />}
                    title={
                        progress.phase === 'finished'
                            ? 'Done'
                            : progress.phase === 'error'
                            ? 'Stopped'
                            : progress.phase === 'copying'
                            ? 'Copying'
                            : 'Looking at the files'
                    }
                    description={`From ${form.host}${form.path && form.path !== '/' ? form.path : ''} to ${
                        form.directory || '/'
                    }`}
                >
                    <div css={tw`p-5`}>
                        {progress.phase === 'connecting' && (
                            <p css={tw`text-sm text-neutral-400`}>
                                <Spinner size={'small'} css={tw`inline-block mr-2`} />
                                Connecting...
                            </p>
                        )}
                        {progress.phase === 'scanning' && (
                            <p css={tw`text-sm text-neutral-400`}>
                                <Spinner size={'small'} css={tw`inline-block mr-2`} />
                                Looking at the files... {progress.scanned} found so far
                            </p>
                        )}
                        {(progress.phase === 'copying' || progress.phase === 'finished' || progress.done > 0) && (
                            <>
                                <div css={tw`flex items-baseline justify-between mb-2`}>
                                    <p css={tw`text-sm font-medium text-neutral-100`}>
                                        {progress.done} of {progress.files} files
                                    </p>
                                    <p css={tw`text-xs text-neutral-400`}>
                                        {formatBytes(progress.bytes)} of {formatBytes(progress.bytesTotal)}
                                    </p>
                                </div>
                                <div css={tw`h-2 w-full rounded-full bg-neutral-500 overflow-hidden`}>
                                    <div
                                        css={tw`h-full bg-primary-600 transition-all duration-150`}
                                        style={{ width: `${percent(progress.done, progress.files)}%` }}
                                    />
                                </div>
                                {progress.current && step === 'running' && (
                                    <p css={tw`mt-2 text-xs text-neutral-400 truncate`}>{progress.current}</p>
                                )}
                            </>
                        )}

                        {progress.phase === 'finished' && (
                            <p css={tw`mt-4 text-sm text-green-700`}>
                                {progress.done - progress.failed.length - progress.skipped} files copied
                                {progress.skipped > 0 && `, ${progress.skipped} kept as they were`}
                                {progress.failed.length > 0 && `, ${progress.failed.length} failed`}.
                            </p>
                        )}
                        {progress.phase === 'error' && (
                            <p css={tw`mt-4 text-sm text-red-600`}>
                                {progress.error}
                                {progress.done > 0 && ` ${progress.done} of ${progress.files} files were done.`}
                            </p>
                        )}

                        {progress.failed.length > 0 && (
                            <div css={tw`mt-4`}>
                                <p css={tw`text-sm font-medium text-neutral-100 mb-2`}>Not copied</p>
                                <ul
                                    css={tw`divide-y divide-neutral-500 rounded-lg border border-neutral-500 text-xs max-h-48 overflow-auto`}
                                >
                                    {progress.failed.slice(0, 200).map((f, i) => (
                                        <li key={i} css={tw`px-3 py-2`}>
                                            <span css={tw`font-mono`}>{f.path}</span>
                                            <span css={tw`text-red-600 ml-2`}>{f.error}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {progress.warnings.length > 0 && (
                            <ul css={tw`mt-4 text-xs text-yellow-700 space-y-1`}>
                                {progress.warnings.slice(0, 20).map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div css={tw`flex items-center justify-between gap-4 border-t border-neutral-500 px-5 py-4`}>
                        {step === 'running' ? (
                            <Button
                                type={'button'}
                                variant={Button.Variants.Secondary}
                                onClick={() => abort.current?.abort()}
                            >
                                Cancel
                            </Button>
                        ) : (
                            <>
                                <Button type={'button'} variant={Button.Variants.Secondary} onClick={again}>
                                    Import another
                                </Button>
                                <Link to={`/server/${id}/files`}>
                                    <Button type={'button'}>Open the files</Button>
                                </Link>
                            </>
                        )}
                    </div>
                </SectionCard>
            )}
        </ServerContentBlock>
    );
};
