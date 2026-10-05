/**
 * A tiny global store for long running work (archiving and unarchiving files). It lives outside of React so a task
 * keeps running, and keeps reporting, when the user navigates to another page.
 */
import { useEffect, useState } from 'react';
import { mutate } from 'swr';
import compressFiles from '@/api/server/files/compressFiles';
import decompressFiles from '@/api/server/files/decompressFiles';
import loadDirectory from '@/api/server/files/loadDirectory';
import { httpErrorToHuman } from '@/api/http';
import { getDirectorySwrKey } from '@/plugins/useFileManagerSwr';
import { cleanDirectoryPath } from '@/helpers';
import { bytesToString } from '@/lib/formatters';

export interface Task {
    id: string;
    kind: 'archive' | 'extract' | 'modpack';
    title: string;
    detail: string;
    status: 'running' | 'done' | 'failed';
    // Shown as a real progress bar when a task knows how far it is.
    progress?: { done: number; total: number };
    startedAt: number;
    endedAt?: number;
}

let tasks: Task[] = [];
let counter = 0;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const patch = (id: string, changes: Partial<Task>) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, ...changes } : task));
    emit();
};

export const dismissTask = (id: string) => {
    tasks = tasks.filter((task) => task.id !== id);
    emit();
};

export const clearFinished = () => {
    tasks = tasks.filter((task) => task.status === 'running');
    emit();
};

export const useTasks = (): Task[] => {
    const [state, setState] = useState(tasks);

    useEffect(() => {
        const update = () => setState(tasks);
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, []);

    return state;
};

const begin = (kind: Task['kind'], title: string, detail: string): string => {
    const id = `task-${Date.now()}-${counter++}`;
    tasks = [...tasks, { id, kind, title, detail, status: 'running', startedAt: Date.now() }];
    emit();

    return id;
};

const finish = (id: string, uuid: string, directory: string, error?: unknown) => {
    const current = tasks.find((task) => task.id === id);
    patch(id, {
        ...(!error && current
            ? { title: current.title.replace(/^Archiving/, 'Archived').replace(/^Extracting/, 'Extracted') }
            : {}),
        status: error ? 'failed' : 'done',
        endedAt: Date.now(),
        ...(error ? { detail: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message } : {}),
    });

    // Show the new archive / extracted files in the file manager if it is open.
    mutate(getDirectorySwrKey(uuid, directory));

    if (!error) setTimeout(() => dismissTask(id), 10000);
};

/** Archives files in the background. The returned promise resolves once the archive exists. */
export const runArchiveTask = (uuid: string, directory: string, files: string[]): Promise<void> => {
    const id = begin(
        'archive',
        files.length === 1 ? `Archiving ${files[0]}` : `Archiving ${files.length} items`,
        'Starting...'
    );
    const startedAt = Date.now();

    // Wings only answers when the archive is finished, but the archive file shows up in the directory while it is
    // being written, so its size is a real sign of progress.
    const poll = setInterval(async () => {
        const list = await loadDirectory(uuid, cleanDirectoryPath(directory)).catch(() => null);
        const archive = list?.find(
            (file) => /^archive-.*\.tar\.gz$/.test(file.name) && file.modifiedAt.getTime() >= startedAt - 10000
        );
        if (archive) patch(id, { detail: `${bytesToString(archive.size)} written` });
    }, 2000);

    return compressFiles(uuid, directory, files, true)
        .then((archive) => {
            patch(id, { detail: `${archive.name} (${bytesToString(archive.size)})` });
            finish(id, uuid, directory);
        })
        .catch((error) => finish(id, uuid, directory, error))
        .then(() => clearInterval(poll));
};

/** Extracts an archive in the background. */
export const runExtractTask = (uuid: string, directory: string, file: string): Promise<void> => {
    const id = begin('extract', `Extracting ${file}`, 'Working...');

    return decompressFiles(uuid, directory, file, true)
        .then(() => {
            patch(id, { detail: 'Extracted' });
            finish(id, uuid, directory);
        })
        .catch((error) => finish(id, uuid, directory, error));
};

export type TaskReporter = (detail: string, progress?: { done: number; total: number }) => void;

/** Runs any long job as a task, the job reports what it is doing through the callback it is given. */
export const runTask = (
    kind: Task['kind'],
    title: string,
    work: (report: TaskReporter) => Promise<void>
): Promise<void> => {
    const id = begin(kind, title, 'Starting...');

    return work((detail, progress) => patch(id, { detail, progress }))
        .then(() => {
            patch(id, { status: 'done', endedAt: Date.now(), detail: 'Finished', progress: undefined });
            setTimeout(() => dismissTask(id), 10000);
        })
        .catch((error) => {
            patch(id, {
                status: 'failed',
                endedAt: Date.now(),
                progress: undefined,
                detail: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message,
            });
        });
};
