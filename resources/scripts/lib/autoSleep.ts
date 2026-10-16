/** What the settings of auto sleep say in words. */

/** "5 minutes", "1 hour", "2 hours". */
export const minutesLabel = (minutes: number): string =>
    minutes < 60
        ? `${minutes} minute${minutes === 1 ? '' : 's'}`
        : minutes % 60 === 0
        ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
        : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/** Minutes until the server sleeps when nobody has been online since `idleSince`, 0 when it is due, null when not counting. */
export const minutesUntilSleep = (idleSince: Date | null, idleMinutes: number, now = Date.now()): number | null => {
    if (!idleSince) return null;

    return Math.max(0, Math.ceil((idleSince.getTime() + idleMinutes * 60000 - now) / 60000));
};
