import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { useUserSWRKey } from '@/plugins/useSWRKey';

export interface MinecraftAccount {
    // Whether the panel lets people link their Minecraft account.
    enabled: boolean;
    // How long a code can be used.
    minutes: number;
    linked: boolean;
    username: string | null;
    uuid: string | null;
    // The head of the skin.
    avatar: string | null;
    // The address to join in Minecraft to get a code, when the admin said what it is.
    join: string;
}

const fromApi = (data: any): MinecraftAccount => ({
    enabled: !!data.enabled,
    minutes: data.minutes ?? 15,
    linked: !!data.linked,
    username: data.username ?? null,
    uuid: data.uuid ?? null,
    avatar: data.avatar ?? null,
    join: data.join || '',
});

export const useMinecraftAccount = (config?: ConfigInterface<MinecraftAccount, AxiosError>) =>
    useSWR<MinecraftAccount, AxiosError>(
        useUserSWRKey(['account', 'minecraft']),
        async () => fromApi((await http.get('/api/client/account/minecraft')).data),
        { revalidateOnFocus: false, ...(config || {}) }
    );

/** Links the Minecraft account behind a code the router showed on the disconnect screen. */
export const linkMinecraft = async (code: string): Promise<MinecraftAccount> =>
    fromApi((await http.post('/api/client/account/minecraft', { code })).data);

export const unlinkMinecraft = async (): Promise<MinecraftAccount> =>
    fromApi((await http.delete('/api/client/account/minecraft')).data);

export interface MinecraftLookup {
    found: boolean;
    username: string | null;
    avatar: string | null;
}

/** Whether somebody linked this Minecraft name (for inviting a subuser by it), with their head. */
export const lookupMinecraft = async (username: string): Promise<MinecraftLookup> => {
    const { data } = await http.get('/api/client/minecraft/lookup', { params: { username } });

    return { found: !!data.found, username: data.username ?? null, avatar: data.avatar ?? null };
};
