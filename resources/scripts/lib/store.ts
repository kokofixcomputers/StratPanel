/** Helpers for boxes and the store: money, how long a payment lasts, and how a share of a box is said. */
import { bytesToString, mbToBytes } from '@/lib/formatters';

/** An amount in the smallest unit of the currency (cents) as money. */
export const formatMoney = (amount: number, currency: string): string => {
    try {
        const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
        const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;

        return formatter.format(amount / 10 ** decimals);
    } catch (e) {
        return `${(amount / 100).toFixed(2)} ${currency}`;
    }
};

/** "month", "year", "30 days" or "once" for how long one payment lasts. */
export const periodLabel = (days: number | null): string =>
    days === null
        ? 'once'
        : days === 7
        ? 'week'
        : days >= 28 && days <= 31
        ? 'month'
        : days === 365 || days === 366
        ? 'year'
        : `${days} days`;

export interface Share {
    memory: number;
    disk: number;
    cpu: number;
    allocations: number;
    backups: number;
    databases: number;
}

export const SHARE_KEYS: (keyof Share)[] = ['memory', 'disk', 'cpu', 'allocations', 'backups', 'databases'];

export const SHARE_LABELS: Record<keyof Share, string> = {
    memory: 'Memory',
    disk: 'Disk',
    cpu: 'CPU',
    allocations: 'Ports',
    backups: 'Backups',
    databases: 'Databases',
};

/** One number of a share the way people read it: 4 GB, 200%, 3. */
export const shareText = (key: keyof Share, value: number): string =>
    key === 'memory' || key === 'disk' ? bytesToString(mbToBytes(value)) : key === 'cpu' ? `${value}%` : String(value);

/** How full (0 to 100) the used part of a limit is. */
export const percentOf = (used: number, limit: number): number => (limit > 0 ? Math.min(100, (used / limit) * 100) : 0);

/** How many decimals the smallest unit of a currency is behind the whole one (2 for dollars, 0 for yen). */
export const decimalsOf = (currency: string): number => {
    try {
        return (
            new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ??
            2
        );
    } catch (e) {
        return 2;
    }
};

/** What an admin types (12.50) as the smallest unit (1250), and back. */
export const toMinor = (price: string, currency: string): number =>
    Math.round(parseFloat(price || '0') * 10 ** decimalsOf(currency));
export const fromMinor = (amount: number, currency: string): string =>
    (amount / 10 ** decimalsOf(currency)).toFixed(decimalsOf(currency));
