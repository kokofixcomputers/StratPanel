import http from '@/api/http';

export interface AutoSleepSettings {
    enabled: boolean;
    idleMinutes: number;
    wakeOnJoin: boolean;
    // Stopped by auto sleep because nobody was online, and not started since.
    sleeping: boolean;
    // Since when nobody has been online, null while somebody is or while the panel cannot tell.
    idleSince: Date | null;
    sleptAt: Date | null;
    // Whether a player can start it by trying to join: the server needs a domain on the router.
    wakeAvailable: boolean;
    // The times that can be chosen, in minutes.
    choices: number[];
}

export const rawDataToAutoSleep = (data: any): AutoSleepSettings => ({
    enabled: !!data.enabled,
    idleMinutes: data.idle_minutes,
    wakeOnJoin: !!data.wake_on_join,
    sleeping: !!data.sleeping,
    idleSince: data.idle_since ? new Date(data.idle_since) : null,
    sleptAt: data.slept_at ? new Date(data.slept_at) : null,
    wakeAvailable: !!data.wake_available,
    choices: Array.isArray(data.choices) ? data.choices : [15],
});

export const getAutoSleep = (uuid: string): Promise<AutoSleepSettings> =>
    http.get(`/api/client/servers/${uuid}/settings/auto-sleep`).then(({ data }) => rawDataToAutoSleep(data));

export const updateAutoSleep = (
    uuid: string,
    settings: { enabled: boolean; idleMinutes: number; wakeOnJoin: boolean }
): Promise<AutoSleepSettings> =>
    http
        .put(`/api/client/servers/${uuid}/settings/auto-sleep`, {
            enabled: settings.enabled,
            idle_minutes: settings.idleMinutes,
            wake_on_join: settings.wakeOnJoin,
        })
        .then(({ data }) => rawDataToAutoSleep(data));
