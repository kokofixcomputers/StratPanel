import React, { useState } from 'react';
import { DatabaseIcon, EyeIcon, TrashIcon } from '@heroicons/react/outline';
import Modal from '@/components/elements/Modal';
import { Form, Formik, FormikHelpers } from 'formik';
import Field from '@/components/elements/Field';
import { object, string } from 'yup';
import FlashMessageRender from '@/components/FlashMessageRender';
import { ServerContext } from '@/state/server';
import deleteServerDatabase from '@/api/server/databases/deleteServerDatabase';
import { httpErrorToHuman } from '@/api/http';
import RotatePasswordButton from '@/components/server/databases/RotatePasswordButton';
import Can from '@/components/elements/Can';
import { ServerDatabase } from '@/api/server/databases/getServerDatabases';
import useFlash from '@/plugins/useFlash';
import tw from 'twin.macro';
import Button from '@/components/elements/Button';
import Label from '@/components/elements/Label';
import Input from '@/components/elements/Input';
import GreyRowBox from '@/components/elements/GreyRowBox';
import CopyOnClick from '@/components/elements/CopyOnClick';

interface Props {
    database: ServerDatabase;
    className?: string;
}

export default ({ database, className }: Props) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { addError, clearFlashes } = useFlash();
    const [visible, setVisible] = useState(false);
    const [connectionVisible, setConnectionVisible] = useState(false);

    const appendDatabase = ServerContext.useStoreActions((actions) => actions.databases.appendDatabase);
    const removeDatabase = ServerContext.useStoreActions((actions) => actions.databases.removeDatabase);

    const jdbcConnectionString = `jdbc:mysql://${database.username}${
        database.password ? `:${encodeURIComponent(database.password)}` : ''
    }@${database.connectionString}/${database.name}`;

    const schema = object().shape({
        confirm: string()
            .required('The database name must be provided.')
            .oneOf([database.name.split('_', 2)[1], database.name], 'The database name must be provided.'),
    });

    const submit = (values: { confirm: string }, { setSubmitting }: FormikHelpers<{ confirm: string }>) => {
        clearFlashes();
        deleteServerDatabase(uuid, database.id)
            .then(() => {
                setVisible(false);
                setTimeout(() => removeDatabase(database.id), 150);
            })
            .catch((error) => {
                console.error(error);
                setSubmitting(false);
                addError({ key: 'database:delete', message: httpErrorToHuman(error) });
            });
    };

    return (
        <>
            <Formik onSubmit={submit} initialValues={{ confirm: '' }} validationSchema={schema} isInitialValid={false}>
                {({ isSubmitting, isValid, resetForm }) => (
                    <Modal
                        visible={visible}
                        dismissable={!isSubmitting}
                        showSpinnerOverlay={isSubmitting}
                        onDismissed={() => {
                            setVisible(false);
                            resetForm();
                        }}
                    >
                        <FlashMessageRender byKey={'database:delete'} css={tw`mb-6`} />
                        <h2 css={tw`text-xl mb-2 pr-10`}>Delete Database</h2>
                        <p css={tw`text-sm text-neutral-300 leading-relaxed`}>
                            Are you sure you want to permanently delete this database? All data will be lost and this
                            cannot be undone.
                        </p>
                        <Form css={tw`m-0 mt-6`}>
                            <Field
                                type={'text'}
                                id={'confirm_name'}
                                name={'confirm'}
                                label={
                                    <>
                                        Type the database name{' '}
                                        <strong css={tw`text-neutral-50`}>{database.name}</strong> to confirm:
                                    </>
                                }
                            />
                            <div
                                css={tw`mt-6 flex justify-end space-x-3 -mx-8 -mb-8 px-8 py-5 bg-neutral-900 border-t border-neutral-500 rounded-b-2xl`}
                            >
                                <Button type={'button'} isSecondary onClick={() => setVisible(false)}>
                                    Cancel
                                </Button>
                                <Button type={'submit'} color={'red'} disabled={!isValid}>
                                    Delete Database
                                </Button>
                            </div>
                        </Form>
                    </Modal>
                )}
            </Formik>
            <Modal visible={connectionVisible} onDismissed={() => setConnectionVisible(false)}>
                <FlashMessageRender byKey={'database-connection-modal'} css={tw`mb-6`} />
                <h3 css={tw`mb-6 text-xl pr-10`}>Database connection details</h3>
                <div>
                    <Label>Endpoint</Label>
                    <CopyOnClick text={database.connectionString}>
                        <Input type={'text'} readOnly value={database.connectionString} />
                    </CopyOnClick>
                </div>
                <div css={tw`mt-6`}>
                    <Label>Connections from</Label>
                    <Input type={'text'} readOnly value={database.allowConnectionsFrom} />
                </div>
                <div css={tw`mt-6`}>
                    <Label>Username</Label>
                    <CopyOnClick text={database.username}>
                        <Input type={'text'} readOnly value={database.username} />
                    </CopyOnClick>
                </div>
                <Can action={'database.view_password'}>
                    <div css={tw`mt-6`}>
                        <Label>Password</Label>
                        <CopyOnClick text={database.password} showInNotification={false}>
                            <Input type={'text'} readOnly value={database.password} />
                        </CopyOnClick>
                    </div>
                </Can>
                <div css={tw`mt-6`}>
                    <Label>JDBC Connection String</Label>
                    <CopyOnClick text={jdbcConnectionString} showInNotification={false}>
                        <Input type={'text'} readOnly value={jdbcConnectionString} />
                    </CopyOnClick>
                </div>
                <div css={tw`mt-8 flex justify-end items-center space-x-3`}>
                    <Can action={'database.update'}>
                        <RotatePasswordButton databaseId={database.id} onUpdate={appendDatabase} />
                    </Can>
                    <Button onClick={() => setConnectionVisible(false)}>Close</Button>
                </div>
            </Modal>
            <GreyRowBox $hoverable={false} className={className} css={tw`mb-3`}>
                <div className={'icon mr-4 hidden md:flex !w-12 !h-12'}>
                    <DatabaseIcon css={tw`w-6 h-6`} />
                </div>
                <div css={tw`flex-1 min-w-0`}>
                    <CopyOnClick text={database.name}>
                        <p css={tw`text-base font-semibold font-mono text-neutral-50 truncate`}>{database.name}</p>
                    </CopyOnClick>
                </div>
                <div css={tw`ml-8 hidden md:block`}>
                    <p css={tw`text-2xs text-neutral-400 uppercase tracking-wide select-none`}>Endpoint</p>
                    <CopyOnClick text={database.connectionString}>
                        <p css={tw`mt-1 text-sm font-medium text-neutral-100`}>{database.connectionString}</p>
                    </CopyOnClick>
                </div>
                <div css={tw`ml-8 hidden md:block`}>
                    <p css={tw`text-2xs text-neutral-400 uppercase tracking-wide select-none`}>Connections from</p>
                    <p css={tw`mt-1 text-sm font-medium text-neutral-100`}>{database.allowConnectionsFrom}</p>
                </div>
                <div css={tw`ml-8 hidden lg:block`}>
                    <p css={tw`text-2xs text-neutral-400 uppercase tracking-wide select-none`}>Username</p>
                    <CopyOnClick text={database.username}>
                        <p css={tw`mt-1 text-sm font-medium text-neutral-100`}>{database.username}</p>
                    </CopyOnClick>
                </div>
                <div css={tw`ml-8 flex items-center space-x-2`}>
                    <Button isSecondary size={'xsmall'} css={tw`!p-2`} onClick={() => setConnectionVisible(true)}>
                        <EyeIcon css={tw`w-4 h-4`} />
                    </Button>
                    <Can action={'database.delete'}>
                        <Button
                            color={'red'}
                            isSecondary
                            size={'xsmall'}
                            css={tw`!p-2`}
                            onClick={() => setVisible(true)}
                        >
                            <TrashIcon css={tw`w-4 h-4`} />
                        </Button>
                    </Can>
                </div>
            </GreyRowBox>
        </>
    );
};
