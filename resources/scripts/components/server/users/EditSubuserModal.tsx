import React, { useContext, useEffect, useRef, useState } from 'react';
import Sensitive from '@/components/elements/Sensitive';
import { Subuser } from '@/state/server/subusers';
import { Form, Formik, useFormikContext } from 'formik';
import { array, object, string } from 'yup';
import Field from '@/components/elements/Field';
import { Actions, useStoreActions, useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';
import createOrUpdateSubuser from '@/api/server/users/createOrUpdateSubuser';
import { ServerContext } from '@/state/server';
import FlashMessageRender from '@/components/FlashMessageRender';
import Can from '@/components/elements/Can';
import { usePermissions } from '@/plugins/usePermissions';
import { useDeepCompareMemo } from '@/plugins/useDeepCompareMemo';
import tw from 'twin.macro';
import Button from '@/components/elements/Button';
import PermissionTitleBox from '@/components/server/users/PermissionTitleBox';
import asModal from '@/hoc/asModal';
import PermissionRow from '@/components/server/users/PermissionRow';
import ModalContext from '@/context/ModalContext';
import Input from '@/components/elements/Input';
import { useMinecraftAccount, lookupMinecraft, MinecraftLookup } from '@/api/account/minecraft';

type Props = {
    subuser?: Subuser;
};

interface Values {
    // How the person is invited: by email address, or by the Minecraft name they linked to their account.
    by: 'email' | 'minecraft';
    email: string;
    minecraft: string;
    permissions: string[];
}

/** The Minecraft name of somebody who linked their account, with their head as soon as it is found. */
const MinecraftName = () => {
    const { values, setFieldValue } = useFormikContext<Values>();
    const [found, setFound] = useState<MinecraftLookup | null>(null);
    const [looking, setLooking] = useState(false);
    const name = values.minecraft.trim();

    useEffect(() => {
        setFound(null);
        if (!/^\w{1,16}$/.test(name)) return;

        let stale = false;
        setLooking(true);
        const timer = setTimeout(() => {
            lookupMinecraft(name)
                .then((result) => !stale && setFound(result))
                .catch(() => !stale && setFound(null))
                .then(() => !stale && setLooking(false));
        }, 350);

        return () => {
            stale = true;
            clearTimeout(timer);
        };
    }, [name]);

    return (
        <div>
            <Input
                type={'text'}
                name={'minecraft'}
                placeholder={'Minecraft name'}
                aria-label={'Minecraft name'}
                maxLength={16}
                value={values.minecraft}
                onChange={(e) => setFieldValue('minecraft', e.currentTarget.value.replace(/[^\w]/g, ''))}
            />
            <div css={tw`mt-3 flex min-h-[3rem] items-center gap-3 rounded-lg border border-neutral-500 px-3 py-2`}>
                {found?.found ? (
                    <>
                        <img
                            src={found.avatar || ''}
                            alt={''}
                            css={tw`h-9 w-9 rounded`}
                            style={{ imageRendering: 'pixelated' }}
                        />
                        <div css={tw`min-w-0`}>
                            <p css={tw`truncate text-sm font-semibold text-neutral-50`}>{found.username}</p>
                            <p css={tw`text-xs text-green-600`}>Has a Stratosphere account, will be invited</p>
                        </div>
                    </>
                ) : (
                    <p css={tw`text-xs text-neutral-400`}>
                        {looking
                            ? 'Looking...'
                            : name && found
                            ? 'Nobody linked this Minecraft name to their account yet. They can do it under Account > Minecraft account.'
                            : 'Only people who linked their Minecraft account can be invited by name.'}
                    </p>
                )}
            </div>
        </div>
    );
};

/** Who to invite: an email address, or (when the panel links Minecraft accounts) a Minecraft name. */
const InviteBy = () => {
    const { values, setFieldValue } = useFormikContext<Values>();
    const minecraft = useMinecraftAccount().data;

    return (
        <>
            {minecraft?.enabled && (
                <div css={tw`mb-4 inline-flex rounded-lg border border-neutral-500 p-0.5`}>
                    {(['email', 'minecraft'] as const).map((by) => (
                        <button
                            key={by}
                            type={'button'}
                            onClick={() => setFieldValue('by', by)}
                            css={[
                                tw`rounded-md px-3 py-1 text-sm font-medium transition-colors duration-150`,
                                values.by === by ? tw`bg-primary-500 text-white` : tw`text-neutral-300`,
                            ]}
                        >
                            {by === 'email' ? 'Email address' : 'Minecraft name'}
                        </button>
                    ))}
                </div>
            )}
            {values.by === 'minecraft' && minecraft?.enabled ? (
                <MinecraftName />
            ) : (
                <Field
                    name={'email'}
                    label={'User Email'}
                    description={'Enter the email address of the user you wish to invite as a subuser for this server.'}
                />
            )}
        </>
    );
};

const EditSubuserModal = ({ subuser }: Props) => {
    const ref = useRef<HTMLHeadingElement>(null);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const appendSubuser = ServerContext.useStoreActions((actions) => actions.subusers.appendSubuser);
    const { clearFlashes, clearAndAddHttpError } = useStoreActions(
        (actions: Actions<ApplicationStore>) => actions.flashes
    );
    const { dismiss, setPropOverrides } = useContext(ModalContext);

    const isRootAdmin = useStoreState((state) => state.user.data!.canAccessAllServers);
    const permissions = useStoreState((state) => state.permissions.data);
    // The currently logged in user's permissions. We're going to filter out any permissions
    // that they should not need.
    const loggedInPermissions = ServerContext.useStoreState((state) => state.server.permissions);
    const [canEditUser] = usePermissions(subuser ? ['user.update'] : ['user.create']);

    // The permissions that can be modified by this user.
    const editablePermissions = useDeepCompareMemo(() => {
        const cleaned = Object.keys(permissions).map((key) =>
            Object.keys(permissions[key].keys).map((pkey) => `${key}.${pkey}`)
        );

        const list: string[] = ([] as string[]).concat.apply([], Object.values(cleaned));

        if (isRootAdmin || (loggedInPermissions.length === 1 && loggedInPermissions[0] === '*')) {
            return list;
        }

        return list.filter((key) => loggedInPermissions.indexOf(key) >= 0);
    }, [isRootAdmin, permissions, loggedInPermissions]);

    const submit = (values: Values) => {
        setPropOverrides({ showSpinnerOverlay: true });
        clearFlashes('user:edit');

        // Only the way of inviting that was chosen is sent.
        const params =
            values.by === 'minecraft'
                ? { minecraft: values.minecraft.trim(), permissions: values.permissions }
                : { email: values.email, permissions: values.permissions };

        createOrUpdateSubuser(uuid, params, subuser)
            .then((subuser) => {
                appendSubuser(subuser);
                dismiss();
            })
            .catch((error) => {
                console.error(error);
                setPropOverrides(null);
                clearAndAddHttpError({ key: 'user:edit', error });

                if (ref.current) {
                    ref.current.scrollIntoView();
                }
            });
    };

    useEffect(
        () => () => {
            clearFlashes('user:edit');
        },
        []
    );

    return (
        <Formik
            onSubmit={submit}
            initialValues={
                {
                    by: 'email',
                    email: subuser?.email || '',
                    minecraft: '',
                    permissions: subuser?.permissions || [],
                } as Values
            }
            validationSchema={object().shape({
                by: string(),
                email: string().when('by', {
                    is: 'minecraft',
                    then: string(),
                    otherwise: string()
                        .max(191, 'Email addresses must not exceed 191 characters.')
                        .email('A valid email address must be provided.')
                        .required('A valid email address must be provided.'),
                }),
                minecraft: string().when('by', {
                    is: 'minecraft',
                    then: string()
                        .matches(/^\w{1,16}$/, 'A Minecraft name has 1 to 16 letters, numbers or underscores.')
                        .required('Enter a Minecraft name.'),
                    otherwise: string(),
                }),
                permissions: array().of(string()),
            })}
        >
            <Form>
                <div css={tw`flex justify-between`}>
                    <h2 css={tw`text-2xl`} ref={ref}>
                        {subuser ? (
                            <>
                                {canEditUser ? 'Modify' : 'View'} permissions for <Sensitive>{subuser.email}</Sensitive>
                            </>
                        ) : (
                            'Create new subuser'
                        )}
                    </h2>
                    <div>
                        <Button type={'submit'} css={tw`w-full sm:w-auto`}>
                            {subuser ? 'Save' : 'Invite User'}
                        </Button>
                    </div>
                </div>
                <FlashMessageRender byKey={'user:edit'} css={tw`mt-4`} />
                {!isRootAdmin && loggedInPermissions[0] !== '*' && (
                    <div css={tw`mt-4 pl-4 py-2 border-l-4 border-cyan-400`}>
                        <p css={tw`text-sm text-neutral-300`}>
                            Only permissions which your account is currently assigned may be selected when creating or
                            modifying other users.
                        </p>
                    </div>
                )}
                {!subuser && (
                    <div css={tw`mt-6`}>
                        <InviteBy />
                    </div>
                )}
                <div css={tw`my-6`}>
                    {Object.keys(permissions)
                        .filter((key) => key !== 'websocket')
                        .map((key, index) => (
                            <PermissionTitleBox
                                key={`permission_${key}`}
                                title={key}
                                isEditable={canEditUser}
                                permissions={Object.keys(permissions[key].keys).map((pkey) => `${key}.${pkey}`)}
                                css={index > 0 ? tw`mt-4` : undefined}
                            >
                                <p css={tw`text-sm text-neutral-400 mb-4`}>{permissions[key].description}</p>
                                {Object.keys(permissions[key].keys).map((pkey) => (
                                    <PermissionRow
                                        key={`permission_${key}.${pkey}`}
                                        permission={`${key}.${pkey}`}
                                        disabled={!canEditUser || editablePermissions.indexOf(`${key}.${pkey}`) < 0}
                                    />
                                ))}
                            </PermissionTitleBox>
                        ))}
                </div>
                <Can action={subuser ? 'user.update' : 'user.create'}>
                    <div css={tw`pb-6 flex justify-end`}>
                        <Button type={'submit'} css={tw`w-full sm:w-auto`}>
                            {subuser ? 'Save' : 'Invite User'}
                        </Button>
                    </div>
                </Can>
            </Form>
        </Formik>
    );
};

export default asModal<Props>({
    top: false,
})(EditSubuserModal);
