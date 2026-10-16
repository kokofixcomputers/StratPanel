import { differenceInCalendarDays, differenceInHours } from 'date-fns';

/** "3 days left", "5 hours left", "expires soon" for when something in the trash bin is deleted for good. */
export const timeLeft = (expiresAt: Date, now: Date = new Date()): string => {
    const hours = differenceInHours(expiresAt, now);
    if (hours < 1) return 'expires within the hour';
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;

    const days = differenceInCalendarDays(expiresAt, now);

    return `${days} ${days === 1 ? 'day' : 'days'} left`;
};

/** A size in bytes the way people read it, "" for something that has none (folders and schedules). */
export const formatSize = (bytes: number | null): string => {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
};

/** Where a file was, for the list: "/world/level.dat". */
export const originalPath = (path: string | null, name: string): string =>
    path === null ? name : `${path.replace(/\/+$/, '')}/${name}`;
