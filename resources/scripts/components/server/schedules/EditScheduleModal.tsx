import React, { useContext, useEffect } from 'react';
import { CalendarIcon } from '@heroicons/react/outline';
import { Schedule } from '@/api/server/schedules/getServerSchedules';
import Field from '@/components/elements/Field';
import { Form, Formik, FormikHelpers, useFormikContext } from 'formik';
import FormikSwitch from '@/components/elements/FormikSwitch';
import createOrUpdateSchedule from '@/api/server/schedules/createOrUpdateSchedule';
import { ServerContext } from '@/state/server';
import { httpErrorToHuman } from '@/api/http';
import FlashMessageRender from '@/components/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import tw from 'twin.macro';
import { Button } from '@/components/elements/button/index';
import ModalContext from '@/context/ModalContext';
import asModal from '@/hoc/asModal';
import ScheduleCheatsheetCards from '@/components/server/schedules/ScheduleCheatsheetCards';
import CronPreview, { cronIssue } from '@/components/server/schedules/CronPreview';
import ModalHeading, { SectionLabel } from '@/components/server/schedules/ModalHeading';
import { CRON_PRESETS } from '@/lib/cron';

interface Props {
    schedule?: Schedule;
}

interface Values {
    name: string;
    dayOfWeek: string;
    month: string;
    dayOfMonth: string;
    hour: string;
    minute: string;
    enabled: boolean;
    onlyWhenOnline: boolean;
}

const PRESET_KEYS = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const;

/** A click fills the five fields. The one that matches what is typed is marked. */
const Presets = () => {
    const { values, setFieldValue } = useFormikContext<Values>();

    return (
        <div css={tw`flex flex-wrap gap-2 mb-4`}>
            {CRON_PRESETS.map((preset) => {
                const active = PRESET_KEYS.every((k) => values[k].trim() === preset.cron[k]);

                return (
                    <button
                        key={preset.label}
                        type={'button'}
                        aria-pressed={active}
                        onClick={() => PRESET_KEYS.forEach((k) => setFieldValue(k, preset.cron[k]))}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30 ${
                            active
                                ? 'border-primary-600 bg-primary-50 text-primary-700'
                                : 'border-neutral-500 bg-white text-neutral-300 hover:border-neutral-400 hover:text-neutral-50'
                        }`}
                    >
                        {preset.label}
                    </button>
                );
            })}
        </div>
    );
};

const Footer = ({ editing, isSubmitting }: { editing: boolean; isSubmitting: boolean }) => {
    const { values } = useFormikContext<Values>();
    const { dismiss } = useContext(ModalContext);
    const issue = cronIssue(values);

    return (
        <div css={tw`mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3`}>
            <Button.Text
                type={'button'}
                variant={Button.Variants.Secondary}
                onClick={dismiss}
                css={tw`w-full sm:w-auto`}
            >
                Cancel
            </Button.Text>
            <Button
                className={'w-full sm:w-auto'}
                type={'submit'}
                disabled={isSubmitting || !!issue}
                title={issue ?? undefined}
            >
                {editing ? 'Save changes' : 'Create schedule'}
            </Button>
        </div>
    );
};

const EditScheduleModal = ({ schedule }: Props) => {
    const { addError, clearFlashes } = useFlash();
    const { dismiss } = useContext(ModalContext);

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const appendSchedule = ServerContext.useStoreActions((actions) => actions.schedules.appendSchedule);

    useEffect(() => {
        return () => {
            clearFlashes('schedule:edit');
        };
    }, []);

    const submit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes('schedule:edit');
        createOrUpdateSchedule(uuid, {
            id: schedule?.id,
            name: values.name,
            cron: {
                minute: values.minute.trim(),
                hour: values.hour.trim(),
                dayOfWeek: values.dayOfWeek.trim(),
                month: values.month.trim(),
                dayOfMonth: values.dayOfMonth.trim(),
            },
            onlyWhenOnline: values.onlyWhenOnline,
            isActive: values.enabled,
        })
            .then((schedule) => {
                setSubmitting(false);
                appendSchedule(schedule);
                dismiss();
            })
            .catch((error) => {
                console.error(error);

                setSubmitting(false);
                addError({ key: 'schedule:edit', message: httpErrorToHuman(error) });
            });
    };

    return (
        <Formik
            onSubmit={submit}
            initialValues={
                {
                    name: schedule?.name || '',
                    minute: schedule?.cron.minute || '*/5',
                    hour: schedule?.cron.hour || '*',
                    dayOfMonth: schedule?.cron.dayOfMonth || '*',
                    month: schedule?.cron.month || '*',
                    dayOfWeek: schedule?.cron.dayOfWeek || '*',
                    enabled: schedule?.isActive ?? true,
                    onlyWhenOnline: schedule?.onlyWhenOnline ?? true,
                } as Values
            }
        >
            {({ isSubmitting }) => (
                <Form css={tw`m-0`}>
                    <ModalHeading
                        icon={<CalendarIcon className={'h-6 w-6'} />}
                        title={schedule ? 'Edit schedule' : 'New schedule'}
                        subtitle={'Runs its tasks, one after the other, whenever the time comes.'}
                    />
                    <FlashMessageRender byKey={'schedule:edit'} css={tw`mb-6`} />
                    <Field name={'name'} label={'Name'} placeholder={'Nightly restart'} />

                    <div css={tw`mt-6`}>
                        <SectionLabel>When</SectionLabel>
                        <Presets />
                        <div css={tw`grid grid-cols-2 sm:grid-cols-5 gap-3`}>
                            <Field name={'minute'} label={'Minute'} description={'0-59'} />
                            <Field name={'hour'} label={'Hour'} description={'0-23'} />
                            <Field name={'dayOfMonth'} label={'Day'} description={'1-31'} />
                            <Field name={'month'} label={'Month'} description={'1-12'} />
                            <Field name={'dayOfWeek'} label={'Weekday'} description={'0-6, MON-SUN'} />
                        </div>
                        <CronPreview />
                        <details css={tw`mt-3`}>
                            <summary
                                css={tw`cursor-pointer text-xs font-medium text-neutral-400 hover:text-neutral-100`}
                            >
                                Cron syntax help
                            </summary>
                            <div css={tw`mt-3`}>
                                <ScheduleCheatsheetCards />
                            </div>
                        </details>
                    </div>

                    <div
                        css={tw`mt-6 divide-y divide-neutral-500 rounded-xl border border-neutral-500 bg-neutral-700/40`}
                    >
                        <div css={tw`p-4`}>
                            <FormikSwitch
                                name={'onlyWhenOnline'}
                                description={'Skip a run while the server is not running.'}
                                label={'Only when the server is online'}
                            />
                        </div>
                        <div css={tw`p-4`}>
                            <FormikSwitch
                                name={'enabled'}
                                description={'Turn this off to keep the schedule without running it.'}
                                label={'Enabled'}
                            />
                        </div>
                    </div>
                    <Footer editing={!!schedule} isSubmitting={isSubmitting} />
                </Form>
            )}
        </Formik>
    );
};

export default asModal<Props>()(EditScheduleModal);
