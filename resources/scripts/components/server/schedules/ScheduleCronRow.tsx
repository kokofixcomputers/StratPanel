import React from 'react';
import { Schedule } from '@/api/server/schedules/getServerSchedules';
import classNames from 'classnames';

interface Props {
    cron: Schedule['cron'];
    className?: string;
}

const ScheduleCronRow = ({ cron, className }: Props) => (
    <div className={classNames('flex', className)}>
        <div className={'w-1/5 sm:w-auto text-center'}>
            <p className={'font-semibold text-neutral-50'}>{cron.minute}</p>
            <p className={'text-2xs text-neutral-400 uppercase tracking-wide'}>Minute</p>
        </div>
        <div className={'w-1/5 sm:w-auto text-center ml-4'}>
            <p className={'font-semibold text-neutral-50'}>{cron.hour}</p>
            <p className={'text-2xs text-neutral-400 uppercase tracking-wide'}>Hour</p>
        </div>
        <div className={'w-1/5 sm:w-auto text-center ml-4'}>
            <p className={'font-semibold text-neutral-50'}>{cron.dayOfMonth}</p>
            <p className={'text-2xs text-neutral-400 uppercase tracking-wide'}>Day (Month)</p>
        </div>
        <div className={'w-1/5 sm:w-auto text-center ml-4'}>
            <p className={'font-semibold text-neutral-50'}>{cron.month}</p>
            <p className={'text-2xs text-neutral-400 uppercase tracking-wide'}>Month</p>
        </div>
        <div className={'w-1/5 sm:w-auto text-center ml-4'}>
            <p className={'font-semibold text-neutral-50'}>{cron.dayOfWeek}</p>
            <p className={'text-2xs text-neutral-400 uppercase tracking-wide'}>Day (Week)</p>
        </div>
    </div>
);

export default ScheduleCronRow;
