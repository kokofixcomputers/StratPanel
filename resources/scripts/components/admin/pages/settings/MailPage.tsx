import React, { useState } from 'react';
import { MailIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import useSettingForm from '@/plugins/useSettingForm';
import { Mail, postSetting } from '@/api/admin/settings';

interface Values {
    host: string;
    port: string;
    encryption: string;
    username: string;
    password: string;
    clear_password: boolean;
    from_address: string;
    from_name: string;
}

const SAVED = 'Mail settings have been updated successfully and the queue worker was restarted to apply these changes.';

/** Admin > Settings > Mail: the SMTP server the panel sends its emails through. */
export default () => {
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [testing, setTesting] = useState(false);
    const { data, values, set, busy, save } = useSettingForm<Mail, Values>(
        'mail',
        (d) => ({
            host: d.host,
            port: String(d.port),
            encryption: d.encryption,
            username: d.username,
            password: '',
            clear_password: false,
            from_address: d.from_address,
            from_name: d.from_name,
        }),
        SAVED
    );
    const can = admin.can('settings.mail.update');

    const body = () =>
        values && {
            'mail:mailers:smtp:host': values.host,
            'mail:mailers:smtp:port': values.port,
            'mail:mailers:smtp:encryption': values.encryption === '' ? null : values.encryption,
            'mail:mailers:smtp:username': values.username,
            // Empty keeps the saved one, "!e" sets an empty one.
            'mail:mailers:smtp:password': values.clear_password ? '!e' : values.password,
            'mail:from:address': values.from_address,
            'mail:from:name': values.from_name,
        };

    const test = () => {
        save(body(), 'Mail settings were saved.').then((fresh) => {
            if (!fresh) return;
            clearFlashes('admin');
            setTesting(true);
            postSetting<{ sent_to: string }>('mail/test')
                .then(({ sent_to }) =>
                    addFlash({ key: 'admin', type: 'success', message: `The test message was sent to ${sent_to}.` })
                )
                .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
                .then(() => setTesting(false));
        });
    };

    return (
        <SettingsFrame title={'Mail'} subtitle={'Configure how the panel sends email.'}>
            {!data || !values ? (
                <Spinner size={'large'} centered />
            ) : data.disabled ? (
                <Notice tone={'blue'}>
                    This page is only for SMTP. The panel is set to send mail in another way (<code>MAIL_MAILER</code>{' '}
                    in <code>.env</code>); set it to <code>smtp</code> to change the settings here.
                </Notice>
            ) : (
                <SectionCard icon={<MailIcon className={'h-5 w-5'} />} title={'SMTP settings'}>
                    <Stack>
                        <Columns>
                            <TextField
                                id={'smtp-host'}
                                label={'SMTP host'}
                                value={values.host}
                                disabled={!can}
                                onChange={(host) => set({ host })}
                                help={'The address of the SMTP server that outgoing mail goes through.'}
                            />
                            <TextField
                                id={'smtp-port'}
                                type={'number'}
                                label={'SMTP port'}
                                value={values.port}
                                disabled={!can}
                                onChange={(port) => set({ port })}
                                help={'The port the SMTP server listens on.'}
                            />
                        </Columns>
                        <Columns>
                            <SelectField
                                id={'smtp-encryption'}
                                label={'Encryption'}
                                value={values.encryption}
                                disabled={!can}
                                choices={[
                                    { value: '', label: 'None' },
                                    { value: 'tls', label: 'Transport Layer Security (TLS)' },
                                    { value: 'ssl', label: 'Secure Sockets Layer (SSL)' },
                                ]}
                                onChange={(encryption) => set({ encryption })}
                                help={'The type of encryption to use when sending mail.'}
                            />
                            <TextField
                                id={'smtp-username'}
                                label={'Username (optional)'}
                                value={values.username}
                                disabled={!can}
                                onChange={(username) => set({ username })}
                                help={'The username to use when connecting to the SMTP server.'}
                            />
                        </Columns>
                        <Columns>
                            <TextField
                                id={'smtp-password'}
                                type={'password'}
                                autoComplete={'new-password'}
                                label={'Password (optional)'}
                                value={values.password}
                                disabled={!can || values.clear_password}
                                placeholder={
                                    data.password_saved ? 'A password is saved, type a new one to replace it' : ''
                                }
                                onChange={(password) => set({ password })}
                                help={'Leave blank to keep the password that is saved.'}
                            />
                            <ToggleField
                                label={'Remove the saved password'}
                                help={'For a server that needs none.'}
                                checked={values.clear_password}
                                disabled={!can}
                                onChange={(clear_password) => set({ clear_password })}
                            />
                        </Columns>
                        <Columns>
                            <TextField
                                id={'mail-from'}
                                type={'email'}
                                label={'Mail from'}
                                value={values.from_address}
                                disabled={!can}
                                onChange={(from_address) => set({ from_address })}
                                help={'The address all outgoing emails come from.'}
                            />
                            <TextField
                                id={'mail-from-name'}
                                label={'Mail from name (optional)'}
                                value={values.from_name}
                                disabled={!can}
                                onChange={(from_name) => set({ from_name })}
                                help={'The name emails appear to come from.'}
                            />
                        </Columns>
                    </Stack>
                    {can && (
                        <div className={'mt-6 flex justify-end gap-3'}>
                            <Button.Text onClick={test} disabled={busy || testing}>
                                Save and send a test
                            </Button.Text>
                            <Button onClick={() => save(body())} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </SectionCard>
            )}
        </SettingsFrame>
    );
};
