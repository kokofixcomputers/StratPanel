import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { MoonIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import Select from '@/components/elements/Select';
import Switch from '@/components/elements/Switch';
import Label from '@/components/elements/Label';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { usePermissions } from '@/plugins/usePermissions';
import { AutoSleepSettings, getAutoSleep, updateAutoSleep } from '@/api/server/autoSleep';
import { minutesLabel, minutesUntilSleep } from '@/lib/autoSleep';

/**
 * Auto sleep: the server is stopped when nobody has been online for a while, which gives its memory back, and a player who
 * tries to join wakes it up again. Off until the owner turns it on.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);
    const { clearFlashes, addFlash, clearAndAddHttpError } = useFlash();
    const [canChange] = usePermissions(['settings.auto-sleep']);

    const [saved, setSaved] = useState<AutoSleepSettings | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [minutes, setMinutes] = useState(15);
    const [wake, setWake] = useState(true);
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    // Moves on the time left, which is worked out from when the idle time began.
    const [now, setNow] = useState(() => Date.now());

    const apply = (settings: AutoSleepSettings) => {
        setSaved(settings);
        setEnabled(settings.enabled);
        setMinutes(settings.idleMinutes);
        setWake(settings.wakeOnJoin);
    };

    useEffect(() => {
        let cancelled = false;
        getAutoSleep(uuid)
            .then((settings) => !cancelled && apply(settings))
            .catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
        };
    }, [uuid]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15000);

        return () => clearInterval(timer);
    }, []);

    const dirty = !!saved && (enabled !== saved.enabled || minutes !== saved.idleMinutes || wake !== saved.wakeOnJoin);

    const save = () => {
        setSaving(true);
        clearFlashes('settings');
        updateAutoSleep(uuid, { enabled, idleMinutes: minutes, wakeOnJoin: wake })
            .then((settings) => {
                apply(settings);
                setServerFromState((s) => ({
                    ...s,
                    autoSleep: { enabled: settings.enabled, sleeping: settings.sleeping },
                }));
                addFlash({
                    key: 'settings',
                    type: 'success',
                    message: settings.enabled
                        ? `Auto sleep is on, the server sleeps after ${minutesLabel(
                              settings.idleMinutes
                          )} without players.`
                        : 'Auto sleep is off.',
                });
            })
            .catch((error) => clearAndAddHttpError({ key: 'settings', error }))
            .then(() => setSaving(false));
    };

    const left = saved?.enabled && saved.idleSince ? minutesUntilSleep(saved.idleSince, saved.idleMinutes, now) : null;

    return (
        <TitledGreyBox title={'Auto Sleep'} css={tw`mb-6 md:mb-10`}>
            {!saved ? (
                failed ? (
                    <p css={tw`text-sm text-red-600`}>Auto sleep could not be loaded.</p>
                ) : (
                    <Spinner size={'small'} centered />
                )
            ) : (
                <>
                    <p css={tw`text-sm text-neutral-300 mb-4`}>
                        Stops the server when nobody has been online for a while, so it gives its memory back. A player
                        who tries to join wakes it up again. It is off until you turn it on.
                    </p>

                    {saved.enabled && saved.sleeping && (
                        <div css={tw`flex items-start rounded-xl border border-blue-200 bg-blue-50 p-3 mb-4`}>
                            <MoonIcon css={tw`w-5 h-5 text-blue-600 mr-2 flex-shrink-0`} />
                            <p css={tw`text-sm text-blue-900`}>
                                The server is asleep
                                {saved.sleptAt && <> since {saved.sleptAt.toLocaleString()}</>}.{' '}
                                {saved.wakeOnJoin && saved.wakeAvailable
                                    ? 'A player who tries to join starts it, or press Start.'
                                    : 'Press Start to wake it.'}
                            </p>
                        </div>
                    )}
                    {saved.enabled && !saved.sleeping && left !== null && (
                        <p css={tw`text-xs text-neutral-300 mb-4`}>
                            Nobody is online.{' '}
                            {left > 0
                                ? `The server sleeps in about ${minutesLabel(left)} unless somebody joins.`
                                : 'The server is about to sleep.'}
                        </p>
                    )}

                    <Switch
                        key={`enabled-${saved.enabled}`}
                        name={'auto-sleep-enabled'}
                        label={'Put this server to sleep when it is empty'}
                        description={enabled ? 'On for this server.' : 'Off by default.'}
                        defaultChecked={saved.enabled}
                        readOnly={!canChange}
                        onChange={(e) => setEnabled(e.currentTarget.checked)}
                    />

                    {enabled && (
                        <>
                            <div css={tw`mt-5`}>
                                <Label htmlFor={'auto-sleep-minutes'}>Sleep after nobody has been online for</Label>
                                <Select
                                    id={'auto-sleep-minutes'}
                                    value={minutes}
                                    disabled={!canChange}
                                    onChange={(e) => setMinutes(parseInt(e.currentTarget.value, 10))}
                                >
                                    {saved.choices.map((choice) => (
                                        <option key={choice} value={choice}>
                                            {minutesLabel(choice)}
                                        </option>
                                    ))}
                                </Select>
                            </div>

                            <div css={tw`mt-5`}>
                                <Switch
                                    key={`wake-${saved.wakeOnJoin}`}
                                    name={'auto-sleep-wake'}
                                    label={'Wake it up when a player tries to join'}
                                    description={
                                        saved.wakeAvailable
                                            ? 'The player is told to try again in a minute while the server starts.'
                                            : 'This needs a domain for the server (see Domains) and the Minecraft router. Without one the server has to be started from the panel.'
                                    }
                                    defaultChecked={saved.wakeOnJoin}
                                    readOnly={!canChange}
                                    onChange={(e) => setWake(e.currentTarget.checked)}
                                />
                            </div>

                            <p css={tw`text-xs text-neutral-400 mt-5`}>
                                Players are counted by asking the server, the way the server list of the game does, so
                                it works for Java servers without a plugin. A server that does not answer is never put
                                to sleep.
                            </p>
                        </>
                    )}

                    {canChange && (
                        <div css={tw`mt-6 text-right`}>
                            <Button disabled={!dirty || saving} onClick={save}>
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </TitledGreyBox>
    );
};
