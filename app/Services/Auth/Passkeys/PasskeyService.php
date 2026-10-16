<?php

namespace Pterodactyl\Services\Auth\Passkeys;

use Illuminate\Support\Str;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\UserPasskey;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialCreationOptions;
use Symfony\Component\Serializer\Encoder\JsonEncode;
use Symfony\Component\Serializer\SerializerInterface;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer;

/**
 * Passkeys (WebAuthn): signing in with a fingerprint, a face or a security key instead of a password. The browser makes a key pair
 * for this site, the panel keeps the public key and checks that every sign in is signed with the private one. The checking of the
 * signatures is the web-auth/webauthn-lib library, this is the glue: where the challenge is kept, what is stored.
 *
 * A challenge is used once and good for five minutes. The one for signing in is kept in the session of the visitor, the one for adding
 * a passkey in the cache under the user (the API the browser adds passkeys through is not given a session).
 */
class PasskeyService
{
    /** The challenge of adding a passkey is kept per user: the client API has no session of its own. */
    private const REGISTRATION = 'passkey:registration:';

    private const LOGIN = 'passkey.login';

    private const LIFETIME_SECONDS = 300;

    /** ES256, EdDSA and RS256: what phones, computers and security keys sign with. */
    private const ALGORITHMS = [-7, -8, -257];

    private ?SerializerInterface $serializer = null;

    private function serializer(): SerializerInterface
    {
        if ($this->serializer === null) {
            $this->serializer = (new WebauthnSerializerFactory(
                AttestationStatementSupportManager::create([new NoneAttestationStatementSupport()])
            ))->create();
        }

        return $this->serializer;
    }

    private function ceremonies(): CeremonyStepManagerFactory
    {
        $factory = new CeremonyStepManagerFactory();
        // Browsers accept a plain http address for localhost only, the library has to know that too.
        $factory->setSecuredRelyingPartyId(['localhost']);

        return $factory;
    }

    private function json(object $value): string
    {
        return $this->serializer()->serialize($value, 'json', [
            AbstractObjectNormalizer::SKIP_NULL_VALUES => true,
            JsonEncode::OPTIONS => JSON_THROW_ON_ERROR,
        ]);
    }

    /** The options for adding a passkey to the account of a user, for navigator.credentials.create(). */
    public function registrationOptions(Request $request, User $user): array
    {
        $options = PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create((string) config('app.name', 'Panel'), $request->getHost()),
            PublicKeyCredentialUserEntity::create($user->username, $user->uuid, $user->username),
            random_bytes(32),
            array_map(fn (int $algorithm) => PublicKeyCredentialParameters::create('public-key', $algorithm), self::ALGORITHMS),
            AuthenticatorSelectionCriteria::create(
                userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
                residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
            ),
            PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
            // Passkeys the user has already are refused, one device gets one.
            $user->passkeys->map(fn (UserPasskey $key) => $this->descriptor($key))->filter()->values()->all(),
            60000,
        );

        $json = $this->json($options);
        Cache::put(self::REGISTRATION . $user->id, ['options' => $json, 'expires' => time() + self::LIFETIME_SECONDS], self::LIFETIME_SECONDS);

        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Checks what the device made and keeps the public key.
     *
     * @throws PasskeyException
     */
    public function register(Request $request, User $user, string $name, array $credential): UserPasskey
    {
        $pending = Cache::pull(self::REGISTRATION . $user->id);
        if (!is_array($pending) || ($pending['expires'] ?? 0) < time()) {
            throw new PasskeyException('The request expired. Start again.');
        }

        try {
            $options = $this->serializer()->deserialize($pending['options'], PublicKeyCredentialCreationOptions::class, 'json');
            $public = $this->serializer()->deserialize(json_encode($credential, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            if (!$public->response instanceof AuthenticatorAttestationResponse) {
                throw new PasskeyException('That is not a new passkey.');
            }

            $record = AuthenticatorAttestationResponseValidator::create($this->ceremonies()->creationCeremony())
                ->check($public->response, $options, $request->getHost());
        } catch (PasskeyException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new PasskeyException('The passkey could not be checked. Try again.');
        }

        $id = $this->encode($record->publicKeyCredentialId);
        if (UserPasskey::query()->where('credential_id', $id)->exists()) {
            throw new PasskeyException('This passkey is added already.');
        }

        $passkey = $user->passkeys()->create([
            'name' => Str::limit(trim($name) !== '' ? trim($name) : 'Passkey', 100, ''),
            'credential_id' => $id,
            'record' => $this->json($record),
        ]);

        Activity::event('user:account.passkey-added')->subject($user)->property(['name' => $passkey->name])->log();

        return $passkey;
    }

    /** The options for signing in, for navigator.credentials.get(). It is not known yet who is signing in: the device says. */
    public function loginOptions(Request $request): array
    {
        $options = PublicKeyCredentialRequestOptions::create(
            random_bytes(32),
            $request->getHost(),
            [],
            PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED,
            60000,
        );

        $json = $this->json($options);
        $request->session()->put(self::LOGIN, ['options' => $json, 'expires' => time() + self::LIFETIME_SECONDS]);

        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Checks the signature and returns the user it belongs to.
     *
     * @throws PasskeyException
     */
    public function login(Request $request, array $credential): User
    {
        $pending = $request->session()->pull(self::LOGIN);
        if (!is_array($pending) || ($pending['expires'] ?? 0) < time()) {
            throw new PasskeyException('The request expired. Try again.');
        }

        try {
            $options = $this->serializer()->deserialize($pending['options'], PublicKeyCredentialRequestOptions::class, 'json');
            $public = $this->serializer()->deserialize(json_encode($credential, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            if (!$public->response instanceof AuthenticatorAssertionResponse) {
                throw new PasskeyException('That is not a sign in.');
            }

            /** @var UserPasskey|null $passkey */
            $passkey = UserPasskey::query()->with('user')->where('credential_id', $this->encode($public->rawId))->first();
            if ($passkey === null || $passkey->user === null) {
                throw new PasskeyException('This passkey is not known here.');
            }

            $record = $this->serializer()->deserialize($passkey->record, CredentialRecord::class, 'json');
            $updated = AuthenticatorAssertionResponseValidator::create($this->ceremonies()->requestCeremony())
                ->check($record, $public->response, $options, $request->getHost(), $passkey->user->uuid);
        } catch (PasskeyException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw new PasskeyException('The passkey was not accepted.');
        }

        // The counter of the device moved on.
        $passkey->forceFill(['record' => $this->json($updated), 'last_used_at' => now()])->save();

        return $passkey->user;
    }

    private function descriptor(UserPasskey $key): ?PublicKeyCredentialDescriptor
    {
        try {
            $record = $this->serializer()->deserialize($key->record, CredentialRecord::class, 'json');

            return $record->getPublicKeyCredentialDescriptor();
        } catch (\Throwable) {
            return null;
        }
    }

    private function encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
