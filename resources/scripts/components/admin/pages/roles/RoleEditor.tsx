import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeftIcon, ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import TriState from '@/components/admin/TriState';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import {
    addMember,
    createRole,
    deleteRole,
    removeMember,
    RoleInput,
    setState,
    State,
    statesOf,
    updateRole,
    usePermissions,
    useRole,
} from '@/api/admin/roles';

/** Admin > Roles > one role, or a new one: name, colour, what it grants and denies, and who has it. */
export default () => {
    const { id } = useParams<{ id?: string }>();
    const exists = !!id;
    const history = useHistory();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const permissions = usePermissions();
    const role = useRole(id);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('#3b82f6');
    const [states, setStates] = useState<Record<string, State>>({});
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [person, setPerson] = useState('');

    useEffect(() => {
        if (!role.data) return;

        setName(role.data.role.name);
        setDescription(role.data.role.description || '');
        setColor(role.data.role.color);
        setStates(statesOf(role.data.role));
    }, [role.data]);

    const covers = exists ? role.data?.covers ?? false : true;
    const canEdit = exists ? admin.can('roles.update') && covers : admin.can('roles.create');
    const mine = permissions.data?.mine ?? null;
    const groups = permissions.data?.groups ?? [];
    // A role can only grant the admin permissions its editor holds, a denial needs nothing.
    const mayGrant = (key: string, everybody: boolean) => everybody || mine === null || mine.includes(key);

    const input = (): RoleInput => ({ name, description, color, states });

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        const done = exists ? updateRole(Number(id), input()) : createRole(input());

        done.then((saved) => {
            addFlash({ key: 'admin', type: 'success', message: `${saved.name} was ${exists ? 'saved' : 'created'}.` });
            if (!exists) {
                history.push(`/admin/roles/view/${saved.id}`);
            } else {
                role.mutate();
            }
        })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () => {
        clearFlashes('admin');
        deleteRole(Number(id))
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: `${name} was deleted. The people who had it no longer have what it gave them.`,
                });
                history.push('/admin/roles');
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setDeleting(false));
    };

    const give = () => {
        if (!person.trim()) return;
        clearFlashes('admin');
        addMember(Number(id), person.trim())
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: `${person.trim()} now has ${name}.` });
                setPerson('');

                return role.mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    const take = (userId: number, username: string) => {
        clearFlashes('admin');
        removeMember(Number(id), userId)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: `${username} no longer has ${name}.` });

                return role.mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    const title = exists ? role.data?.role.name || 'Role' : 'New role';
    const loading = !permissions.data || (exists && !role.data);
    const backLink = (
        <AdminLink to={'/admin/roles'} className={'inline-flex items-center text-sm'}>
            <ArrowLeftIcon className={'mr-1.5 h-4 w-4'} />
            All roles
        </AdminLink>
    );

    if (loading) {
        return (
            <AdminPage title={title} actions={backLink}>
                {role.error || permissions.error ? (
                    <p className={'text-sm text-red-600'}>This role could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )}
            </AdminPage>
        );
    }

    return (
        <AdminPage
            title={title}
            subtitle={exists ? role.data?.role.description || 'A role.' : 'Pick what the role may do.'}
            actions={backLink}
        >
            {exists && !covers && (
                <p
                    className={
                        'mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800'
                    }
                >
                    This role holds permissions that you do not hold yourself, so you can look at it but not change it.
                </p>
            )}
            <div className={'grid items-start gap-4 lg:grid-cols-3'}>
                <div className={'space-y-4 lg:col-span-2'}>
                    {groups.map((group) => {
                        const everybody = group.id === 'self';

                        return (
                            <SectionCard
                                key={group.id}
                                icon={<ShieldCheckIcon className={'h-5 w-5'} />}
                                title={group.label}
                                description={group.description}
                                badge={
                                    canEdit ? (
                                        <div className={'flex flex-shrink-0 gap-3 text-xs'}>
                                            <button
                                                type={'button'}
                                                className={'text-primary-600'}
                                                onClick={() =>
                                                    setStates(
                                                        group.permissions.reduce(
                                                            (next, p) =>
                                                                mayGrant(p.key, everybody)
                                                                    ? { ...next, [p.key]: 'grant' as State }
                                                                    : next,
                                                            states
                                                        )
                                                    )
                                                }
                                            >
                                                grant all
                                            </button>
                                            <button
                                                type={'button'}
                                                className={'text-primary-600'}
                                                onClick={() =>
                                                    setStates(
                                                        group.permissions.reduce(
                                                            (next, p) => ({ ...next, [p.key]: 'default' as State }),
                                                            states
                                                        )
                                                    )
                                                }
                                            >
                                                reset
                                            </button>
                                        </div>
                                    ) : undefined
                                }
                            >
                                <div className={'space-y-2.5'}>
                                    {group.permissions.map((permission) => (
                                        <div key={permission.key} className={'flex items-center gap-4'}>
                                            <TriState
                                                label={permission.label}
                                                value={states[permission.key] || 'default'}
                                                disabled={!canEdit}
                                                grantDisabled={!mayGrant(permission.key, everybody)}
                                                onChange={(state) =>
                                                    setStates(
                                                        setState(states, groups, permission.key, state, (key) =>
                                                            mayGrant(key, false)
                                                        )
                                                    )
                                                }
                                            />
                                            <div className={'min-w-0 text-sm text-neutral-100'}>
                                                {permission.label}{' '}
                                                <code className={'text-xs text-neutral-400'}>{permission.key}</code>
                                                {!mayGrant(permission.key, everybody) && (
                                                    <span className={'ml-1 text-xs text-neutral-400'}>
                                                        (you do not hold this)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        );
                    })}
                </div>
                <div className={'space-y-4 lg:sticky lg:top-4'}>
                    <SectionCard icon={<ShieldCheckIcon className={'h-5 w-5'} />} title={'Role'}>
                        <Label htmlFor={'role-name'}>Name</Label>
                        <Input
                            id={'role-name'}
                            type={'text'}
                            maxLength={60}
                            value={name}
                            disabled={!canEdit}
                            onChange={(e) => setName(e.currentTarget.value)}
                        />
                        <div className={'mt-4'}>
                            <Label htmlFor={'role-description'}>Description</Label>
                            <Input
                                id={'role-description'}
                                type={'text'}
                                maxLength={255}
                                value={description}
                                disabled={!canEdit}
                                onChange={(e) => setDescription(e.currentTarget.value)}
                            />
                        </div>
                        <div className={'mt-4'}>
                            <Label htmlFor={'role-color'}>Colour</Label>
                            <input
                                id={'role-color'}
                                type={'color'}
                                value={color}
                                disabled={!canEdit}
                                onChange={(e) => setColor(e.currentTarget.value)}
                                className={
                                    'h-10 w-full cursor-pointer rounded-lg border border-neutral-500 bg-white p-1'
                                }
                            />
                        </div>
                        {(canEdit || (exists && admin.can('roles.delete') && covers)) && (
                            <div className={'mt-6 flex items-center justify-between gap-3'}>
                                {exists && admin.can('roles.delete') && covers ? (
                                    <Button.Danger type={'button'} onClick={() => setDeleting(true)}>
                                        Delete
                                    </Button.Danger>
                                ) : (
                                    <span />
                                )}
                                {canEdit && (
                                    <Button type={'button'} onClick={save} disabled={busy || !name.trim()}>
                                        {busy ? 'Saving...' : exists ? 'Save' : 'Create'}
                                    </Button>
                                )}
                            </div>
                        )}
                    </SectionCard>
                    <p
                        className={
                            'rounded-xl border border-neutral-500 bg-white p-4 text-xs text-neutral-400 shadow-md'
                        }
                    >
                        <strong className={'text-neutral-200'}>Default</strong> says nothing: in the admin area that
                        means no access, for what everybody can do it means what the panel allows.{' '}
                        <strong className={'text-neutral-200'}>Grant</strong> gives it, and also the &quot;see&quot;
                        permission of its group. <strong className={'text-neutral-200'}>Deny</strong> takes it away and
                        wins over a grant of another role. A role can only grant admin permissions that the person
                        editing it holds. Root admins are not limited by roles.
                    </p>
                </div>
            </div>

            {exists && role.data && (
                <SectionCard
                    className={'mt-4'}
                    icon={<UserGroupIcon className={'h-5 w-5'} />}
                    title={'People with this role'}
                    badge={<Pill>{role.data.members.length}</Pill>}
                >
                    {role.data.members.length === 0 ? (
                        <Empty>Nobody has this role yet.</Empty>
                    ) : (
                        <AdminTable heads={['Person', 'Email', 'Since', null]} className={'-mx-5 -mt-5'}>
                            {role.data.members.map((member) => (
                                <Row key={member.id}>
                                    <Cell>
                                        {admin.can('users.view') ? (
                                            <AdminLink to={`/admin/users/view/${member.id}`}>
                                                {member.username}
                                            </AdminLink>
                                        ) : (
                                            member.username
                                        )}{' '}
                                        {member.root_admin && <Pill tone={'yellow'}>Root admin</Pill>}
                                    </Cell>
                                    <Cell>{member.email}</Cell>
                                    <Cell className={'text-neutral-400'}>
                                        {member.since ? `${formatDistanceToNow(new Date(member.since))} ago` : ''}
                                    </Cell>
                                    <Cell className={'text-right'}>
                                        {admin.can('roles.assign') && covers && (
                                            <Button.Text
                                                type={'button'}
                                                variant={Options.Variant.Secondary}
                                                onClick={() => take(member.id, member.username)}
                                            >
                                                Remove
                                            </Button.Text>
                                        )}
                                    </Cell>
                                </Row>
                            ))}
                        </AdminTable>
                    )}
                    {admin.can('roles.assign') && covers && (
                        <div className={'mt-4 flex flex-wrap items-center gap-3'}>
                            <div className={'min-w-[16rem] flex-1'}>
                                <Input
                                    type={'text'}
                                    value={person}
                                    placeholder={'Username or email address'}
                                    aria-label={'Username or email address'}
                                    onChange={(e) => setPerson(e.currentTarget.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && give()}
                                />
                            </div>
                            <Button type={'button'} onClick={give} disabled={!person.trim()}>
                                Give this role
                            </Button>
                        </div>
                    )}
                </SectionCard>
            )}

            <Dialog.Confirm
                open={deleting}
                title={`Delete ${name}`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                The people who have {name} lose what it gives them.
            </Dialog.Confirm>
        </AdminPage>
    );
};
