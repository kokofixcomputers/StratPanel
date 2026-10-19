import React, { useContext, useEffect } from 'react';
import { Schedule, Task } from '@/api/server/schedules/getServerSchedules';
import { Field as FormikField, Form, Formik, FormikHelpers, useField } from 'formik';
import { ServerContext } from '@/state/server';
import createOrUpdateScheduleTask from '@/api/server/schedules/createOrUpdateScheduleTask';
import { httpErrorToHuman } from '@/api/http';
import Field from '@/components/elements/Field';
import FlashMessageRender from '@/components/FlashMessageRender';
import { boolean, number, object, string } from 'yup';
import useFlash from '@/plugins/useFlash';
import FormikFieldWrapper from '@/components/elements/FormikFieldWrapper';
import tw from 'twin.macro';
import Label from '@/components/elements/Label';
import { Textarea } from '@/components/elements/Input';
import { Button } from '@/components/elements/button/index';
import ModalContext from '@/context/ModalContext';
import asModal from '@/hoc/asModal';
import FormikSwitch from '@/components/elements/FormikSwitch';
import { ArchiveIcon, ClipboardListIcon, LightningBoltIcon, TerminalIcon } from '@heroicons/react/outline';
import { PlayIcon, RefreshIcon, StopIcon, XCircleIcon } from '@heroicons/react/solid';
import ModalHeading, { SectionLabel } from '@/components/server/schedules/ModalHeading';

interface Props {
    schedule: Schedule;
    // If a task is provided we can assume we're editing it. If not provided,
    // we are creating a new one.
    task?: Task;
}

interface Values {
    action: string;
    payload: string;
    timeOffset: string;
    continueOnFailure: boolean;
}

const schema = object().shape({
    action: string().required().oneOf(['command', 'power', 'backup']),
    payload: string().when('action', {
        is: (v) => v !== 'backup',
        then: string().required('A task payload must be provided.'),
        otherwise: string(),
    }),
    continueOnFailure: boolean(),
    timeOffset: number()
        .typeError('The time offset must be a valid number between 0 and 900.')
        .required('A time offset value must be provided.')
        .min(0, 'The time offset must be at least 0 seconds.')
        .max(900, 'The time offset must be less than 900 seconds.'),
});

const ACTIONS = [
    { value: 'command', label: 'Command', text: 'Type into the console', Icon: TerminalIcon },
    { value: 'power', label: 'Power', text: 'Start, restart or stop', Icon: LightningBoltIcon },
    { value: 'backup', label: 'Backup', text: 'Back up the server', Icon: ArchiveIcon },
];

const POWER = [
    { value: 'start', label: 'Start', Icon: PlayIcon },
    { value: 'restart', label: 'Restart', Icon: RefreshIcon },
    { value: 'stop', label: 'Stop', Icon: StopIcon },
    { value: 'kill', label: 'Kill', Icon: XCircleIcon },
];

const ActionListener = () => {
    const [{ value }, { initialValue: initialAction }] = useField<string>('action');
    const [, { initialValue: initialPayload }, { setValue, setTouched }] = useField<string>('payload');

    useEffect(() => {
        if (value !== initialAction) {
            setValue(value === 'power' ? 'start' : '');
            setTouched(false);
        } else {
            setValue(initialPayload || '');
            setTouched(false);
        }
    }, [value]);

    return null;
};

