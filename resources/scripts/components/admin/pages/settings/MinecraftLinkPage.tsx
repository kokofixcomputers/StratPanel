import React, { useEffect, useState } from 'react';
import { CubeIcon, InformationCircleIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Notice, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { MinecraftLink, saveSetting, useSetting } from '@/api/admin/settings';

/** Admin > Settings > Minecraft accounts: whether people can link their Minecraft account to their account, and how they are told to. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.minecraft.update');
    const { data, mutate } = useSetting<MinecraftLink>('minecraft', { refreshInterval: 10000 });
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [form, setForm] = useState<{ enabled: boolean; address: string } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data && !form) setForm({ enabled: data.enabled, address: data.address });
    }, [data]);

    const save = () => {
        if (!form) return;
        clearFlashes('admin');
        setBusy(true);
        saveSetting('minecraft', form)
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: form.enabled
                        ? 'People can link their Minecraft account. The router notices within 15 seconds.'
                        : 'Linking Minecraft accounts is off.',
                });

                return mutate();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    return (
        <SettingsFrame
            title={'Minecraft accounts'}
            subtitle={
                'Let people link their Minecraft account: the skin becomes their avatar and they can be invited to servers by name.'
            }
        >
            {!data || !form ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <SectionCard
                        className={'lg:col-span-2'}
                        icon={<CubeIcon className={'h-5 w-5'} />}
                        title={'Link Minecraft accounts'}
                    >
                        <Stack>
                            <ToggleField
                                label={'People can link their Minecraft account'}
                                help={
                                    'Off by default. When it is on, a player who joins the Minecraft router with an address that leads to no server is checked with Mojang (it has to be a real account, not offline mode), and is disconnected with a screen that shows a 6 digit code. Typing the code on the Account page links the two.'
                                }
                                checked={form.enabled}
                                disabled={!can}
                                onChange={(enabled) => setForm({ ...form, enabled })}
                            />
                            <TextField
                                id={'minecraft-address'}
                                label={'Address to join'}
                                value={form.address}
                                disabled={!can}
                                placeholder={'link.example.com'}
                                help={
                                    <>
                                        Shown to people on the Account page, so they know where to join. Any address
                                        that leads to the machine of the router but is not the domain of a server, for
                                        example <code>link.example.com</code> as an A record. Nothing needs to be set up
                                        for it.
                                    </>
                                }
                                onChange={(address) => setForm({ ...form, address })}
                            />
                        </Stack>
                        {form.enabled && !data.router && (
                            <div className={'mt-4'}>
                                <Notice tone={'yellow'}>
                                    The panel has no router secret (<code>PTERODACTYL_DOMAINS_ROUTER_TOKEN</code>), so
                                    the router cannot ask it for codes. Set up the router first.
                                </Notice>
                            </div>
                        )}
                        {can && (
                            <div className={'mt-6 flex justify-end'}>
                                <Button onClick={save} disabled={busy}>
                                    Save
                                </Button>
                            </div>
                        )}
                    </SectionCard>
                    <div className={'space-y-4'}>
                        <SectionCard icon={<CubeIcon className={'h-5 w-5'} />} title={'Now'}>
                            <dl className={'space-y-2 text-sm'}>
                                <div className={'flex justify-between'}>
                                    <dt className={'text-neutral-300'}>Accounts linked</dt>
                                    <dd className={'font-semibold text-neutral-50'}>{data.linked}</dd>
                                </div>
                                <div className={'flex justify-between'}>
                                    <dt className={'text-neutral-300'}>Codes waiting</dt>
                                    <dd className={'font-semibold text-neutral-50'}>{data.waiting}</dd>
                                </div>
                            </dl>
                        </SectionCard>
                        <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                            <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                                <li>
                                    It needs the router (<code>stratosphere-net</code>) of this release, running on the
                                    machine that players reach on port 25565, and that machine has to reach Mojang.
                                </li>
                                <li>
                                    A code works for {data.minutes} minutes, once, and only for the account that got it.
                                </li>
                                <li>
                                    A Minecraft account links to one account of this panel. People can unlink theirs on
                                    the Account page.
                                </li>
                                <li>
                                    The avatar comes from mc-heads.net by default, set <code>MINECRAFT_AVATAR_URL</code>{' '}
                                    to use another service.
                                </li>
                            </ul>
                        </SectionCard>
                    </div>
                </div>
            )}
        </SettingsFrame>
    );
};
