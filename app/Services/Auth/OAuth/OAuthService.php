<?php

namespace Pterodactyl\Services\Auth\OAuth;

use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\AuthProvider;
use Illuminate\Auth\AuthManager;
use Illuminate\Support\Facades\Event;
use Pterodactyl\Models\UserIdentity;
use Pterodactyl\Events\Auth\DirectLogin;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Services\Auth\SelfRegistrationService;

/**
 * Signing in, signing up and linking with another service. The browser is sent to the service with a state that only this session
 * knows; what comes back is accepted once, within ten minutes, and only for the service and the purpose it was asked for.
 *
 * An account is never found by email address. Services differ in how well they check addresses, and an address that "matches" is no
 * proof that it is the same person. Linking is something a person who is signed in does on purpose.
 */
class OAuthService
{
    public const LOGIN = 'login';

    public const LINK = 'link';

    private const SESSION = 'oauth';

    private const LIFETIME_MINUTES = 10;

    public function __construct(
        private OAuthClient $client,
        private AuthSettings $settings,
        private SelfRegistrationService $registration,
        private AuthManager $auth,
    ) {
    }

    public function find(string $key): ?AuthProvider
    {
        return AuthProvider::query()->where('key', $key)->where('enabled', true)->first();
    }

    public function callbackUrl(AuthProvider $provider): string
    {
        return url('/auth/oauth/' . $provider->key . '/callback');
    }

    /** Remembers what this sign in is for and returns where to send the browser. */
    public function begin(Request $request, AuthProvider $provider, string $mode): string
    {
        $state = Str::random(40);
        $request->session()->put(self::SESSION, [
            'state' => $state,
            'provider' => $provider->key,
            'mode' => $mode,
            'user' => $mode === self::LINK ? $request->user()?->id : null,
            'expires' => CarbonImmutable::now()->addMinutes(self::LIFETIME_MINUTES)->getTimestamp(),
        ]);

        return $this->client->authorizeUrl($provider, $state, $this->callbackUrl($provider));
    }

    /**
     * What came back from the service.
     *
     * @return array{type: string, mode: string, user?: User, token?: string, error?: string}
     *     type is "login" (signed in), "checkpoint" (the password is not needed but the two-factor code is), "linked" or "error"
     */
    public function finish(Request $request, AuthProvider $provider): array
    {
        $pending = $request->session()->pull(self::SESSION);
        $mode = is_array($pending) ? (string) ($pending['mode'] ?? self::LOGIN) : self::LOGIN;

        try {
            if (
                !is_array($pending)
                || ($pending['provider'] ?? null) !== $provider->key
                || ($pending['expires'] ?? 0) < time()
                || !is_string($request->query('state'))
                || !hash_equals((string) ($pending['state'] ?? ''), (string) $request->query('state'))
            ) {
                throw new OAuthException('state', 'The sign in expired or was not started here.');
            }
            if ($request->query('error') !== null) {
                throw new OAuthException($request->query('error') === 'access_denied' ? 'denied' : 'provider', 'The service refused.');
            }
            $code = $request->query('code');
            if (!is_string($code) || $code === '' || strlen($code) > 2048) {
                throw new OAuthException('provider', 'The service sent no code.');
            }

            $profile = $this->client->profile($provider, $code, $this->callbackUrl($provider));

            if ($mode === self::LINK) {
                $user = $request->user();
                if ($user === null || (int) ($pending['user'] ?? 0) !== $user->id) {
                    throw new OAuthException('state', 'The sign in belongs to another session.');
                }
                $this->link($user, $provider, $profile);

                return ['type' => 'linked', 'mode' => $mode, 'user' => $user];
            }

            $user = $this->resolve($provider, $profile);

            return $this->signIn($request, $user) + ['mode' => $mode];
        } catch (OAuthException $exception) {
            return ['type' => 'error', 'mode' => $mode, 'error' => $exception->reason];
        }
    }

    /** The user of an account at a service: the one it is linked to, or a new one when signing up is allowed. */
    private function resolve(AuthProvider $provider, OAuthProfile $profile): User
    {
        $identity = UserIdentity::query()
            ->where('auth_provider_id', $provider->id)
            ->where('provider_user_id', $profile->id)
            ->first();

        if ($identity !== null) {
            $identity->forceFill(['last_used_at' => now(), 'email' => $profile->email ?? $identity->email])->save();

            return $identity->user;
        }

        if (!$this->settings->providerRegistration($provider)) {
            throw new OAuthException('not_linked', 'No account is linked to this one.');
        }
        if ($profile->email === null || $profile->emailVerified === false) {
            throw new OAuthException('no_email', 'The service gave no checked email address.');
        }
        if (User::query()->where('email', $profile->email)->exists()) {
            throw new OAuthException('email_taken', 'An account with this address exists already.');
        }

        try {
            $user = $this->registration->create(
                $this->registration->usernameFor($profile->username, $profile->email),
                $profile->email,
                null,
                $profile->name,
                $provider->key,
            );
        } catch (\Throwable) {
            throw new OAuthException('signup_failed', 'The account could not be created.');
        }

        $this->remember($user, $provider, $profile);

        return $user;
    }

    /** @throws OAuthException */
    private function link(User $user, AuthProvider $provider, OAuthProfile $profile): void
    {
        $existing = UserIdentity::query()
            ->where('auth_provider_id', $provider->id)
            ->where('provider_user_id', $profile->id)
            ->first();
        if ($existing !== null) {
            throw new OAuthException($existing->user_id === $user->id ? 'already_yours' : 'linked_elsewhere', 'Linked already.');
        }
        if ($user->identities()->where('auth_provider_id', $provider->id)->exists()) {
            throw new OAuthException('has_account', 'This account has another account at this service.');
        }

        $this->remember($user, $provider, $profile);

        Activity::event('user:account.provider-linked')
            ->actor($user)
            ->subject($user)
            ->property(['provider' => $provider->key])
            ->log();
    }

    private function remember(User $user, AuthProvider $provider, OAuthProfile $profile): UserIdentity
    {
        return UserIdentity::query()->create([
            'user_id' => $user->id,
            'auth_provider_id' => $provider->id,
            'provider_user_id' => $profile->id,
            'email' => $profile->email,
            'display_name' => Str::limit((string) ($profile->name ?: $profile->username ?: $profile->email), 180, ''),
            'last_used_at' => now(),
        ]);
    }

    /**
     * Signs the user in, or hands over to the two-factor step like a password does.
     *
     * @return array{type: string, user: User, token?: string}
     */
    private function signIn(Request $request, User $user): array
    {
        if ($user->use_totp) {
            $request->session()->put('auth_confirmation_token', [
                'user_id' => $user->id,
                'token_value' => $token = Str::random(64),
                'expires_at' => CarbonImmutable::now()->addMinutes(5),
            ]);
            Activity::event('auth:checkpoint')->withRequestMetadata()->subject($user)->log();

            return ['type' => 'checkpoint', 'user' => $user, 'token' => $token];
        }

        $request->session()->regenerate();
        $this->auth->guard()->login($user, true);
        Event::dispatch(new DirectLogin($user, true));

        return ['type' => 'login', 'user' => $user];
    }
}
