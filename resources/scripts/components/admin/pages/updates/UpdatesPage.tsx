import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { formatDistanceToNow } from 'date-fns';
import { ArchiveIcon, CloudDownloadIcon, RefreshIcon, TrashIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Empty, Meter, Pill } from '@/components/admin/AdminTable';
import { Notice } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import {
    Backup,
    getUpdates,
    getUpdateStatus,
    runUpdate,
    UpdateResult,
    UpdatesInfo,
    UpdateStatus,
} from '@/api/admin/updates';

// The steps of each kind of work, in order; the updater says which one it is at.
const STEPS: Record<string, [string, string][]> = {
    panel: [
        ['download', 'Download'],
        ['backup', 'Backup'],
        ['install', 'New files'],
        ['migrate', 'Database'],
        ['finish', 'Restart'],
        ['tools', 'Router, edge'],
    ],
    download: [
        ['download', 'Download'],
        ['tools', 'Router, edge'],
    ],
    local: [['tools', 'Router, edge']],
    restore: [
        ['backup', 'Save current'],
        ['install', 'Restore files'],
        ['finish', 'Restart'],
    ],
    'delete-backup': [['x', 'Delete']],
    backups: [],
};
const TITLES: Record<string, string> = {
    panel: 'Updating the panel',
    download: 'Updating router and edge',
    local: 'Updating router and edge',
    restore: 'Restoring a backup',
    'delete-backup': 'Deleting a backup',
};

const kind = (action?: string) => String(action || '').replace(/-nightly$/, '');
const bytes = (n: number) =>
    n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const when = (sec: number) =>
    new Date(sec * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions);

type Phase = 'waiting' | 'working' | 'dark' | 'done';

interface Progress {
    action: string;
    step: string | null;
    phase: Phase;
    results: UpdateResult[];
    error?: string;
}

const Stat = ({ title, value, sub, tone }: { title: string; value: string; sub: string; tone?: 'green' | 'red' }) => (
    <div className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
        <p className={'text-xs uppercase tracking-wide text-neutral-400'}>{title}</p>
        <p
            className={classNames('mt-1 break-all text-xl font-semibold', {
                'text-green-600': tone === 'green',
                'text-red-600': tone === 'red',
                'text-neutral-50': !tone,
            })}
        >
            {value}
        </p>
        <p className={'mt-0.5 text-xs text-neutral-400'}>{sub}</p>
    </div>
);

