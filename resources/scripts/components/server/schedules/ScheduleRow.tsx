import React from 'react';
import { Schedule } from '@/api/server/schedules/getServerSchedules';
import { CalendarIcon } from '@heroicons/react/outline';
import { format } from 'date-fns';
import tw from 'twin.macro';
import ScheduleCronRow from '@/components/server/schedules/ScheduleCronRow';

export default ({ schedule }: { schedule: Schedule }) => (
    <>
        <div className={'icon !w-12 !h-12 hidden md:flex'}>
            <CalendarIcon css={tw`w-6 h-6`} />
        </div>
        <div css={tw`flex-1 md:ml-4`}>
            <p css={tw`font-semibold text-neutral-50`}>{schedule.name}</p>
            <p css={tw`text-xs text-neutral-400`}>
                Last run at: {schedule.lastRunAt ? format(schedule.lastRunAt, "MMM do 'at' h:mma") : 'never'}
            </p>
        </div>
        <div>
            <p
                css={[
                    tw`py-1 px-3 rounded-full text-xs font-medium sm:hidden`,
                    schedule.isActive ? tw`bg-green-50 text-green-700` : tw`bg-neutral-600 text-neutral-300`,
                ]}
            >
                {schedule.isActive ? 'Active' : 'Inactive'}
            </p>
        </div>
        <ScheduleCronRow cron={schedule.cron} css={tw`mx-auto sm:mx-8 w-full sm:w-auto mt-4 sm:mt-0`} />
        <div>
            <p
                css={[
                    tw`py-1 px-3 rounded-full text-xs font-medium hidden sm:block`,
                    schedule.isActive && !schedule.isProcessing
                        ? tw`bg-green-50 text-green-700`
                        : tw`bg-neutral-600 text-neutral-300`,
                ]}
            >
                {schedule.isProcessing ? 'Processing' : schedule.isActive ? 'Active' : 'Inactive'}
            </p>
        </div>
    </>
);
