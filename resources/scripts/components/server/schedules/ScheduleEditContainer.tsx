import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import getServerSchedule from '@/api/server/schedules/getServerSchedule';
import Spinner from '@/components/elements/Spinner';
import FlashMessageRender from '@/components/FlashMessageRender';
import EditScheduleModal from '@/components/server/schedules/EditScheduleModal';
import NewTaskButton from '@/components/server/schedules/NewTaskButton';
import DeleteScheduleButton from '@/components/server/schedules/DeleteScheduleButton';
import Can from '@/components/elements/Can';
import useFlash from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/components/elements/PageContentBlock';
import tw from 'twin.macro';
import { Button } from '@/components/elements/button/index';
import ScheduleTaskRow from '@/components/server/schedules/ScheduleTaskRow';
import isEqual from 'react-fast-compare';
import { format } from 'date-fns';
import ScheduleCronRow from '@/components/server/schedules/ScheduleCronRow';
import RunScheduleButton from '@/components/server/schedules/RunScheduleButton';

interface Params {
    id: string;
}

const CronBox = ({ title, value }: { title: string; value: string }) => (
    <div css={tw`bg-white border border-neutral-500 shadow-md rounded-xl p-4`}>
        <p css={tw`text-neutral-400 text-sm`}>{title}</p>
        <p css={tw`text-2xl font-semibold text-neutral-50 mt-1`}>{value}</p>
    </div>
);

const ActivePill = ({ active }: { active: boolean }) => (
    <span
        css={[
            tw`rounded-full px-3 py-0.5 text-xs font-medium ml-4 border`,
            active ? tw`bg-green-50 text-green-700 border-green-200` : tw`bg-red-50 text-red-700 border-red-200`,
        ]}
    >
        {active ? 'Active' : 'Inactive'}
    </span>
);

export default () => {
    const history = useHistory();
    const { id: scheduleId } = useParams<Params>();

    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [isLoading, setIsLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);

    const schedule = ServerContext.useStoreState(
        (st) => st.schedules.data.find((s) => s.id === Number(scheduleId)),
        isEqual
    );
    const appendSchedule = ServerContext.useStoreActions((actions) => actions.schedules.appendSchedule);

    useEffect(() => {
        if (schedule?.id === Number(scheduleId)) {
            setIsLoading(false);
            return;
        }

        clearFlashes('schedules');
        getServerSchedule(uuid, Number(scheduleId))
            .then((schedule) => appendSchedule(schedule))
            .catch((error) => {
                console.error(error);
                clearAndAddHttpError({ error, key: 'schedules' });
            })
            .then(() => setIsLoading(false));
    }, [scheduleId]);

    const toggleEditModal = useCallback(() => {
        setShowEditModal((s) => !s);
    }, []);

    return (
        <PageContentBlock title={'Schedules'}>
            <FlashMessageRender byKey={'schedules'} css={tw`mb-4`} />
            {!schedule || isLoading ? (
                <Spinner size={'large'} centered />
            ) : (
                <>
                    <ScheduleCronRow
                        cron={schedule.cron}
                        css={tw`sm:hidden bg-white border border-neutral-500 rounded-xl mb-4 p-4`}
                    />
                    <div>
                        <div
                            css={tw`sm:flex items-center bg-white p-4 sm:p-6 border border-neutral-500 shadow-md rounded-xl`}
                        >
                            <div css={tw`flex-1`}>
                                <h3 css={tw`flex items-center text-neutral-50 text-2xl font-bold`}>
                                    {schedule.name}
                                    {schedule.isProcessing ? (
                                        <span
                                            css={tw`flex items-center rounded-full px-3 py-0.5 text-xs font-medium ml-4 bg-neutral-600 text-neutral-200`}
                                        >
                                            <Spinner css={tw`w-3! h-3! mr-2`} />
                                            Processing
                                        </span>
                                    ) : (
                                        <ActivePill active={schedule.isActive} />
                                    )}
                                </h3>
                                <p css={tw`mt-1 text-sm text-neutral-400`}>
                                    Last run at:&nbsp;
                                    {schedule.lastRunAt ? (
                                        format(schedule.lastRunAt, "MMM do 'at' h:mma")
                                    ) : (
                                        <span css={tw`text-neutral-300`}>n/a</span>
                                    )}
                                    <span css={tw`ml-4 pl-4 border-l border-neutral-500 py-px`}>
                                        Next run at:&nbsp;
                                        {schedule.nextRunAt ? (
                                            format(schedule.nextRunAt, "MMM do 'at' h:mma")
                                        ) : (
                                            <span css={tw`text-neutral-300`}>n/a</span>
                                        )}
                                    </span>
                                </p>
                            </div>
                            <div css={tw`flex sm:block mt-3 sm:mt-0`}>
                                <Can action={'schedule.update'}>
                                    <Button.Text className={'flex-1 mr-4'} onClick={toggleEditModal}>
                                        Edit
                                    </Button.Text>
                                    <NewTaskButton schedule={schedule} />
                                </Can>
                            </div>
                        </div>
                        <div css={tw`hidden sm:grid grid-cols-5 md:grid-cols-5 gap-4 mb-4 mt-4`}>
                            <CronBox title={'Minute'} value={schedule.cron.minute} />
                            <CronBox title={'Hour'} value={schedule.cron.hour} />
                            <CronBox title={'Day (Month)'} value={schedule.cron.dayOfMonth} />
                            <CronBox title={'Month'} value={schedule.cron.month} />
                            <CronBox title={'Day (Week)'} value={schedule.cron.dayOfWeek} />
                        </div>
                        <div css={tw`bg-white border border-neutral-500 shadow-md rounded-xl overflow-hidden`}>
                            {schedule.tasks.length > 0
                                ? schedule.tasks
                                      .sort((a, b) =>
                                          a.sequenceId === b.sequenceId ? 0 : a.sequenceId > b.sequenceId ? 1 : -1
                                      )
                                      .map((task) => (
                                          <ScheduleTaskRow
                                              key={`${schedule.id}_${task.id}`}
                                              task={task}
                                              schedule={schedule}
                                          />
                                      ))
                                : null}
                        </div>
                    </div>
                    <EditScheduleModal visible={showEditModal} schedule={schedule} onModalDismissed={toggleEditModal} />
                    <div css={tw`mt-6 flex sm:justify-end`}>
                        <Can action={'schedule.delete'}>
                            <DeleteScheduleButton
                                scheduleId={schedule.id}
                                onDeleted={() => history.push(`/server/${id}/schedules`)}
                            />
                        </Can>
                        {schedule.tasks.length > 0 && (
                            <Can action={'schedule.update'}>
                                <RunScheduleButton schedule={schedule} />
                            </Can>
                        )}
                    </div>
                </>
            )}
        </PageContentBlock>
    );
};
