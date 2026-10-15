/**
 * Every line the console of a server has shown, kept outside of the terminal. The terminal only holds pixels, so to show
 * just the warnings or just the errors the console writes the lines again from here, and the problems panel reads them to
 * look for known causes of trouble.
 */
import { useEffect, useRef, useState } from 'react';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
    // Exactly what is written to the terminal, colour codes included.
    text: string;
    // The same without them.
    plain: string;
    level: LogLevel;
    // The first line of a warning or error, the lines after it that belong to it are not.
    start: boolean;
    belongs: boolean;
}

export type LogFilter = 'all' | LogLevel;

export const MAX_LOG_ENTRIES = 3000;

const logs = new Map<string, LogEntry[]>();
const listeners = new Set<() => void>();
const empty: LogEntry[] = [];

const notify = () => listeners.forEach((listener) => listener());

export const readLog = (server: string): LogEntry[] => logs.get(server) || empty;

export const appendLog = (server: string, entry: LogEntry) => {
    const list = logs.get(server) || [];
    list.push(entry);
    // Trimmed in steps, cutting the front of a long list on every line would cost more than the lines are worth.
    if (list.length > MAX_LOG_ENTRIES * 1.2) list.splice(0, list.length - MAX_LOG_ENTRIES);
    logs.set(server, list);
    notify();
};

export const clearLog = (server: string) => {
    if (logs.delete(server)) notify();
};

/** Whether a line is shown with a filter on: everything, or only the lines of that level. */
export const matchesFilter = (filter: LogFilter, level: LogLevel): boolean => filter === 'all' || filter === level;

/** How many warnings and errors there are, a block of lines that belong together counts once. */
export const logCounts = (entries: LogEntry[]): { warn: number; error: number } => {
    let warn = 0;
    let error = 0;
    entries.forEach((entry) => {
        if (!entry.start) return;
        if (entry.level === 'warn') warn++;
        else if (entry.level === 'error') error++;
    });

    return { warn, error };
};

/**
 * The lines of a server, read again at most once every `ms` while lines come in, so a busy console does not make everything
 * that shows them draw again for every line. The number changes whenever the lines did.
 */
export const useLogVersion = (server: string, ms = 500): { entries: LogEntry[]; version: number } => {
    const [version, setVersion] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const update = () => {
            if (timer.current) return;
            timer.current = setTimeout(() => {
                timer.current = null;
                setVersion((v) => v + 1);
            }, ms);
        };
        listeners.add(update);
        setVersion((v) => v + 1);

        return () => {
            listeners.delete(update);
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
        };
    }, [server, ms]);

    return { entries: readLog(server), version };
};
