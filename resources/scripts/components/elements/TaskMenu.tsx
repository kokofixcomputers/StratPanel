import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components/macro';
import {
    ArchiveIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    FolderOpenIcon,
    XIcon,
    XCircleIcon,
} from '@heroicons/react/solid';
import { clearFinished, dismissTask, Task, useTasks } from '@/lib/tasks';

const slide = keyframes`
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
`;

const Bar = styled.div`
    position: relative;
    height: 6px;
    border-radius: 9999px;
    background: #e8eefc;
    overflow: hidden;

    & > div {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 30%;
        border-radius: 9999px;
        background: #1447e6;
        animation: ${slide} 1.3s ease-in-out infinite;
    }
`;

const formatElapsed = (ms: number) => {
    const seconds = Math.floor(ms / 1000);

    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};

const Elapsed = ({ task }: { task: Task }) => {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (task.status !== 'running') return;

        const timer = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(timer);
    }, [task.status]);

    return <>{formatElapsed((task.endedAt || now) - task.startedAt)}</>;
};

const Row = ({ task }: { task: Task }) => (
    <li className={'px-4 py-3 border-t border-neutral-500 first:border-t-0'}>
        <div className={'flex items-start'}>
            <span
                className={
                    'flex items-center justify-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0'
                }
            >
                {task.kind === 'archive' ? (
                    <ArchiveIcon className={'w-4 h-4'} />
                ) : (
                    <FolderOpenIcon className={'w-4 h-4'} />
                )}
            </span>
            <div className={'ml-3 flex-1 min-w-0'}>
                <p className={'text-sm font-medium text-neutral-50 truncate'} title={task.title}>
                    {task.title}
                </p>
                <p
                    className={`text-xs mt-0.5 truncate ${
                        task.status === 'failed' ? 'text-red-600' : 'text-neutral-400'
                    }`}
                >
                    {task.status === 'running' ? (
                        <>
                            {task.detail} &middot; <Elapsed task={task} />
                        </>
                    ) : (
                        task.detail
                    )}
                </p>
            </div>
            {task.status === 'done' && <CheckCircleIcon className={'w-5 h-5 text-green-600 ml-2 flex-shrink-0'} />}
            {task.status === 'failed' && <XCircleIcon className={'w-5 h-5 text-red-600 ml-2 flex-shrink-0'} />}
            {task.status !== 'running' && (
                <button
                    type={'button'}
                    aria-label={'Dismiss'}
                    onClick={() => dismissTask(task.id)}
                    className={'ml-1 p-0.5 rounded text-neutral-400 hover:text-neutral-50'}
                >
                    <XIcon className={'w-4 h-4'} />
                </button>
            )}
        </div>
        {task.status === 'running' &&
            (task.progress && task.progress.total > 0 ? (
                <div className={'mt-3 h-1.5 rounded-full bg-primary-50 overflow-hidden'}>
                    <div
                        className={'h-full rounded-full bg-primary-600 transition-all duration-300'}
                        style={{ width: `${Math.min(100, (task.progress.done / task.progress.total) * 100)}%` }}
                    />
                </div>
            ) : (
                <Bar className={'mt-3'}>
                    <div />
                </Bar>
            ))}
    </li>
);

/**
 * A small menu in the bottom right corner that lists background tasks, it only shows up while there are some.
 */
export default () => {
    const tasks = useTasks();
    const [collapsed, setCollapsed] = useState(false);
    const running = tasks.filter((task) => task.status === 'running').length;

    // Closing the tab would cancel the requests that are still running.
    useEffect(() => {
        if (!running) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);

        return () => window.removeEventListener('beforeunload', handler);
    }, [running]);

    if (!tasks.length) return null;

    return (
        <div
            className={
                'fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-white border border-neutral-500 rounded-xl shadow-lg overflow-hidden'
            }
        >
            <div className={'flex items-center justify-between px-4 py-3'}>
                <button
                    type={'button'}
                    onClick={() => setCollapsed((v) => !v)}
                    className={'flex items-center text-sm font-semibold text-neutral-50 flex-1 text-left'}
                >
                    Tasks
                    <span
                        className={'ml-2 rounded-full bg-neutral-600 px-2 py-0.5 text-2xs font-medium text-neutral-300'}
                    >
                        {running ? `${running} running` : `${tasks.length} done`}
                    </span>
                    {collapsed ? (
                        <ChevronUpIcon className={'w-4 h-4 ml-auto text-neutral-400'} />
                    ) : (
                        <ChevronDownIcon className={'w-4 h-4 ml-auto text-neutral-400'} />
                    )}
                </button>
                {!collapsed && tasks.some((t) => t.status !== 'running') && (
                    <button
                        type={'button'}
                        onClick={clearFinished}
                        className={'ml-3 text-xs text-neutral-400 hover:text-neutral-50'}
                    >
                        Clear
                    </button>
                )}
            </div>
            {!collapsed && (
                <ul className={'max-h-72 overflow-y-auto border-t border-neutral-500 m-0 p-0 list-none'}>
                    {[...tasks].reverse().map((task) => (
                        <Row key={task.id} task={task} />
                    ))}
                </ul>
            )}
        </div>
    );
};
