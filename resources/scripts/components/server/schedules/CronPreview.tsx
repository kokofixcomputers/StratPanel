import React, { useMemo } from 'react';
import { useFormikContext } from 'formik';
import { useStoreState } from 'easy-peasy';
import { ClockIcon, ExclamationCircleIcon } from '@heroicons/react/outline';
import { CronFields, describeCron, formatWallClock, nextRuns, wallClock } from '@/lib/cron';

/** Whether the five fields of the form make a schedule (the form holds them as strings). */
export const cronIssue = (values: CronFields): string | null => {
    const result = describeCron(values);

    return result.state === 'invalid' ? result.error : null;
};

/**
 * What the five fields mean, as you type them: a sentence ("Runs every 5 minutes.") and the next times it would run, by the clock of
 * the panel. Or what is wrong with them.
 */
export default () => {
    const { values } = useFormikContext<CronFields>();
    const zone = useStoreState((state) => state.settings.data?.timezone) || 'UTC';
    const { minute, hour, dayOfMonth, month, dayOfWeek } = values;

    const result = useMemo(
        () => describeCron({ minute, hour, dayOfMonth, month, dayOfWeek }),
        [minute, hour, dayOfMonth, month, dayOfWeek]
    );
    // Looked at again when the fields change, which is often enough: a minute that passes does not change the next three.
    const runs = useMemo(
        () => (result.state === 'ok' ? nextRuns(result.fields, wallClock(zone), 3) : []),
        [result, zone]
    );

    if (result.state === 'invalid') {
        return (
            <div
                role={'alert'}
                className={
                    'mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
                }
            >
                <ExclamationCircleIcon className={'mt-0.5 h-5 w-5 flex-shrink-0'} />
                {result.error}
            </div>
        );
    }
    if (result.state === 'unknown') {
        return (
            <p
                className={
                    'mt-4 rounded-xl border border-neutral-500 bg-neutral-700/40 px-4 py-3 text-sm text-neutral-300'
                }
            >
                This uses cron features that are not explained here. The panel checks it when you save.
            </p>
        );
    }

    return (
        <div className={'mt-4 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3'} aria-live={'polite'}>
            <p className={'flex items-start gap-3 text-sm font-semibold text-primary-700'}>
                <ClockIcon className={'mt-0.5 h-5 w-5 flex-shrink-0'} />
                {result.text}
            </p>
            {runs.length > 0 ? (
                <p className={'mt-2 pl-8 text-xs text-primary-700/80'}>
                    Next: {runs.map(formatWallClock).join(' · ')} ({zone})
                </p>
            ) : (
                <p className={'mt-2 pl-8 text-xs text-primary-700/80'}>That date does not come up in the next years.</p>
            )}
        </div>
    );
};
