/**
 * Exact numbers for the tooltips of the stat cards. The cards show rounded values ("6 GiB"), hovering shows everything
 * the server reported.
 */
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 6442450944 as "6,442,450,944 bytes". */
export const exactBytes = (bytes: number): string =>
    `${number.format(Math.round(bytes))} ${Math.round(bytes) === 1 ? 'byte' : 'bytes'}`;

/** Fixed digits and thousands separators, "1,234.50". */
export const exactNumber = (value: number, digits = 2): string =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

/** How long ago a point of a history was, the last point being now. "now", "5 s ago", "2 min ago". */
export const agoLabel = (index: number, length: number, intervalSeconds: number): string => {
    const seconds = Math.round((length - 1 - index) * intervalSeconds);
    if (seconds <= 0) return 'now';

    return seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
};

/** The index of a history a pointer is over, from where it is in a strip that is `width` wide. */
export const indexAt = (offsetX: number, width: number, length: number): number => {
    if (length <= 1 || width <= 0) return 0;

    return Math.min(length - 1, Math.max(0, Math.round((offsetX / width) * (length - 1))));
};
