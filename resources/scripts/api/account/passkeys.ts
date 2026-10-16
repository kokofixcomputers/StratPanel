import useSWR, { ConfigInterface } from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { createPasskey } from '@/lib/webauthn';
import { useUserSWRKey } from '@/plugins/useSWRKey';

export interface Passkey {
    id: number;
    name: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}

export interface PasskeyList {
    // Whether an admin allows passkeys at all.
    enabled: boolean;
    passkeys: Passkey[];
}

const toPasskey = (data: any): Passkey => ({
    id: data.id,
    name: data.name,
    createdAt: new Date(data.created_at),
    lastUsedAt: data.last_used_at ? new Date(data.last_used_at) : null,
});

const usePasskeys = (config?: ConfigInterface<PasskeyList, AxiosError>) => {
    const key = useUserSWRKey(['account', 'passkeys']);

    return useSWR<PasskeyList, AxiosError>(
        key,
        async () => {
            const { data } = await http.get('/api/client/account/passkeys');

            return { enabled: !!data.enabled, passkeys: (data.data as any[]).map(toPasskey) };
        },
        { revalidateOnMount: true, revalidateOnFocus: false, ...(config || {}) }
    );
};

/** Asks the device to make a passkey and keeps it under the given name. */
const addPasskey = async (name: string): Promise<Passkey> => {
    const { data: options } = await http.post('/api/client/account/passkeys/options');
    const credential = await createPasskey(options);
    const { data } = await http.post('/api/client/account/passkeys', { name, credential });

    return toPasskey(data);
};

const removePasskey = async (id: number): Promise<void> => {
    await http.delete(`/api/client/account/passkeys/${id}`);
};

export { usePasskeys, addPasskey, removePasskey };