const TaskDetailsModal = ({ schedule, task }: Props) => {
    const { dismiss } = useContext(ModalContext);
    const { clearFlashes, addError } = useFlash();

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const appendSchedule = ServerContext.useStoreActions((actions) => actions.schedules.appendSchedule);
    const backupLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.backups);

    useEffect(() => {
        return () => {
            clearFlashes('schedule:task');
        };
    }, []);

    const submit = (values: Values, { setSubmitting }: FormikHelpers<Values>) => {
        clearFlashes('schedule:task');
        if (backupLimit === 0 && values.action === 'backup') {
            setSubmitting(false);
            addError({
                message: "A backup task cannot be created when the server's backup limit is set to 0.",
                key: 'schedule:task',
            });
        } else {
            createOrUpdateScheduleTask(uuid, schedule.id, task?.id, values)
                .then((task) => {
                    let tasks = schedule.tasks.map((t) => (t.id === task.id ? task : t));
                    if (!schedule.tasks.find((t) => t.id === task.id)) {
                        tasks = [...tasks, task];
                    }

                    appendSchedule({ ...schedule, tasks });
                    dismiss();
                })
                .catch((error) => {
                    console.error(error);
                    setSubmitting(false);
                    addError({ message: httpErrorToHuman(error), key: 'schedule:task' });
                });
        }
    };

    return (
        <Formik
            onSubmit={submit}
            validationSchema={schema}
            initialValues={{
                action: task?.action || 'command',
                payload: task?.payload || '',
                timeOffset: task?.timeOffset.toString() || '0',
                continueOnFailure: task?.continueOnFailure || false,
            }}
        >
            {({ isSubmitting, values, setFieldValue }) => (
                <Form css={tw`m-0`}>
                    <ModalHeading
                        icon={<ClipboardListIcon className={'h-6 w-6'} />}
                        title={task ? 'Edit task' : 'New task'}
                        subtitle={`A step of ${schedule.name}.`}
                    />
                    <FlashMessageRender byKey={'schedule:task'} css={tw`mb-4`} />
                    <ActionListener />

                    <SectionLabel>What to do</SectionLabel>
                    <div css={tw`grid grid-cols-1 sm:grid-cols-3 gap-3`} role={'radiogroup'} aria-label={'Action'}>
                        {ACTIONS.map(({ value, label, text, Icon }) => (
                            <button
                                key={value}
                                type={'button'}
                                role={'radio'}
                                aria-checked={values.action === value}
                                onClick={() => setFieldValue('action', value)}
                                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30 sm:flex-col sm:items-start ${
                                    values.action === value
                                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                                        : 'border-neutral-500 bg-white text-neutral-100 hover:border-neutral-400'
                                }`}
                            >
                                <Icon className={'h-5 w-5 flex-shrink-0'} />
                                <span>
                                    <span className={'block text-sm font-semibold'}>{label}</span>
                                    <span className={'block text-xs opacity-75'}>{text}</span>
                                </span>
                            </button>
                        ))}
                    </div>

                    <div css={tw`mt-5`}>
                        {values.action === 'command' ? (
                            <div>
                                <Label>Command</Label>
                                <FormikFieldWrapper
                                    name={'payload'}
                                    description={'As typed in the console, without the slash. One command per task.'}
                                >
                                    <FormikField
                                        as={Textarea}
                                        name={'payload'}
                                        rows={3}
                                        placeholder={'say The server restarts in 5 minutes'}
                                        css={tw`font-mono text-sm`}
                                    />
                                </FormikFieldWrapper>
                            </div>
                        ) : values.action === 'power' ? (
                            <div>
                                <Label>Power action</Label>
                                <FormikFieldWrapper name={'payload'}>
                                    <div css={tw`grid grid-cols-2 sm:grid-cols-4 gap-2`} role={'radiogroup'}>
                                        {POWER.map(({ value, label, Icon }) => (
                                            <button
                                                key={value}
                                                type={'button'}
                                                role={'radio'}
                                                aria-checked={values.payload === value}
                                                onClick={() => setFieldValue('payload', value)}
                                                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30 ${
                                                    values.payload === value
                                                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                                                        : 'border-neutral-500 bg-white text-neutral-100 hover:border-neutral-400'
                                                }`}
                                            >
                                                <Icon className={'h-4 w-4'} />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </FormikFieldWrapper>
                            </div>
                        ) : (
                            <div>
                                <Label>Files to leave out</Label>
                                <FormikFieldWrapper
                                    name={'payload'}
                                    description={
                                        'Optional. Files and folders left out of the backup; without any, your .pteroignore is used. When the backup limit is reached the oldest backup is replaced.'
                                    }
                                >
                                    <FormikField
                                        as={Textarea}
                                        name={'payload'}
                                        rows={3}
                                        placeholder={'logs/\ncache/'}
                                        css={tw`font-mono text-sm`}
                                    />
                                </FormikFieldWrapper>
                            </div>
                        )}
                    </div>

                    <div css={tw`mt-5`}>
                        <Field
                            name={'timeOffset'}
                            label={'Wait first (seconds)'}
                            description={'Time to wait after the task before this one. Not used for the first task.'}
                        />
                    </div>

                    <div css={tw`mt-5 rounded-xl border border-neutral-500 bg-neutral-700/40 p-4`}>
                        <FormikSwitch
                            name={'continueOnFailure'}
                            description={'Go on with the next tasks even when this one fails.'}
                            label={'Continue on failure'}
                        />
                    </div>

                    <div css={tw`mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3`}>
                        <Button.Text
                            type={'button'}
                            variant={Button.Variants.Secondary}
                            onClick={dismiss}
                            css={tw`w-full sm:w-auto`}
                        >
                            Cancel
                        </Button.Text>
                        <Button type={'submit'} disabled={isSubmitting} className={'w-full sm:w-auto'}>
                            {task ? 'Save changes' : 'Create task'}
                        </Button>
                    </div>
                </Form>
            )}
        </Formik>
    );
};

export default asModal<Props>()(TaskDetailsModal);
