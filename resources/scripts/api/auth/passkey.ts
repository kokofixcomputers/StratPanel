import http from '@/api/http';
import { getPasskey } from '@/lib/webauthn';

/** Signs in with a passkey: asks the panel for a challenge, lets the device answer it, and sends the answer back. */
export default async (): Promise<string> => {
    await http.get('/sanctum/csrf-cookie');
    const { data: options } = await http.post('/auth/passkey/options');
    const credential = await getPasskey(options);
    const { data } = await http.post('/auth/passkey/login', { credential });

    return data?.data?.intended || '/';
};
