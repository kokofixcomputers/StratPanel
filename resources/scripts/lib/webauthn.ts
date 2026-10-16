/**
 * The browser's side of passkeys (WebAuthn). The panel talks JSON, the browser wants binary: this turns the one into the other.
 * Binary values travel as base64url, like the WebAuthn JSON format.
 */

export const base64urlToBuffer = (text: string): ArrayBuffer => {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return bytes.buffer;
};

export const bufferToBase64url = (buffer: ArrayBuffer | ArrayBufferView): string => {
    const bytes =
        buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer)
            : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const isPasskeySupported = (): boolean =>
    typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

interface JsonDescriptor {
    id: string;
    type: string;
    transports?: string[];
}

type JsonOptions = Record<string, any> & { challenge: string };

const descriptors = (list?: JsonDescriptor[]) =>
    (list || []).map(
        (item) => ({ ...item, id: base64urlToBuffer(item.id) } as unknown as PublicKeyCredentialDescriptor)
    );

/** The options of the panel for adding a passkey, as navigator.credentials.create() wants them. */
export const toCreationOptions = (json: JsonOptions): PublicKeyCredentialCreationOptions =>
    ({
        ...json,
        challenge: base64urlToBuffer(json.challenge),
        user: { ...json.user, id: base64urlToBuffer(json.user.id) },
        excludeCredentials: descriptors(json.excludeCredentials),
    } as unknown as PublicKeyCredentialCreationOptions);

/** The options of the panel for signing in, as navigator.credentials.get() wants them. */
export const toRequestOptions = (json: JsonOptions): PublicKeyCredentialRequestOptions =>
    ({
        ...json,
        challenge: base64urlToBuffer(json.challenge),
        allowCredentials: descriptors(json.allowCredentials),
    } as unknown as PublicKeyCredentialRequestOptions);

/** What the browser made, as the JSON the panel checks. */
export const credentialToJson = (credential: PublicKeyCredential): Record<string, unknown> => {
    const response = credential.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
    const base = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
    };

    if (response.attestationObject) {
        return {
            ...base,
            response: {
                clientDataJSON: bufferToBase64url(response.clientDataJSON),
                attestationObject: bufferToBase64url(response.attestationObject),
                transports: response.getTransports ? response.getTransports() : [],
            },
        };
    }

    return {
        ...base,
        response: {
            clientDataJSON: bufferToBase64url(response.clientDataJSON),
            authenticatorData: bufferToBase64url(response.authenticatorData),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
        },
    };
};

/** A sentence for what went wrong in the browser's dialog, the browser's own messages are not for people. */
export const passkeyErrorMessage = (error: unknown): string => {
    const name = (error as { name?: string } | undefined)?.name;
    switch (name) {
        case 'NotAllowedError':
            return 'The passkey was cancelled, or it took too long.';
        case 'InvalidStateError':
            return 'This device has a passkey for this account already.';
        case 'NotSupportedError':
        case 'SecurityError':
            return 'Passkeys do not work here. They need an https address and a browser or device that supports them.';
        case 'AbortError':
            return 'The passkey request was stopped.';
        default:
            return 'The passkey could not be used.';
    }
};

export const createPasskey = async (options: JsonOptions): Promise<Record<string, unknown>> => {
    const credential = (await navigator.credentials.create({
        publicKey: toCreationOptions(options),
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('No passkey was made.');

    return credentialToJson(credential);
};

export const getPasskey = async (options: JsonOptions): Promise<Record<string, unknown>> => {
    const credential = (await navigator.credentials.get({
        publicKey: toRequestOptions(options),
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('No passkey was chosen.');

    return credentialToJson(credential);
};
