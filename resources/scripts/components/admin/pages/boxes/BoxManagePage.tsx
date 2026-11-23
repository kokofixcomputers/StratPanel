import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClockIcon, PauseIcon, PlayIcon } from '@heroicons/react/solid';
import BoxFrame from '@/components/admin/pages/boxes/BoxFrame';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { suspendBox, updateBox, useAdminBox } from '@/api/admin/boxes';

/** Admin > Boxes > one box > Manage: suspend it, and add time. */
export default () => {
    const id = Number(useParams<{ id: string }>().id);
    const { data: box, mutate, error } = useAdminBox(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [busy, setBusy] = useState(false);
    const can = admin.can('boxes.update');

    if (!box) return error ? null : <Spinner size={'large'} centered />;

    const run = (work: Promise<unknown>, message: string) => {
        clearFlashes('admin');
        setBusy(true);

        return work
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const addDays = (days: number) => {
        const from = box.expires_at && new Date(box.expires_at) > new Date() ? new Date(box.expires_at) : new Date();
        from.setDate(from.getDate() + days);

        return run(
            updateBox(box.admin_id, { expires_at: from.toISOString() }),
            `${days} days were added, the box runs out ${from.toLocaleDateString()}.`
        );
    };

    return (
        <BoxFrame box={box} subtitle={'Suspend the box, or give it more time.'}>
            <div className={'grid gap-4 lg:grid-cols-2'}>
                {can && (
                    <SectionCard
                        icon={
                            box.status === 'active' ? (
                                <PauseIcon className={'h-5 w-5'} />
                            ) : (
                                <PlayIcon className={'h-5 w-5'} />
                            )
                        }
                        title={box.status === 'active' ? 'Suspend box' : 'Unsuspend box'}
                    >
                        <p className={'mb-4 text-sm text-neutral-200'}>
                            {box.status === 'active'
                                ? 'This suspends the box and every server in it: they are stopped and the owner can not use them until the box is let go again. Nothing is deleted.'
                                : box.status === 'expired'
                                ? 'This box ran out of time. Letting it run again starts the servers back up, add time as well or it runs out again.'
                                : 'This lets the box and its servers run again.'}
                        </p>
                        <Button.Text
                            disabled={busy}
                            onClick={() =>
                                run(
                                    suspendBox(box.admin_id, box.status === 'active'),
                                    box.status === 'active' ? 'The box was suspended.' : 'The box is active again.'
                                )
                            }
                        >
                            {box.status === 'active' ? 'Suspend box' : 'Unsuspend box'}
                        </Button.Text>
                    </SectionCard>
                )}
                {can && (
                    <SectionCard icon={<ClockIcon className={'h-5 w-5'} />} title={'Add time'}>
                        <p className={'mb-4 text-sm text-neutral-200'}>
                            {box.expires_at
                                ? `The box runs out on ${new Date(
                                      box.expires_at
                                  ).toLocaleDateString()}. The days are added to what is left (or to today when it ran out).`
                                : 'The box does not run out. Adding days gives it an end date.'}
                        </p>
                        <div className={'flex flex-wrap gap-2'}>
                            {[7, 30, 90, 365].map((days) => (
                                <Button.Text key={days} disabled={busy} onClick={() => addDays(days)}>
                                    +{days} days
                                </Button.Text>
                            ))}
                        </div>
                    </SectionCard>
                )}
            </div>
        </BoxFrame>
    );
};
