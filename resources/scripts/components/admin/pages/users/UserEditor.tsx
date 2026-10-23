import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { ArrowLeftIcon, UserIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Notice } from '@/components/admin/forms';
import UserForm from '@/components/admin/pages/users/UserForm';
import UserRolesBox from '@/components/admin/pages/users/UserRolesBox';
import UserPoolBox from '@/components/admin/pages/users/UserPoolBox';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { createUser, deleteUser, updateUser, UserInput, useUser, useUserMeta } from '@/api/admin/users';

const EMPTY: UserInput = {
    email: '',
    username: '',
    name_first: '',
    name_last: '',
    language: 'en',
    password: '',
    root_admin: false,
};

/** Admin > Users > one user, or a new one: identity, password, who they are in the admin area, their roles and their pool. */
export default () => {
    const { id } = useParams<{ id?: string }>();
    const exists = !!id;
    const history = useHistory();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const meta = useUserMeta();
    const user = useUser(id);
    const [value, setValue] = useState<UserInput>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (user.data) setValue({ ...user.data.user, password: '' });
    }, [user.data?.user]);
    useEffect(() => {
        if (!exists && meta.data) setValue((current) => ({ ...current, language: meta.data!.locale }));
    }, [exists, meta.data?.locale]);

    const languages = (exists ? user.data?.languages : meta.data?.languages) || {};
    const canChange = exists ? admin.can('users.update') && !!user.data?.can_change : admin.can('users.create');

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        (exists ? updateUser(Number(id), value) : createUser(value))
            .then((response: any) => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: exists ? 'User account was updated.' : 'Account has been created successfully.',
                });
                if (!exists) {
                    history.push(`/admin/users/view/${response.id}`);
                } else {
                    setValue((current) => ({ ...current, password: '' }));
                    user.mutate();
                }
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () => {
        clearFlashes('admin');
        deleteUser(Number(id))
            .then(() => history.push('/admin/users'))
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setDeleting(false));
    };

    const back = (
        <AdminLink to={'/admin/users'} className={'inline-flex items-center text-sm'}>
            <ArrowLeftIcon className={'mr-1.5 h-4 w-4'} />
            All users
        </AdminLink>
    );

    if (exists ? !user.data : !meta.data) {
        return (
            <AdminPage title={exists ? 'User' : 'New user'} actions={back}>
                {user.error || meta.error ? (
                    <p className={'text-sm text-red-600'}>This could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    const details = user.data;

    return (
        <AdminPage
            title={exists ? details!.user.username : 'New user'}
            subtitle={exists ? details!.user.email : 'Create a new account on the panel.'}
            actions={back}
        >
            {exists && !details!.can_change && (
                <div className={'mb-4'}>
                    <Notice>
                        This account is a root admin or holds permissions that you do not hold, so you can look at it
                        but not change it.
                    </Notice>
                </div>
            )}
            <SectionCard icon={<UserIcon className={'h-5 w-5'} />} title={exists ? 'Account' : 'New account'}>
                <UserForm
                    value={value}
                    onChange={setValue}
                    languages={languages}
                    isNew={!exists}
                    canMakeRoot={admin.root}
                    disabled={!canChange}
                />
                {(canChange || (exists && admin.can('users.delete') && details!.can_change)) && (
                    <div className={'mt-6 flex items-center justify-between gap-3'}>
                        {exists && admin.can('users.delete') && details!.can_change ? (
                            <Button.Danger type={'button'} onClick={() => setDeleting(true)}>
                                Delete
                            </Button.Danger>
                        ) : (
                            <span />
                        )}
                        {canChange && (
                            <Button
                                type={'button'}
                                onClick={save}
                                disabled={busy || !value.email.trim() || !value.username.trim()}
                            >
                                {busy ? 'Saving...' : exists ? 'Update user' : 'Create user'}
                            </Button>
                        )}
                    </div>
                )}
            </SectionCard>

            {exists && details && (
                <div className={'mt-4 space-y-4'}>
                    {admin.can('roles.view', 'roles.assign') && (
                        <UserRolesBox
                            userId={details.user.id}
                            roles={details.roles}
                            isRootAdmin={details.user.root_admin}
                            onSaved={() => user.mutate()}
                        />
                    )}
                    {admin.can('users.update') && (
                        <UserPoolBox
                            userId={details.user.id}
                            pool={details.pool}
                            canChange={details.can_change}
                            onSaved={() => user.mutate()}
                        />
                    )}
                </div>
            )}

            {exists && details && (
                <Dialog.Confirm
                    open={deleting}
                    title={`Delete ${details.user.username}`}
                    confirm={'Delete'}
                    onConfirmed={remove}
                    onClose={() => setDeleting(false)}
                >
                    The account is deleted. A person who still owns servers can not be deleted.
                </Dialog.Confirm>
            )}
        </AdminPage>
    );
};
