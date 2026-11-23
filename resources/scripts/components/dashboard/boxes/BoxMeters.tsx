import React from 'react';
import { Share, SHARE_KEYS, SHARE_LABELS, percentOf, shareText } from '@/lib/store';

const level = (percent: number) => (percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-yellow-400' : 'bg-primary-600');

/** What a box holds and how much of it the servers in it have been given, one bar for each of the six. */
export default ({ limits, used, compact = false }: { limits: Share; used: Share; compact?: boolean }) => (
    <dl className={compact ? 'space-y-2' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
        {SHARE_KEYS.filter((key) => !compact || ['memory', 'disk', 'cpu'].includes(key)).map((key) => {
            const percent = percentOf(used[key], limits[key]);

            return (
                <div key={key} className={compact ? '' : 'rounded-xl border border-neutral-500 bg-white p-3 shadow-sm'}>
                    <div className={'flex items-baseline justify-between text-xs'}>
                        <dt className={'font-medium uppercase tracking-wide text-neutral-400'}>{SHARE_LABELS[key]}</dt>
                        <dd className={'font-semibold text-neutral-100'}>
                            {shareText(key, used[key])} <span className={'font-normal text-neutral-400'}>of</span>{' '}
                            {shareText(key, limits[key])}
                        </dd>
                    </div>
                    <div className={'mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-500'}>
                        <div className={`h-full rounded-full ${level(percent)}`} style={{ width: `${percent}%` }} />
                    </div>
                </div>
            );
        })}
    </dl>
);
