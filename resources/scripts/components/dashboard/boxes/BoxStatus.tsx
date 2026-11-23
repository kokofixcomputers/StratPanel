import React from 'react';
import classNames from 'classnames';
import { format, formatDistanceToNow } from 'date-fns';
import { BoxSummary } from '@/api/boxes';

/** Whether a box is usable, and when it runs out when it does. */
export default ({ box, detail = false }: { box: Pick<BoxSummary, 'status' | 'expires_at'>; detail?: boolean }) => {
    const ends = box.expires_at ? new Date(box.expires_at) : null;
    const soon = !!ends && ends.getTime() - Date.now() < 3 * 86400000 && ends.getTime() > Date.now();

    const label =
        box.status === 'expired' ? 'Expired' : box.status === 'suspended' ? 'Suspended' : soon ? 'Ends soon' : 'Active';
    const tone =
        box.status === 'active' && !soon
            ? 'border-green-200 bg-green-50 text-green-700'
            : box.status === 'active'
            ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
            : 'border-red-200 bg-red-50 text-red-700';

    return (
        <span className={'flex flex-shrink-0 flex-col items-end gap-1'}>
            <span className={classNames('rounded-full border px-2.5 py-0.5 text-xs font-medium', tone)}>{label}</span>
            {ends && (
                <span className={'text-2xs text-neutral-400'}>
                    {detail
                        ? `${ends.getTime() > Date.now() ? 'Runs out' : 'Ran out'} ${format(ends, 'MMM d, yyyy')}`
                        : ends.getTime() > Date.now()
                        ? `${formatDistanceToNow(ends)} left`
                        : 'ran out'}
                </span>
            )}
        </span>
    );
};
