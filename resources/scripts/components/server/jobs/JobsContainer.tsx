import React, { useEffect, useState } from 'react';
import {
    ArchiveIcon,
    CheckCircleIcon,
    ClipboardListIcon,
    CloudDownloadIcon,
    DownloadIcon,
    ExclamationCircleIcon,
    XCircleIcon,
} from '@heroicons/react/outline';
import { formatDistanceToNow } from 'date-fns';
import classNames from 'classnames';
import tw from 'twin.macro';
import { Link } from 'react-router-dom';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { cancelJob, isActive, ServerJob, useJobs } from '@/api/server/jobs';
import { anyActive, jobDetail, jobPercent, jobResultLine, kindLabel, statusLabel } from '@/lib/jobs';

const KindIcon = ({ type }: { type: string }) => {
    const cls = 'h-6 w-6';

    return type === 'compress' || type === 'decompress' ? (
        <ArchiveIcon className={cls} />
    ) : type === 'pull' ? (
        <CloudDownloadIcon className={cls} />
    ) : (
        <DownloadIcon className={cls} />
    );
};

const badge = (job: ServerJob) =>
    classNames(
        'rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0 border',
        isActive(job) && 'bg-primary-50 text-primary-700 border-primary-200',
        job.status === 'finished' && 'bg-green-50 text-green-700 border-green-200',
        (job.status === 'failed' || job.status === 'interrupted') && 'bg-red-50 text-red-600 border-red-200',
        job.status === 'cancelled' && 'bg-neutral-600 text-neutral-300 border-neutral-500'
    );

