import React from 'react';
import { AdjustmentsIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { Advanced } from '@/api/admin/settings';

interface Values {
    timeout: string;
    connect_timeout: string;
}

/** Admin > Settings > Advanced: how long the panel waits for other servers (nodes, services). */
export default () => {
    const admin = useAdmin();
    const { values, set, busy, save } = useSettingForm<Advanced, Values>(
        'advanced',
        (d) => ({ timeout: String(d.timeout), connect_timeout: String(d.connect_timeout) }),
        'Advanced settings have been updated successfully and the queue worker was restarted to apply these changes.'
    );
    const can = admin.can('settings.advanced.update');

    return (
        <SettingsFrame title={'Advanced'} subtitle={'Configure advanced settings for the panel.'}>
            {!values ? (
                <Spinner size={'large'} centered />
            ) : (
                <SectionCard icon={<AdjustmentsIcon className={'h-5 w-5'} />} title={'HTTP connections'}>
                    <Columns>
                        <TextField
                            id={'timeout'}
                            type={'number'}
                            label={'Request timeout (seconds)'}
                            value={values.timeout}
                            disabled={!can}
                            onChange={(timeout) => set({ timeout })}
                            help={
                                'The time in seconds before a request to a node or another service is given up (1 to 60).'
                            }
                        />
                        <TextField
                            id={'connect-timeout'}
                            type={'number'}
                            label={'Connection timeout (seconds)'}
                            value={values.connect_timeout}
                            disabled={!can}
                            onChange={(connect_timeout) => set({ connect_timeout })}
                            help={'The time in seconds to wait for a connection to be made (1 to 60).'}
                        />
                    </Columns>
                    {can && (
                        <div className={'mt-6 flex justify-end'}>
                            <Button
                                onClick={() =>
                                    save({
                                        'pterodactyl:guzzle:timeout': values.timeout,
                                        'pterodactyl:guzzle:connect_timeout': values.connect_timeout,
                                    })
                                }
                                disabled={busy}
                            >
                                Save
                            </Button>
                        </div>
                    )}
                </SectionCard>
            )}
        </SettingsFrame>
    );
};
