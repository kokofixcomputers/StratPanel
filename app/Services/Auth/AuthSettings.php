<?php

namespace Pterodactyl\Services\Auth;

use Pterodactyl\Models\AuthProvider;
use Illuminate\Database\Eloquent\Collection;

/**
 * What an admin decided about signing in and signing up, in one place.
 */
class AuthSettings
{
    /** Whether people without an account may create one. Off until an admin turns it on. */
    public function registrationEnabled(): bool
    {
        return (bool) config('auth.registration.enabled', false);
    }

    /** Whether people can add passkeys and sign in with them. On unless an admin turns it off. */
    public function passkeysEnabled(): bool
    {
        return (bool) config('auth.passkeys.enabled', true);
    }

    /** Whether the sign up form (username, email and password) works. */
    public function passwordRegistration(): bool
    {
        return $this->registrationEnabled() && (bool) config('auth.registration.password', true);
    }

    /** Whether a new account can be made with this service. */
    public function providerRegistration(AuthProvider $provider): bool
    {
        return $this->registrationEnabled() && $provider->enabled && $provider->allow_signup;
    }

    /** @return Collection<int, AuthProvider> the services that are on, in the order they were set up */
    public function providers(): Collection
    {
        try {
            return AuthProvider::query()->where('enabled', true)->orderBy('id')->get();
        } catch (\Throwable) {
            // Before the migration has run there is nothing to sign in with, and no reason to break the page.
            return new Collection();
        }
    }

    /**
     * What the pages of the browser need to know, nothing secret.
     *
     * @return array{registration: bool, passwordRegistration: bool, passkeys: bool, providers: list<array{key: string, name: string, type: string, signup: bool}>}
     */
    public function forBrowser(): array
    {
        return [
            'registration' => $this->passwordRegistration() || $this->providers()->contains(fn (AuthProvider $p) => $this->providerRegistration($p)),
            'passwordRegistration' => $this->passwordRegistration(),
            'passkeys' => $this->passkeysEnabled(),
            'providers' => $this->providers()->map(fn (AuthProvider $p) => [
                'key' => $p->key,
                'name' => $p->name,
                'type' => $p->type,
                'signup' => $this->providerRegistration($p),
            ])->values()->all(),
        ];
    }
}
