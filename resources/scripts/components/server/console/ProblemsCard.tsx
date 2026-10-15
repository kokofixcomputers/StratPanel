import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';
import { CheckCircleIcon, ExclamationCircleIcon, ExclamationIcon, XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { Button } from '@/components/elements/button/index';
import { usePermissions } from '@/plugins/usePermissions';
import { SocketRequest } from '@/components/server/events';
import http, { httpErrorToHuman } from '@/api/http';
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import setSelectedDockerImage from '@/api/server/setSelectedDockerImage';
import { readOptionalFile, serializeProperties } from '@/lib/minecraft';
import { useLogVersion } from '@/lib/consoleLog';
import { isTooLargeError } from '@/lib/fileLimits';
import { analyze, Fix, imageForJava, Problem } from '@/lib/problems';

/** The last lines of latest.log are looked at, a log of a whole day has more than anything needs. */
const SCAN_LINES = 5000;

interface Props {
    // Changes when the person asks to look in latest.log as well.
    scanRequest: number;
}

/**
 * Known causes of trouble found in what the server printed, each with what to do about it. A fix that changes a file or the
 * Java image is a button that does it, the others take you to the page where it is done.
 */
export default ({ scanRequest }: Props) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const port = ServerContext.useStoreState(
        (state) => state.server.data!.allocations.find((a) => a.isDefault)?.port ?? null
    );
    const [canEdit] = usePermissions(['file.update']);
    const [canImage] = usePermissions(['startup.docker-image']);
    const [canStart] = usePermissions(['control.start']);
    const history = useHistory();

    const { entries, version } = useLogVersion(uuid, 1000);
    const [dismissed, setDismissed] = useState<string[]>([]);
    const [working, setWorking] = useState<string | null>(null);
    // What happened after a fix: a message that it worked, or what went wrong. Per problem.
    const [outcome, setOutcome] = useState<Record<string, { ok: boolean; message: string }>>({});
    // Lines of latest.log when the person asked for them, then those are looked at instead of the console.
    const [fromFile, setFromFile] = useState<{ lines: string[] } | { error: string } | null>(null);
    const [scanning, setScanning] = useState(false);

    useEffect(() => {
        if (!scanRequest) return;
        setScanning(true);
        setDismissed([]);
        getFileContents(uuid, '/logs/latest.log')
            .then((text) => setFromFile({ lines: text.split(/\r?\n/).slice(-SCAN_LINES) }))
            .catch((error) =>
                setFromFile({
                    error: isTooLargeError(error)
                        ? 'latest.log is too big to look through here, download it and look in it on your computer.'
                        : error?.response?.status === 404
                        ? 'There is no latest.log yet, the server has not run.'
                        : httpErrorToHuman(error),
                })
            )
            .then(() => setScanning(false));
    }, [scanRequest, uuid]);

    const problems = useMemo(
        () => analyze(fromFile && 'lines' in fromFile ? fromFile.lines : entries.map((entry) => entry.plain), { port }),
        // The entries are one list that is added to, the version says when it changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [entries, version, fromFile, port]
    );

    const shown = problems.filter((problem) => !dismissed.includes(`${problem.id}:${problem.evidence[0]}`));
    const scanned = fromFile && 'lines' in fromFile;

    const run = async (problem: Problem, fix: Fix) => {
        if (fix.type === 'link') return history.push(`/server/${id}${fix.to}`);

        const key = `${problem.id}:${fix.label}`;
        setWorking(key);
        try {
            let message = '';
            if (fix.type === 'eula') {
                await saveFileContents(uuid, 'eula.txt', 'eula=true');
                message = 'The EULA is accepted.';
            } else if (fix.type === 'properties') {
                const current = (await readOptionalFile(uuid, '/server.properties')) || '';
                await saveFileContents(uuid, '/server.properties', serializeProperties(current, fix.values));
                message = `Saved to server.properties (${Object.entries(fix.values)
                    .map(([name, value]) => `${name}=${value}`)
                    .join(', ')}).`;
            } else {
                const { data } = await http.get(`/api/client/servers/${uuid}/startup`);
                const image = imageForJava(data.meta?.docker_images || {}, fix.major);
                if (!image) {
                    throw new Error(
                        `This server has no Java ${fix.major} image to choose. Your host can add one to the egg.`
                    );
                }
                await setSelectedDockerImage(uuid, image);
                message = `The server now uses ${image}.`;
            }
            setOutcome((o) => ({ ...o, [problem.id]: { ok: true, message } }));
        } catch (error) {
            setOutcome((o) => ({
                ...o,
                [problem.id]: {
                    ok: false,
                    message: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message,
                },
            }));
        } finally {
            setWorking(null);
        }
    };

    const allowed = (fix: Fix) => (fix.type === 'link' ? true : fix.type === 'java' ? canImage : canEdit);

    if (!shown.length && !(fromFile && !scanning)) return null;

    return (
        <div className={'mb-4 space-y-3'} aria-label={'Problems'}>
            {fromFile && (
                <div className={'flex items-center justify-between gap-3 text-xs text-neutral-300'}>
                    <span>
                        {'error' in fromFile
                            ? fromFile.error
                            : scanned && !shown.length
                            ? 'No known problems in latest.log.'
                            : 'Problems found in latest.log.'}
                    </span>
                    <button
                        type={'button'}
                        className={'font-medium text-primary-700 hover:underline'}
                        onClick={() => setFromFile(null)}
                    >
                        {'error' in fromFile ? 'Close' : 'Back to the console'}
                    </button>
                </div>
            )}
            {shown.map((problem) => {
                const result = outcome[problem.id];

                return (
                    <div
                        key={problem.id}
                        className={classNames('rounded-xl border bg-white p-4 shadow-md', {
                            'border-red-200': problem.severity === 'error',
                            'border-yellow-200': problem.severity === 'warning',
                        })}
                    >
                        <div className={'flex items-start gap-3'}>
                            {problem.severity === 'error' ? (
                                <ExclamationCircleIcon className={'mt-0.5 h-5 w-5 flex-shrink-0 text-red-500'} />
                            ) : (
                                <ExclamationIcon className={'mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500'} />
                            )}
                            <div className={'min-w-0 flex-1'}>
                                <p className={'text-sm font-semibold text-neutral-50'}>
                                    {problem.title}
                                    {problem.count > 1 && (
                                        <span
                                            className={
                                                'ml-2 rounded-full bg-neutral-600 px-2 py-0.5 text-xs font-medium text-neutral-300'
                                            }
                                        >
                                            seen {problem.count} times
                                        </span>
                                    )}
                                </p>
                                <p className={'mt-1 text-sm text-neutral-300'}>{problem.detail}</p>
                                <div className={'mt-2 space-y-0.5 rounded-lg bg-neutral-700/40 px-3 py-2'}>
                                    {problem.evidence.map((line) => (
                                        <p
                                            key={line}
                                            className={'truncate font-mono text-xs text-neutral-200'}
                                            title={line}
                                        >
                                            {line}
                                        </p>
                                    ))}
                                </div>
                                {result && (
                                    <p
                                        className={classNames('mt-3 flex items-center gap-2 text-sm', {
                                            'text-green-700': result.ok,
                                            'text-red-600': !result.ok,
                                        })}
                                    >
                                        {result.ok && <CheckCircleIcon className={'h-4 w-4 flex-shrink-0'} />}
                                        {result.message}
                                        {result.ok && status === 'offline' && canStart && instance && (
                                            <Button.Text
                                                onClick={() => instance.send(SocketRequest.SET_STATE, 'start')}
                                            >
                                                Start the server
                                            </Button.Text>
                                        )}
                                    </p>
                                )}
                                <div className={'mt-3 flex flex-wrap gap-2'}>
                                    {problem.fixes.map((fix, index) => {
                                        const key = `${problem.id}:${fix.label}`;
                                        const button = (
                                            <Button
                                                key={key}
                                                disabled={!allowed(fix) || working === key}
                                                onClick={() => run(problem, fix)}
                                            >
                                                {working === key ? 'Working...' : fix.label}
                                            </Button>
                                        );

                                        return index === 0 ? (
                                            button
                                        ) : (
                                            <Button.Text
                                                key={key}
                                                disabled={!allowed(fix) || working === key}
                                                onClick={() => run(problem, fix)}
                                            >
                                                {fix.label}
                                            </Button.Text>
                                        );
                                    })}
                                </div>
                            </div>
                            <button
                                type={'button'}
                                aria-label={'Dismiss'}
                                title={'Hide this until it shows up again'}
                                className={'flex-shrink-0 text-neutral-400 hover:text-neutral-50'}
                                onClick={() => setDismissed((d) => [...d, `${problem.id}:${problem.evidence[0]}`])}
                            >
                                <XIcon className={'h-4 w-4'} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
