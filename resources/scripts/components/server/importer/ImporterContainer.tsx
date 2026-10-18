import React, { useState } from 'react';
import { CheckCircleIcon, DocumentIcon, ExclamationIcon, FolderIcon, ServerIcon } from '@heroicons/react/outline';
import tw from 'twin.macro';
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
import { ImportTestResult, testImport } from '@/api/server/files/importer';
import { isActive, startImportJob, useJobs } from '@/api/server/jobs';
import { defaultPort, emptyForm, formProblem, ImportForm, toPayload } from '@/lib/importer';
import { formatBytes } from '@/lib/jobs';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div css={tw`min-w-0`}>
        <Label>{label}</Label>
        {children}
        {hint && <p css={tw`mt-1.5 text-xs text-neutral-400`}>{hint}</p>}
    </div>
);

type Step = 'form' | 'checked';

/** Copies everything from an SFTP or FTP server into this server: the node connects to the other server and downloads the files itself. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { clearFlashes, addFlash } = useFlash();

    const [form, setForm] = useState<ImportForm>(emptyForm);
    const [step, setStep] = useState<Step>('form');
    const [busy, setBusy] = useState(false);
    const [checked, setChecked] = useState<ImportTestResult | null>(null);
    const [overwrite, setOverwrite] = useState(true);
    const { data: jobs } = useJobs();
    const importing = (jobs || []).find((j) => j.type === 'import' && isActive(j));

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

    // The node does the import as a job: it goes on when this page is closed. This only starts it; the box in the bottom right corner shows how it goes.
    const start = () => {
        clearFlashes('importer');
        setBusy(true);

        startImportJob(uuid, toPayload(form, { fingerprint: checked?.fingerprint, overwrite }))
            .then(() => {
                // The login is not kept around once the node has it.
                setForm((f) => ({ ...f, password: '', passphrase: '', privateKey: '' }));
                setBusy(false);
                setStep('form');
            })
            .catch((e) => {
                setBusy(false);
                addFlash({
                    key: 'importer',
                    type: 'error',
                    title: 'Could not start the import',
                    message: httpErrorToHuman(e),
                });
            });
    };

    const again = () => {
        setChecked(null);
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

            {importing && (
                <div
                    css={tw`flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 mb-4 text-sm text-primary-700`}
                >
                    <ServerIcon css={tw`w-5 h-5 flex-shrink-0 mt-0.5`} />
                    <p>
                        An import is already running for this server ({importing.title}). Follow it in the box in the
                        bottom right corner. Only one import runs at a time.
                    </p>
                </div>
            )}

            {running && (
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
                        <Button
                            type={'button'}
                            color={'green'}
                            disabled={running || busy || !!importing}
                            onClick={start}
                        >
                            {busy ? <Spinner size={'small'} /> : 'Import everything'}
                        </Button>
                    </div>
                </SectionCard>
            )}
        </ServerContentBlock>
    );
};
