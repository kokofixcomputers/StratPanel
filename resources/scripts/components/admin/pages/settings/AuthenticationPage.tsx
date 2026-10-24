import React from 'react';
import { LockClosedIcon, UserAddIcon, FingerPrintIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { Authentication } from '@/api/admin/settings';

interface Values {
    captcha: string;
    recaptcha_site_key: string;
    recaptcha_secret_key: string;
    turnstile_site_key: string;
    turnstile_secret_key: string;
    passkeys: boolean;
    registration: boolean;
    registration_password: boolean;
}

/** Admin > Settings > Authentication: the captcha on the forms, passkeys, and whether people can sign up on their own. */
export default () => {
    const admin = useAdmin();
    const { data, values, set, busy, save } = useSettingForm<Authentication, Values>(
        'authentication',
        (d) => ({
            captcha: d.captcha,
            recaptcha_site_key: d.recaptcha_site_key,
            recaptcha_secret_key: '',
            turnstile_site_key: d.turnstile_site_key,
            turnstile_secret_key: '',
            passkeys: d.passkeys,
            registration: d.registration,
            registration_password: d.registration_password,
        }),
        'Authentication settings were saved.'
    );
    const can = admin.can('settings.authentication.update');

    return (
        <SettingsFrame
            title={'Authentication'}
            subtitle={'The captcha on the forms, and whether people can sign up on their own.'}
        >
            {!data || !values ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'space-y-4'}>
                    <SectionCard
                        icon={<LockClosedIcon className={'h-5 w-5'} />}
                        title={'Captcha'}
                        description={'Checked on the sign in, sign up and password reset forms.'}
                    >
                        <Stack>
                            <SelectField
                                id={'captcha'}
                                label={'Captcha'}
                                value={values.captcha}
                                disabled={!can}
                                choices={[
                                    { value: 'none', label: 'None' },
                                    { value: 'recaptcha', label: 'Google reCAPTCHA (invisible)' },
                                    { value: 'turnstile', label: 'Cloudflare Turnstile' },
                                ]}
                                onChange={(captcha) => set({ captcha })}
                            />
                            {values.captcha === 'recaptcha' && (
                                <>
                                    <Columns>
                                        <TextField
                                            id={'recaptcha-site'}
                                            label={'reCAPTCHA site key'}
                                            value={values.recaptcha_site_key}
                                            disabled={!can}
                                            onChange={(recaptcha_site_key) => set({ recaptcha_site_key })}
                                        />
                                        <TextField
                                            id={'recaptcha-secret'}
                                            type={'password'}
                                            autoComplete={'new-password'}
                                            label={'reCAPTCHA secret key'}
                                            value={values.recaptcha_secret_key}
                                            disabled={!can}
                                            placeholder={'A secret key is saved, enter a new one to replace it'}
                                            onChange={(recaptcha_secret_key) => set({ recaptcha_secret_key })}
                                            help={
                                                'Make "reCAPTCHA v2 → Invisible" keys at google.com/recaptcha/admin. Used between this panel and Google, keep it secret.'
                                            }
                                        />
                                    </Columns>
                                    {data.recaptcha_shipped && (
                                        <Notice>
                                            You are using the reCAPTCHA keys that were shipped with the panel. They
                                            work, but keys made for your own website are better.
                                        </Notice>
                                    )}
                                </>
                            )}
                            {values.captcha === 'turnstile' && (
                                <Columns>
                                    <TextField
                                        id={'turnstile-site'}
                                        label={'Turnstile site key'}
                                        value={values.turnstile_site_key}
                                        disabled={!can}
                                        onChange={(turnstile_site_key) => set({ turnstile_site_key })}
                                    />
                                    <TextField
                                        id={'turnstile-secret'}
                                        type={'password'}
                                        autoComplete={'new-password'}
                                        label={'Turnstile secret key'}
                                        value={values.turnstile_secret_key}
                                        disabled={!can}
                                        placeholder={
                                            data.turnstile_secret_saved
                                                ? 'A secret key is saved, enter a new one to replace it'
                                                : 'Paste the secret key'
                                        }
                                        onChange={(turnstile_secret_key) => set({ turnstile_secret_key })}
                                        help={
                                            'Make a widget (managed or invisible) at Cloudflare → Turnstile for the address of this panel. The secret key is stored encrypted.'
                                        }
                                    />
                                </Columns>
                            )}
                        </Stack>
                    </SectionCard>
                    <SectionCard
                        icon={<FingerPrintIcon className={'h-5 w-5'} />}
                        title={'Passkeys'}
                        description={
                            'Lets people sign in with a fingerprint, a face, a PIN or a security key instead of a password. They add passkeys under Account → Passkeys. A passkey is checked on the device, so it counts as two factors and does not ask for the two-factor code. Passkeys only work on an https address (or localhost) and are tied to the domain of the panel.'
                        }
                    >
                        <ToggleField
                            label={'Allow passkeys'}
                            checked={values.passkeys}
                            disabled={!can}
                            onChange={(passkeys) => set({ passkeys })}
                        />
                    </SectionCard>
                    <SectionCard
                        icon={<UserAddIcon className={'h-5 w-5'} />}
                        title={'Self sign up'}
                        description={
                            'Off by default: accounts are made by admins. When it is on, anybody who can reach the panel can make an account, with a username and password or with one of the providers that allow it. Accounts made this way are normal accounts without any admin rights, and can create servers only if the panel lets ordinary users do that.'
                        }
                    >
                        <Stack>
                            <ToggleField
                                label={'Let people sign up on their own'}
                                checked={values.registration}
                                disabled={!can}
                                onChange={(registration) => set({ registration })}
                            />
                            <ToggleField
                                label={'… with a username, email address and password'}
                                checked={values.registration_password}
                                disabled={!can}
                                onChange={(registration_password) => set({ registration_password })}
                                help={
                                    data.providers === 0
                                        ? 'No providers are set up yet. Without a captcha, password sign up invites bots.'
                                        : 'Signing up with a provider is allowed per provider, on its own page.'
                                }
                            />
                        </Stack>
                    </SectionCard>
                    {can && (
                        <div className={'flex justify-end'}>
                            <Button onClick={() => save()} disabled={busy}>
                                Save
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </SettingsFrame>
    );
};
