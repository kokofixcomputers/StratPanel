import React from 'react';

const SYMBOLS: [string, string][] = [
    ['*', 'any value'],
    [',', 'a list: 1,15'],
    ['-', 'a range: 8-12'],
    ['/', 'every nth: */5'],
];

const EXAMPLES: [string, string][] = [
    ['*/5 * * * *', 'every 5 minutes'],
    ['0 */1 * * *', 'every hour'],
    ['0 8-12 * * *', 'hourly, 08:00 to 12:00'],
    ['0 0 * * MON', 'Mondays at midnight'],
];

const Table = ({ title, rows }: { title: string; rows: [string, string][] }) => (
    <div>
        <p className={'mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>{title}</p>
        <dl className={'divide-y divide-neutral-500 rounded-lg border border-neutral-500 bg-white text-sm'}>
            {rows.map(([code, text]) => (
                <div key={code} className={'flex items-center justify-between gap-3 px-3 py-1.5'}>
                    <dt className={'font-mono text-xs text-primary-700'}>{code}</dt>
                    <dd className={'text-xs text-neutral-300'}>{text}</dd>
                </div>
            ))}
        </dl>
    </div>
);

/** The cron symbols and a few examples, small enough to sit in a window. */
export default () => (
    <div className={'grid gap-4 sm:grid-cols-2'}>
        <Table title={'Symbols'} rows={SYMBOLS} />
        <Table title={'Examples'} rows={EXAMPLES} />
    </div>
);
