import {
    base64urlToBuffer,
    bufferToBase64url,
    credentialToJson,
    passkeyErrorMessage,
    toCreationOptions,
    toRequestOptions,
} from '@/lib/webauthn';

const bytes = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer));

describe('lib/webauthn', () => {
    it('turns base64url into bytes and back', () => {
        const raw = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
        const text = bufferToBase64url(raw);

        expect(text).not.toMatch(/[+/=]/);
        expect(bytes(base64urlToBuffer(text))).toEqual(Array.from(raw));
    });

    it('handles every length of padding', () => {
        for (let length = 0; length < 12; length++) {
            const raw = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
            expect(bytes(base64urlToBuffer(bufferToBase64url(raw)))).toEqual(Array.from(raw));
        }
    });

    it('reads a typed array that is a view on a bigger buffer', () => {
        const big = Uint8Array.from([9, 9, 1, 2, 3, 9, 9]);
        expect(bytes(base64urlToBuffer(bufferToBase64url(big.subarray(2, 5))))).toEqual([1, 2, 3]);
    });

    it('prepares the options for adding a passkey', () => {
        const options = toCreationOptions({
            challenge: bufferToBase64url(Uint8Array.from([1, 2, 3])),
            rp: { id: 'panel.test', name: 'Panel' },
            user: { id: bufferToBase64url(Uint8Array.from([4, 5])), name: 'a', displayName: 'a' },
            excludeCredentials: [
                { id: bufferToBase64url(Uint8Array.from([6])), type: 'public-key', transports: ['usb'] },
            ],
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        });

        expect(bytes(options.challenge as ArrayBuffer)).toEqual([1, 2, 3]);
        expect(bytes(options.user.id as ArrayBuffer)).toEqual([4, 5]);
        expect(bytes(options.excludeCredentials![0].id as ArrayBuffer)).toEqual([6]);
        expect(options.excludeCredentials![0].transports).toEqual(['usb']);
        expect(options.rp.id).toBe('panel.test');
        expect(options.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
    });

    it('prepares the options for signing in, with or without a list of keys', () => {
        const challenge = bufferToBase64url(Uint8Array.from([7, 8]));

        const open = toRequestOptions({ challenge, rpId: 'panel.test', userVerification: 'required' });
        expect(bytes(open.challenge as ArrayBuffer)).toEqual([7, 8]);
        expect(open.allowCredentials).toEqual([]);

        const listed = toRequestOptions({
            challenge,
            allowCredentials: [{ id: bufferToBase64url(Uint8Array.from([1])), type: 'public-key' }],
        });
        expect(bytes(listed.allowCredentials![0].id as ArrayBuffer)).toEqual([1]);
    });

    const buffer = (...values: number[]) => Uint8Array.from(values).buffer;

    it('sends a new passkey as JSON', () => {
        const json = credentialToJson({
            id: 'abc',
            type: 'public-key',
            rawId: buffer(1, 2),
            getClientExtensionResults: () => ({}),
            response: {
                clientDataJSON: buffer(3),
                attestationObject: buffer(4),
                getTransports: () => ['internal'],
            },
        } as unknown as PublicKeyCredential);

        expect(json).toEqual({
            id: 'abc',
            rawId: bufferToBase64url(buffer(1, 2)),
            type: 'public-key',
            clientExtensionResults: {},
            response: {
                clientDataJSON: bufferToBase64url(buffer(3)),
                attestationObject: bufferToBase64url(buffer(4)),
                transports: ['internal'],
            },
        });
    });

    it('sends a sign in as JSON, with or without the user handle', () => {
        const make = (userHandle: ArrayBuffer | null) =>
            credentialToJson({
                id: 'abc',
                type: 'public-key',
                rawId: buffer(1),
                getClientExtensionResults: () => ({}),
                response: { clientDataJSON: buffer(2), authenticatorData: buffer(3), signature: buffer(4), userHandle },
            } as unknown as PublicKeyCredential) as { response: Record<string, unknown> };

        expect(make(buffer(5)).response).toEqual({
            clientDataJSON: bufferToBase64url(buffer(2)),
            authenticatorData: bufferToBase64url(buffer(3)),
            signature: bufferToBase64url(buffer(4)),
            userHandle: bufferToBase64url(buffer(5)),
        });
        expect(make(null).response.userHandle).toBeNull();
    });

    it('has a sentence for what the browser throws', () => {
        expect(passkeyErrorMessage({ name: 'NotAllowedError' })).toContain('cancelled');
        expect(passkeyErrorMessage({ name: 'InvalidStateError' })).toContain('already');
        expect(passkeyErrorMessage({ name: 'SecurityError' })).toContain('https');
        expect(passkeyErrorMessage(new Error('internal details'))).toBe('The passkey could not be used.');
        expect(passkeyErrorMessage(undefined)).toBe('The passkey could not be used.');
    });
});
