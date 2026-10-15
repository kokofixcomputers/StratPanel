export const compact = (value: number) =>
    new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** "3 days ago" for a date string, empty when it is not a date. */
export const timeAgo = (value?: string): string => {
    const time = value ? new Date(value).getTime() : NaN;
    if (isNaN(time)) return '';

    const seconds = Math.round((time - Date.now()) / 1000);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['week', 604800],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
    ];
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }

    return 'just now';
};
