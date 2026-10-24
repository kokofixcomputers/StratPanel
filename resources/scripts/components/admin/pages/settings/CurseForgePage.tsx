import React, { useState } from 'react';
import { PuzzleIcon, InformationCircleIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { Pill } from '@/components/admin/AdminTable';
import { Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { CurseForge, postSetting, saveSetting, useSetting } from '@/api/admin/settings';

interface Verdict {
    ok: boolean;
    message: string;
}

/** Admin > Settings > CurseForge: the API key that adds CurseForge to the Content page of every server. */
export default () => {
    const admin = useAdmin();
    const { data, mutate } = useSetting<CurseForge>('curseforge');
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [key, setKey] = useState('');
    const [remove, setRemove] = useState(false);
    const [busy, setBusy] = useState(false);
    const can = admin.can('settings.curseforge.update');

    const done = (verdict: Verdict) => {
        addFlash({ key: 'admin', type: verdict.ok ? 'success' : 'warning', message: verdict.message });
        setKey('');
        setRemove(false);

        return mutate();
    };

    const run = (work: Promise<Verdict>) => {
        clearFlashes('admin');
        setBusy(true);
        work.then(done)
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    if (!data) return <Spinner size={'large'} centered />;

    return (
        <SettingsFrame
            title={'CurseForge'}
            subtitle={'Add CurseForge next to Modrinth on the Content page of a server.'}
        >
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<PuzzleIcon className={'h-5 w-5'} />}
                    title={'API key'}
                    badge={<Pill tone={data.enabled ? 'green' : 'neutral'}>{data.enabled ? 'On' : 'Off'}</Pill>}
                >
                    <Stack>
                        <p className={'text-sm text-neutral-200'}>
                            CurseForge only answers applications that have a key. With one, the Content page of every
                            server gets a CurseForge tab next to Modrinth: mods, plugins, data packs, resource packs and
                            worlds can be browsed with their pages and screenshots and installed, and the mods in the
                            file manager get their icons. Get a key for free at console.curseforge.com.
                        </p>
                        <TextField
                            id={'curseforge-key'}
                            type={'password'}
                            autoComplete={'new-password'}
                            label={'Key'}
                            value={key}
                            disabled={!can || remove}
                            placeholder={
                                data.enabled
                                    ? data.from_environment
                                        ? 'A key is set in the environment (CURSEFORGE_API_KEY)'
                                        : 'A key is saved, enter a new one to replace it'
                                    : 'Paste your API key'
                            }
                            onChange={setKey}
                            help={
                                'It is stored encrypted and never sent to a browser: the panel asks CurseForge for people, so the key stays secret.'
                            }
                        />
                        {data.enabled && !data.from_environment && can && (
                            <ToggleField
                                label={'Remove the saved key (turns CurseForge off)'}
                                checked={remove}
                                onChange={setRemove}
                            />
                        )}
                    </Stack>
                    {can && (
                        <div className={'mt-6 flex justify-end gap-3'}>
                            {data.enabled && (
                                <Button.Text
                                    disabled={busy}
                                    onClick={() => run(postSetting<Verdict>('curseforge/test'))}
                                >
                                    Test the key
                                </Button.Text>
                            )}
                            <Button
                                disabled={busy || (!remove && key.trim() === '')}
                                onClick={() =>
                                    run(
                                        saveSetting<Verdict>(
                                            'curseforge',
                                            remove ? { remove_key: true } : { api_key: key.trim() }
                                        )
                                    )
                                }
                            >
                                Save
                            </Button>
                        </div>
                    )}
                </SectionCard>
                <SectionCard icon={<InformationCircleIcon className={'h-5 w-5'} />} title={'Good to know'}>
                    <ul className={'list-disc space-y-2 pl-4 text-sm text-neutral-200'}>
                        <li>
                            Some authors do not allow their files to be downloaded outside CurseForge. Those show a link
                            to CurseForge instead of an install button.
                        </li>
                        <li>
                            Searches and project pages are kept for a few minutes, so a busy panel does not use up the
                            limits of the key.
                        </li>
                        <li>Modpacks are only installed from Modrinth.</li>
                    </ul>
                </SectionCard>
            </div>
        </SettingsFrame>
    );
};
