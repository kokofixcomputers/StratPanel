import React from 'react';
import { InformationCircleIcon, TrashIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { Trash } from '@/api/admin/settings';

interface Values {
    enabled: boolean;
    retention_days: string;
}

/** Admin > Settings > Trash: whether deleted files and schedules are kept for a while, and for how long. */
export default () => {
    const admin = useAdmin();
    const { data, values, set, busy, save } = useSettingForm<Trash, Values>(
        'trash',
        (d) => ({ enabled: d.enabled, retention_days: String(d.retention_days) }),
        'Trash bin settings were saved.'
    );
    const can = admin.can('settings.trash.update');

    return (
        <SettingsFrame
            title={'Trash'}
            subtitle={'Keep what is deleted from a server for a while, so it can be recovered.'}
        >
            {!data || !values ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <SectionCard
                        className={'lg:col-span-2'}
                        icon={<TrashIcon className={'h-5 w-5'} />}
                        title={'Trash bin'}
                    >
                        <Stack>
                            <ToggleField
                                label={'Keep deleted files and schedules in a trash bin'}
                                help={
                                    "Off by default. When it is on, files, folders and schedules that people delete from a server are moved to the trash bin of that server instead of being deleted. People with the trash permissions of the server (owners always have them) see the trash bin on the server's menu and can recover things from it. Nothing is overwritten when something is recovered."
                                }
                                checked={values.enabled}
                                disabled={!can}
                                onChange={(enabled) => set({ enabled })}
                            />
                            <TextField
                                id={'retention'}
                                type={'number'}
                                label={'Keep for (days)'}
                                value={values.retention_days}
                                disabled={!can}
                                onChange={(retention_days) => set({ retention_days })}
                                help={
                                    'After this many days an item is deleted for good, the panel checks every hour. A change applies to what is deleted from now on.'
                                }
                            />
                        </Stack>
                        {can && (
                            <div className={'mt-6 flex justify-end'}>
                                <Button
                                    onClick={() =>
                                        save({ enabled: values.enabled, retention_days: values.retention_days })
                                    }
                                    disabled={busy}
                                >
                                    Save
                                </Button>
                            </div>
                        )}
                    </SectionCard>
                    <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                        <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                            <li>
                                Files stay on the node, in a hidden folder in the root of the server. They count toward
                                the disk limit of the server until they are recovered, deleted or expire. The panel
                                never lets the file manager show or touch that folder.
                            </li>
                            <li>Databases, backups and whole servers are not kept: they are deleted at once.</li>
                            <li>
                                Turning this off keeps what is in the trash bins already, it is recoverable until it
                                expires. Deleting is permanent again from then on.
                            </li>
                            <li>
                                Right now: {data.items} {data.items === 1 ? 'item is' : 'items are'} in trash bins
                                {data.bytes > 0 && `, at least ${(data.bytes / 1048576).toFixed(1)} MB of files`}.
                            </li>
                        </ul>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};
