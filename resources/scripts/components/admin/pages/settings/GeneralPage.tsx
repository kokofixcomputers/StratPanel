import React from 'react';
import { CogIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, SelectField, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { General } from '@/api/admin/settings';

interface Values {
    name: string;
    two_factor: number;
    locale: string;
}

const LEVELS = [
    { value: 0, label: 'Not required' },
    { value: 1, label: 'Admin only' },
    { value: 2, label: 'All users' },
];

/** Admin > Settings: the name of the panel, who needs two-factor authentication and the default language. */
export default () => {
    const admin = useAdmin();
    const { data, values, set, busy, save } = useSettingForm<General, Values>(
        'general',
        (d) => ({ name: d.name, two_factor: d.two_factor, locale: d.locale }),
        'Panel settings have been updated successfully and the queue worker was restarted to apply these changes.'
    );
    const can = admin.can('settings.general.update');

    return (
        <SettingsFrame title={'Settings'} subtitle={'Configure the basics of this panel.'}>
            {!data || !values ? (
                <Spinner size={'large'} centered />
            ) : (
                <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Panel settings'}>
                    <Columns className={'sm:grid-cols-3'}>
                        <TextField
                            id={'company-name'}
                            label={'Company name'}
                            value={values.name}
                            disabled={!can}
                            onChange={(name) => set({ name })}
                            help={'The name used throughout the panel and in emails sent to clients.'}
                        />
                        <div>
                            <p className={'mb-1 text-sm font-medium text-neutral-200'}>
                                Require 2-factor authentication
                            </p>
                            <div
                                className={'flex overflow-hidden rounded-lg border border-neutral-500'}
                                role={'radiogroup'}
                            >
                                {LEVELS.map((level) => (
                                    <button
                                        key={level.value}
                                        type={'button'}
                                        role={'radio'}
                                        aria-checked={values.two_factor === level.value}
                                        disabled={!can}
                                        onClick={() => set({ two_factor: level.value })}
                                        className={
                                            values.two_factor === level.value
                                                ? 'flex-1 bg-primary-600 px-3 py-2 text-sm text-white'
                                                : 'flex-1 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-600'
                                        }
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                            <p className={'input-help'}>
                                Anybody in the chosen group has to have 2-factor authentication enabled to use the
                                panel.
                            </p>
                        </div>
                        <SelectField
                            id={'default-language'}
                            label={'Default language'}
                            value={values.locale}
                            disabled={!can}
                            choices={Object.entries(data.languages).map(([value, label]) => ({ value, label }))}
                            onChange={(locale) => set({ locale })}
                            help={'The language used when drawing the panel for somebody who did not choose one.'}
                        />
                    </Columns>
                    {can && (
                        <div className={'mt-6 flex justify-end'}>
                            <Button
                                onClick={() =>
                                    save({
                                        'app:name': values.name,
                                        'pterodactyl:auth:2fa_required': values.two_factor,
                                        'app:locale': values.locale,
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