const JobCard = ({
    job,
    canStop,
    busy,
    onStop,
}: {
    job: ServerJob;
    canStop: boolean;
    busy: boolean;
    onStop: () => void;
}) => {
    const [showAll, setShowAll] = useState(false);
    const active = isActive(job);
    const percent = jobPercent(job);
    const result = jobResultLine(job);
    const failures = showAll ? job.failures : job.failures.slice(0, 5);
    const warned = job.status === 'finished' && job.failed > 0;

    return (
        <div css={tw`rounded-xl border border-neutral-500 bg-white shadow-md mb-4 overflow-hidden`}>
            <div css={tw`flex items-center gap-3 px-5 py-4`}>
                <span
                    css={tw`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600`}
                >
                    <KindIcon type={job.type} />
                </span>
                <div css={tw`min-w-0 flex-1`}>
                    <p css={tw`text-sm font-semibold text-neutral-50 truncate`} title={job.title}>
                        {job.title}
                    </p>
                    <p css={tw`text-xs text-neutral-400`}>
                        {kindLabel(job)} · started {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                        {job.finishedAt && ` · over ${formatDistanceToNow(job.finishedAt, { addSuffix: true })}`}
                    </p>
                </div>
                <span className={badge(job)}>
                    {active && <Spinner size={'small'} css={tw`inline-block mr-1.5 align-middle`} />}
                    {statusLabel(job)}
                </span>
                {canStop && (
                    <Button.Text
                        type={'button'}
                        variant={Button.Variants.Secondary}
                        disabled={busy}
                        onClick={onStop}
                        css={tw`flex-shrink-0`}
                    >
                        {active ? 'Cancel' : 'Remove'}
                    </Button.Text>
                )}
            </div>

            {(active || job.status === 'finished') && (
                <div css={tw`px-5 pb-4`}>
                    <div css={tw`h-2 w-full rounded-full bg-neutral-500 overflow-hidden`}>
                        <div
                            className={classNames(
                                'h-full transition-all duration-300',
                                warned ? 'bg-yellow-500' : 'bg-primary-600',
                                percent === null && 'animate-pulse'
                            )}
                            style={{ width: `${percent ?? 100}%`, opacity: percent === null ? 0.35 : 1 }}
                        />
                    </div>
                    <p css={tw`mt-2 text-xs text-neutral-400`}>{jobDetail(job)}</p>
                    {active && job.current && <p css={tw`mt-1 text-xs text-neutral-400 truncate`}>{job.current}</p>}
                    {active && job.status === 'scanning' && job.scanPath && (
                        <p css={tw`mt-1 text-xs text-neutral-400 truncate`}>{job.scanPath}</p>
                    )}
                </div>
            )}

            {result && (
                <div css={tw`px-5 pb-4 flex items-center text-sm`}>
                    {warned ? (
                        <ExclamationCircleIcon css={tw`w-4 h-4 mr-2 text-yellow-600 flex-shrink-0`} />
                    ) : (
                        <CheckCircleIcon css={tw`w-4 h-4 mr-2 text-green-600 flex-shrink-0`} />
                    )}
                    <span css={tw`text-neutral-100`}>{result}</span>
                </div>
            )}

            {(job.error || job.status === 'cancelled') && !active && (
                <div css={tw`px-5 pb-4 flex items-start text-sm text-red-600`}>
                    <XCircleIcon css={tw`w-4 h-4 mr-2 mt-0.5 flex-shrink-0`} />
                    <span>{job.status === 'cancelled' ? 'Cancelled. What was done is kept.' : job.error}</span>
                </div>
            )}

            {job.failures.length > 0 && (
                <div css={tw`border-t border-neutral-500 px-5 py-3`}>
                    <p css={tw`text-xs font-medium text-neutral-100 mb-2`}>
                        Not done ({job.failed || job.failures.length})
                    </p>
                    <ul
                        css={tw`divide-y divide-neutral-500 rounded-lg border border-neutral-500 text-xs max-h-48 overflow-auto`}
                    >
                        {failures.map((f, i) => (
                            <li key={i} css={tw`px-3 py-2`}>
                                <span css={tw`font-mono`}>{f.path}</span>
                                <span css={tw`text-red-600 ml-2`}>{f.error}</span>
                            </li>
                        ))}
                    </ul>
                    {job.failures.length > 5 && (
                        <button
                            type={'button'}
                            css={tw`mt-2 text-xs text-primary-600 hover:underline`}
                            onClick={() => setShowAll(!showAll)}
                        >
                            {showAll ? 'Show fewer' : `Show all ${job.failures.length}`}
                        </button>
                    )}
                </div>
            )}
            {job.warnings.length > 0 && (
                <ul css={tw`border-t border-neutral-500 px-5 py-3 text-xs text-yellow-700 space-y-1`}>
                    {job.warnings.slice(0, 10).map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

/** What the node is doing for this server in the background, and what it did: imports, archives, extractions and downloads. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const { clearFlashes, addFlash } = useFlash();
    const [canStop] = usePermissions(['file.create', 'file.archive', 'file.update']);
    const [fast, setFast] = useState(false);
    const { data, error, mutate } = useJobs({ refreshInterval: fast ? 2000 : 15000 });
    const [busy, setBusy] = useState<string | null>(null);

    // Looked at every 2 seconds while something is going, else now and then.
    useEffect(() => setFast(anyActive(data)), [data]);

    useEffect(() => {
        clearFlashes('jobs');
        if (error) addFlash({ key: 'jobs', type: 'error', title: 'Error', message: httpErrorToHuman(error) });
    }, [error]);

    const stop = (job: ServerJob) => {
        clearFlashes('jobs');
        setBusy(job.id);

        cancelJob(uuid, job.id)
            .catch((e) => addFlash({ key: 'jobs', type: 'error', title: 'Error', message: httpErrorToHuman(e) }))
            .then(() => {
                setBusy(null);

                return mutate();
            });
    };

    const jobs = data ?? [];
    const running = jobs.filter(isActive).length;

    return (
        <ServerContentBlock title={'Jobs'}>
            <PageHeader
                title={'Jobs'}
                subtitle={`Imports, archives and downloads of ${serverName}. They run on the node and go on when you close this page.`}
            />
            <FlashMessageRender byKey={'jobs'} css={tw`mb-4`} />
            <ListHeader
                icon={<ClipboardListIcon className={'h-6 w-6'} />}
                title={'Jobs'}
                count={running > 0 ? `${running} running` : `${jobs.length}`}
            >
                <Link to={`/server/${id}/import`}>
                    <Button.Text type={'button'} variant={Button.Variants.Secondary}>
                        Import from another server
                    </Button.Text>
                </Link>
            </ListHeader>

            {!data && !error ? (
                <Spinner size={'large'} centered />
            ) : jobs.length === 0 ? (
                <EmptyState>
                    Nothing here yet. Archives you make, files you extract, downloads and imports show up here while
                    they run and afterwards.
                </EmptyState>
            ) : (
                jobs.map((job) => (
                    <JobCard key={job.id} job={job} canStop={canStop} busy={busy === job.id} onStop={() => stop(job)} />
                ))
            )}
        </ServerContentBlock>
    );
};
