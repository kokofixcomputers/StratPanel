import React, { useEffect, useState } from 'react';
import {
    ArchiveIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardListIcon,
    CloudDownloadIcon,
    DownloadIcon,
    ExclamationCircleIcon,
    XIcon,
} from '@heroicons/react/outline';
import classNames from 'classnames';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import Spinner from '@/components/elements/Spinner';
import { cancelJob, isActive, refreshJobs, ServerJob, useJobs } from '@/api/server/jobs';
import { anyActive, jobDetail, jobPercent, jobResultLine, kindLabel, statusLabel } from '@/lib/jobs';

const KEY = 'stratosphere:jobs-collapsed';

const readCollapsed = (): boolean => {
    try {
        return window.localStorage.getItem(KEY) === '1';
    } catch (e) {
        return false;
    }
};

const KindIcon = ({ type }: { type: string }) => {
    const cls = 'h-5 w-5';

    return type === 'compress' || type === 'decompress' ? (
        <ArchiveIcon className={cls} />
    ) : type === 'pull' ? (
        <CloudDownloadIcon className={cls} />
    ) : (
        <DownloadIcon className={cls} />
    );
};

const Row = ({ job, canStop, onStop }: { job: ServerJob; canStop: boolean; onStop: () => void }) => {
    const active = isActive(job);
    const percent = jobPercent(job);
    const result = jobResultLine(job);
    const warned = job.status === 'finished' && job.failed > 0;
    const problem = !active && job.status !== 'finished';

    return (
        <li className={'px-4 py-3'}>
            <div className={'flex items-center gap-3'}>
                <span
                    className={classNames(
                        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                        problem ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'
                    )}
                >
                    <KindIcon type={job.type} />
                </span>
                <div className={'min-w-0 flex-1'}>
                    <p className={'truncate text-sm font-semibold text-neutral-50'} title={job.title}>
                        {job.title}
                    </p>
                    <p className={'flex items-center text-xs text-neutral-400'}>
                        {active && <Spinner size={'small'} css={tw`inline-block mr-1.5`} />}
                        {kindLabel(job)} · {statusLabel(job)}
                    </p>
                </div>
                {canStop && (
                    <button
                        type={'button'}
                        className={'flex-shrink-0 rounded-md p-1 text-neutral-400 hover:text-neutral-50'}
                        title={active ? 'Cancel' : 'Remove'}
                        aria-label={active ? 'Cancel' : 'Remove'}
                        onClick={onStop}
                    >
                        <XIcon className={'h-4 w-4'} />
                    </button>
                )}
            </div>
            {(active || job.status === 'finished') && (
                <div className={'mt-2'}>
                    <div className={'h-1.5 w-full overflow-hidden rounded-full bg-neutral-500'}>
                        <div
                            className={classNames(
                                'h-full transition-all duration-300',
                                warned ? 'bg-yellow-500' : 'bg-primary-600',
                                percent === null && 'animate-pulse'
                            )}
                            style={{ width: `${percent ?? 100}%`, opacity: percent === null ? 0.35 : 1 }}
                        />
                    </div>
                    <p className={'mt-1 truncate text-xs text-neutral-400'}>{jobDetail(job)}</p>
                </div>
            )}
            {result && (
                <p className={'mt-1 flex items-center text-xs text-neutral-100'}>
                    {warned ? (
                        <ExclamationCircleIcon className={'mr-1.5 h-4 w-4 flex-shrink-0 text-yellow-600'} />
                    ) : (
                        <CheckCircleIcon className={'mr-1.5 h-4 w-4 flex-shrink-0 text-green-600'} />
                    )}
                    <span className={'truncate'}>{result}</span>
                </p>
            )}
            {!active && (job.error || job.status === 'cancelled') && (
                <p className={'mt-1 text-xs text-red-600'}>
                    {job.status === 'cancelled' ? 'Cancelled. What was done is kept.' : job.error}
                </p>
            )}
            {job.failures.length > 0 && (
                <ul className={'mt-1 max-h-24 overflow-auto text-xs'}>
                    {job.failures.slice(0, 5).map((f, i) => (
                        <li key={i} className={'truncate'} title={`${f.path}: ${f.error}`}>
                            <span className={'font-mono'}>{f.path}</span>
                            <span className={'ml-2 text-red-600'}>{f.error}</span>
                        </li>
                    ))}
                    {job.failures.length > 5 && (
                        <li className={'text-neutral-400'}>and {job.failures.length - 5} more</li>
                    )}
                </ul>
            )}
        </li>
    );
};

/**
 * What the node is doing for this server in the background (imports, archives, extractions, downloads), as a small box in the
 * bottom right corner. It is there only while there is a job, finished ones included, and can be folded away.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [canStop] = usePermissions(['file.create', 'file.archive', 'file.update']);
    const [fast, setFast] = useState(false);
    const { data } = useJobs({ refreshInterval: fast ? 2000 : 15000, shouldRetryOnError: false });
    const [collapsed, setCollapsed] = useState(readCollapsed);
    const [clearing, setClearing] = useState(false);

    // Looked at every 2 seconds while something is going, else now and then.
    useEffect(() => setFast(anyActive(data)), [data]);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            window.localStorage.setItem(KEY, next ? '1' : '0');
        } catch (e) {
            // Not kept, still works.
        }
    };

    const jobs = data ?? [];
    if (jobs.length === 0) return null;

    const running = jobs.filter(isActive).length;
    const over = jobs.filter((job) => !isActive(job));

    const stop = (job: ServerJob) =>
        cancelJob(uuid, job.id).then(
            () => refreshJobs(uuid),
            () => refreshJobs(uuid)
        );

    const clear = () => {
        setClearing(true);
        Promise.all(over.map((job) => cancelJob(uuid, job.id).catch(() => undefined))).then(() => {
            setClearing(false);
            refreshJobs(uuid);
        });
    };

    return (
        <div
            className={
                'fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-neutral-500 bg-white shadow-xl'
            }
            role={'region'}
            aria-label={'Background jobs'}
        >
            <div className={'flex items-center gap-2 px-4 py-2.5'}>
                <ClipboardListIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                <button type={'button'} className={'flex min-w-0 flex-1 items-center text-left'} onClick={toggle}>
                    <span className={'truncate text-sm font-semibold text-neutral-50'}>
                        {running > 0 ? `${running} running` : 'Jobs'}
                        {running > 0 && over.length > 0 ? ` · ${over.length} done` : ''}
                    </span>
                </button>
                <button
                    type={'button'}
                    className={'flex-shrink-0 rounded-md p-1 text-neutral-400 hover:text-neutral-50'}
                    aria-label={collapsed ? 'Show jobs' : 'Hide jobs'}
                    aria-expanded={!collapsed}
                    onClick={toggle}
                >
                    {collapsed ? <ChevronUpIcon className={'h-4 w-4'} /> : <ChevronDownIcon className={'h-4 w-4'} />}
                </button>
            </div>
            {!collapsed && (
                <>
                    <ul className={'max-h-80 divide-y divide-neutral-500 overflow-auto border-t border-neutral-500'}>
                        {jobs.map((job) => (
                            <Row key={job.id} job={job} canStop={canStop} onStop={() => stop(job)} />
                        ))}
                    </ul>
                    {canStop && over.length > 0 && (
                        <div className={'border-t border-neutral-500 px-4 py-2 text-right'}>
                            <button
                                type={'button'}
                                disabled={clearing}
                                className={'text-xs font-medium text-primary-600 hover:underline disabled:opacity-50'}
                                onClick={clear}
                            >
                                Clear all completed
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