/** Admin > Updates: the panel, the router and the edge of this machine, and the backups made before each update. */
export default () => {
    const [info, setInfo] = useState<UpdatesInfo | null>(null);
    const [backups, setBackups] = useState<Backup[] | null>(null);
    const [last, setLast] = useState<UpdateStatus | null>(null);
    const [channel, setChannel] = useState<'latest' | 'nightly'>('latest');
    const [progress, setProgress] = useState<Progress | null>(null);
    const [asking, setAsking] = useState(false);
    const [confirm, setConfirm] = useState<null | { title: string; text: string; go: () => void }>(null);
    const { clearAndAddHttpError } = useFlash();
    // What is shown must not be thrown away when the page is left while the updater runs.
    const alive = useRef(true);
    const before = useRef<string | null>(null);
    const asked = useRef(false);

    useEffect(
        () => () => {
            alive.current = false;
        },
        []
    );

    const finish = useCallback((status: UpdateStatus | null) => {
        asked.current = false;
        setAsking(false);
        before.current = status?.finished_at ?? before.current;
        setLast(status);
        if (status?.finished_at && kind(status.action) !== 'backups') {
            setProgress({
                action: status.action ?? '',
                step: null,
                phase: 'done',
                results: status.results ?? [],
            });
        }
    }, []);

    const poll = useCallback(
        (lastAction?: string) => {
            getUpdateStatus()
                .then((d) => {
                    if (!alive.current) return;
                    if (d.backups) setBackups(d.backups);
                    const s = d.status;
                    const running = d.pending || (s && s.running);
                    const changed = s && s.finished_at && s.finished_at !== before.current;
                    if (running || (asked.current && !changed)) {
                        const action = (s && s.action) || lastAction || '';
                        setProgress({
                            action,
                            step: s?.step ?? null,
                            phase: d.pending || !s || !s.running ? 'waiting' : 'working',
                            results: [],
                        });
                        setTimeout(() => poll(action), 1500);
                        return;
                    }
                    finish(s);
                })
                .catch(() => {
                    // The panel is in maintenance mode (or restarting) while it updates: keep asking until it answers.
                    if (asked.current && alive.current) {
                        setProgress((p) => (p ? { ...p, step: 'install', phase: 'dark' } : p));
                        setTimeout(() => poll(lastAction), 3000);
                    }
                });
        },
        [finish]
    );

    useEffect(() => {
        getUpdates()
            .then((data) => {
                if (!alive.current) return;
                setInfo(data);
                setBackups(data.backups);
                setLast(data.status);
                before.current = data.status?.finished_at ?? null;
                poll();
                // The list of backups is written by the updater: ask for it once when it is not there yet.
                if (data.installed && data.backups === null) {
                    runUpdate({ action: 'backups' }).catch(() => undefined);
                    let tries = 0;
                    const look = () =>
                        getUpdateStatus().then((d) => {
                            if (!alive.current) return;
                            if (d.backups) return setBackups(d.backups);
                            if (++tries < 15 && !asked.current) setTimeout(look, 2000);
                            else if (!asked.current) setBackups([]);
                        });
                    setTimeout(look, 2000);
                }
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    }, []);

    const send = (body: { action: string; channel?: string; backup?: string }) => {
        asked.current = true;
        setAsking(true);
        setProgress({ action: body.action, step: null, phase: 'waiting', results: [] });
        runUpdate(body)
            .then(() => setTimeout(() => poll(body.action), 1200))
            .catch((e) => {
                asked.current = false;
                setAsking(false);
                setProgress({
                    action: body.action,
                    step: null,
                    phase: 'done',
                    results: [{ name: 'Could not start', status: 'failed', detail: e?.response?.data?.error }],
                    error: e?.response?.data?.error || 'The request failed.',
                });
            });
    };

    if (!info) return <Spinner size={'large'} centered />;

    const installed = info.installed;
    const disabled = !installed || asking;
    const lastFailed = !!last?.finished_at && (last.results ?? []).some((r) => r.status === 'failed');
    const backupBytes = (backups ?? []).reduce((a, b) => a + b.size, 0);
    const steps = progress ? STEPS[kind(progress.action)] ?? [] : [];
    const at = progress ? steps.findIndex((s) => s[0] === progress.step) : -1;
    const failed = !!progress && progress.results.some((r) => r.status === 'failed');
    const percent = !progress
        ? 0
        : progress.phase === 'done'
        ? 100
        : Math.max(4, Math.round(((at + 0.5) / Math.max(1, steps.length)) * 100));

    return (
        <AdminPage title={'Updates'} subtitle={'Panel, router, edge and Wings.'}>
            <div className={'grid grid-cols-2 gap-4 lg:grid-cols-4'}>
                <Stat
                    title={'Updater'}
                    value={installed ? 'Ready' : 'Not installed'}
                    sub={installed ? 'Runs when you ask it to' : 'One command to set up'}
                    tone={installed ? 'green' : undefined}
                />
                <Stat
                    title={'Last run'}
                    value={!last?.finished_at ? 'Never' : lastFailed ? 'Failed' : 'Done'}
                    sub={
                        last?.finished_at
                            ? formatDistanceToNow(new Date(last.finished_at), { addSuffix: true })
                            : 'Nothing yet'
                    }
                    tone={last?.finished_at ? (lastFailed ? 'red' : 'green') : undefined}
                />
                <AdminLink to={'/admin/nodes'}>
                    <Stat
                        title={'Newest Wings'}
                        value={info.wings_latest || 'Unknown'}
                        sub={`Update the ${info.node_count} ${
                            info.node_count === 1 ? 'node' : 'nodes'
                        } from their page`}
                    />
                </AdminLink>
                <Stat
                    title={'Backups'}
                    value={backups === null ? '–' : String(backups.length)}
                    sub={
                        backups === null
                            ? 'Looking...'
                            : backupBytes
                            ? `${(backupBytes / 1048576).toFixed(1)} MB on disk`
                            : 'Made before each update'
                    }
                />
            </div>

            <div className={'mt-4 grid gap-4 lg:grid-cols-5'}>
                <SectionCard
                    className={'lg:col-span-3'}
                    icon={<RefreshIcon className={'h-5 w-5'} />}
                    title={'Update this machine'}
                >
                    <div className={'space-y-4'}>
                        {!installed && (
                            <Notice>
                                Install the updater once, then reload:
                                <pre className={'mt-2 text-xs'}>sudo bash tools/updater/install.sh</pre>
                            </Notice>
                        )}
                        <div className={'flex gap-2'} role={'radiogroup'} aria-label={'Where to download from'}>
                            {(['latest', 'nightly'] as const).map((option) => (
                                <label
                                    key={option}
                                    className={classNames(
                                        'cursor-pointer rounded-full border px-3 py-1 text-sm',
                                        channel === option
                                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                                            : 'border-neutral-500 text-neutral-200'
                                    )}
                                >
                                    <input
                                        type={'radio'}
                                        className={'hidden'}
                                        name={'channel'}
                                        value={option}
                                        checked={channel === option}
                                        disabled={!installed}
                                        onChange={() => setChannel(option)}
                                    />
                                    {option === 'latest' ? 'Latest release' : 'Nightly'}
                                </label>
                            ))}
                        </div>
                        <p className={'break-all text-xs'}>
                            <code>{channel === 'latest' ? info.tar_url : info.tar_nightly_url}</code>
                        </p>

                        {progress && (
                            <div className={'rounded-lg border border-neutral-500 p-4'}>
                                <div className={'flex flex-wrap items-baseline justify-between gap-2'}>
                                    <p className={'text-sm font-medium text-neutral-50'}>
                                        {progress.error
                                            ? 'Could not start'
                                            : `${TITLES[kind(progress.action)] || 'Working'}${
                                                  progress.phase === 'done' ? (failed ? ': failed' : ': finished') : ''
                                              }`}
                                    </p>
                                    <p className={'text-xs text-neutral-400'}>
                                        {progress.error ||
                                            (progress.phase === 'dark'
                                                ? 'The panel is restarting, this page continues when it is back...'
                                                : progress.phase === 'waiting'
                                                ? 'Waiting for the updater...'
                                                : '')}
                                    </p>
                                </div>
                                {steps.length > 1 ? (
                                    <div className={'mt-5 pb-1'}>
                                        <div className={'relative h-8'}>
                                            <div
                                                className={'absolute inset-x-0 top-3 h-2 rounded-full bg-neutral-500'}
                                            />
                                            <div
                                                className={classNames(
                                                    'absolute left-0 top-3 h-2 rounded-full transition-all duration-500',
                                                    failed ? 'bg-red-500' : 'bg-primary-600'
                                                )}
                                                style={{
                                                    width: `${
                                                        progress.phase === 'done'
                                                            ? 100
                                                            : at < 0
                                                            ? 0
                                                            : ((at + 0.5) / steps.length) * 100
                                                    }%`,
                                                }}
                                            />
                                            {steps.map((step, i) => {
                                                const state =
                                                    progress.phase === 'done'
                                                        ? 'done'
                                                        : i < at
                                                        ? 'done'
                                                        : i === at
                                                        ? 'now'
                                                        : 'todo';

                                                return (
                                                    <span
                                                        key={step[0]}
                                                        className={classNames(
                                                            'absolute top-1 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 text-2xs font-bold',
                                                            {
                                                                'border-primary-600 bg-primary-600 text-white':
                                                                    state === 'done' && !failed,
                                                                'border-red-500 bg-red-500 text-white':
                                                                    state === 'done' && failed,
                                                                'animate-pulse border-primary-600 bg-white text-primary-700':
                                                                    state === 'now',
                                                                'border-neutral-500 bg-white text-neutral-400':
                                                                    state === 'todo',
                                                            }
                                                        )}
                                                        style={{ left: `${((i + 0.5) / steps.length) * 100}%` }}
                                                    >
                                                        {state === 'done' ? '✓' : i + 1}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <ol className={'flex'}>
                                            {steps.map((step, i) => (
                                                <li
                                                    key={step[0]}
                                                    className={classNames('flex-1 text-center text-xs', {
                                                        'font-medium text-primary-700':
                                                            i === at && progress.phase !== 'done',
                                                        'text-neutral-200': i < at || progress.phase === 'done',
                                                        'text-neutral-400': i > at && progress.phase !== 'done',
                                                    })}
                                                >
                                                    {step[1]}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                ) : (
                                    <div className={'mt-3'}>
                                        <Meter percent={percent} level={failed ? 'danger' : 'ok'} />
                                    </div>
                                )}
                                {progress.results.length > 0 && !progress.error && (
                                    <ul className={'mt-3 space-y-1 text-sm'}>
                                        {progress.results.map((r) => (
                                            <li key={r.name} className={'flex items-center gap-2'}>
                                                <Pill
                                                    tone={
                                                        r.status === 'failed'
                                                            ? 'red'
                                                            : r.status === 'updated'
                                                            ? 'green'
                                                            : 'neutral'
                                                    }
                                                >
                                                    {r.status}
                                                </Pill>
                                                <b>{r.name}</b>
                                                <span className={'text-neutral-300'}>
                                                    {r.detail ||
                                                        {
                                                            updated: 'Updated',
                                                            current: 'Already current',
                                                            missing: 'Not installed',
                                                        }[r.status] ||
                                                        r.status}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className={'flex flex-wrap gap-2'}>
                            <Button
                                disabled={disabled}
                                onClick={() =>
                                    setConfirm({
                                        title: 'Update the panel?',
                                        text: 'It goes into maintenance mode for a minute or two. A backup is made first.',
                                        go: () => send({ action: 'panel', channel }),
                                    })
                                }
                            >
                                <RefreshIcon className={'-ml-1 mr-2 h-4 w-4'} />
                                Update the panel
                            </Button>
                            <Button.Text disabled={disabled} onClick={() => send({ action: 'download', channel })}>
                                <CloudDownloadIcon className={'-ml-1 mr-2 h-4 w-4'} />
                                Router and edge
                            </Button.Text>
                            <Button.Text disabled={disabled} onClick={() => send({ action: 'local', channel })}>
                                From local files
                            </Button.Text>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard className={'lg:col-span-2'} icon={<ArchiveIcon className={'h-5 w-5'} />} title={'Backups'}>
                    <div className={'mb-2 flex justify-end'}>
                        <Button.Text disabled={disabled} onClick={() => send({ action: 'backups' })}>
                            <RefreshIcon className={'-ml-1 mr-1 h-4 w-4'} />
                            Look again
                        </Button.Text>
                    </div>
                    {backups === null ? (
                        <Spinner centered />
                    ) : backups.length === 0 ? (
                        <Empty>No backups yet. One is made before every update.</Empty>
                    ) : (
                        <ul className={'divide-y divide-neutral-500'}>
                            {backups.map((b, i) => (
                                <li key={b.name} className={'flex items-center justify-between gap-3 py-3'}>
                                    <div>
                                        <p className={'text-sm text-neutral-50'}>
                                            {when(b.created)} {i === 0 && <Pill tone={'primary'}>Newest</Pill>}{' '}
                                            {/-before\.tar\.gz$/.test(b.name) && <Pill>Before a restore</Pill>}
                                        </p>
                                        <p className={'text-xs text-neutral-400'}>{bytes(b.size)}</p>
                                    </div>
                                    <div className={'flex gap-1'}>
                                        <Button.Text
                                            disabled={disabled}
                                            onClick={() =>
                                                setConfirm({
                                                    title: 'Restore this backup?',
                                                    text: `${when(
                                                        b.created
                                                    )}. The panel files go back to this state and the panel restarts. The database is not changed. Today's files are saved first.`,
                                                    go: () => send({ action: 'restore', backup: b.name }),
                                                })
                                            }
                                        >
                                            Restore
                                        </Button.Text>
                                        <Button.Text
                                            disabled={disabled}
                                            onClick={() =>
                                                setConfirm({
                                                    title: 'Delete this backup?',
                                                    text: `${when(b.created)} (${bytes(b.size)})`,
                                                    go: () => send({ action: 'delete-backup', backup: b.name }),
                                                })
                                            }
                                        >
                                            <TrashIcon className={'h-4 w-4 text-red-500'} />
                                        </Button.Text>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>
            </div>

            <Dialog.Confirm
                open={!!confirm}
                title={confirm?.title ?? ''}
                confirm={'Continue'}
                onConfirmed={() => {
                    const go = confirm?.go;
                    setConfirm(null);
                    go?.();
                }}
                onClose={() => setConfirm(null)}
            >
                {confirm?.text}
            </Dialog.Confirm>
        </AdminPage>
    );
};
