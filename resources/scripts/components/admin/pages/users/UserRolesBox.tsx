import React, { useEffect, useState } from 'react';
import { ShieldCheckIcon } from '@heroicons/react/solid';
import SectionCard from '@/components/elements/SectionCard';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { syncRoles, UserRole } from '@/api/admin/users';

/** The roles of a person, with a box to tick for each one that you may give. */
export default ({
    userId,
    roles,
    isRootAdmin,
    onSaved,
}: {
    userId: number;
    roles: UserRole[];
    isRootAdmin: boolean;
    onSaved: () => void;
}) => {
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [picked, setPicked] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => setPicked(roles.filter((role) => role.assigned).map((role) => role.id)), [roles]);

    const anyAssignable = roles.some((role) => role.assignable);
    const changed =
        JSON.stringify([...picked].sort()) !==
        JSON.stringify(
            roles
                .filter((r) => r.assigned)
                .map((r) => r.id)
                .sort()
        );

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        syncRoles(userId, picked)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The roles of this person were saved.' });
                onSaved();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SectionCard
            icon={<ShieldCheckIcon className={'h-5 w-5'} />}
            title={'Roles'}
            description={
                isRootAdmin
                    ? 'Root admins can do everything, whatever roles they have.'
                    : 'What this person may do in the admin area.'
            }
        >
            {roles.length === 0 ? (
                <p className={'text-sm text-neutral-400'}>There are no roles yet.</p>
            ) : (
                <div className={'space-y-2'}>
                    {roles.map((role) => (
                        <label
                            key={role.id}
                            className={`flex items-center gap-3 text-sm text-neutral-100 ${
                                role.assignable ? 'cursor-pointer' : 'opacity-60'
                            }`}
                        >
                            <input
                                type={'checkbox'}
                                className={'form-input'}
                                checked={picked.includes(role.id)}
                                disabled={!role.assignable}
                                onChange={(e) =>
                                    setPicked(
                                        e.currentTarget.checked
                                            ? [...picked, role.id]
                                            : picked.filter((id) => id !== role.id)
                                    )
                                }
                            />
                            <span
                                className={'rounded-full px-2.5 py-0.5 text-xs font-medium text-snow'}
                                style={{ backgroundColor: role.color }}
                            >
                                {role.name}
                            </span>
                            <span className={'text-xs text-neutral-400'}>{role.description}</span>
                        </label>
                    ))}
                </div>
            )}
            {anyAssignable && (
                <div className={'mt-4 text-right'}>
                    <Button type={'button'} onClick={save} disabled={busy || !changed}>
                        {busy ? 'Saving...' : 'Save roles'}
                    </Button>
                </div>
            )}
        </SectionCard>
    );
};
