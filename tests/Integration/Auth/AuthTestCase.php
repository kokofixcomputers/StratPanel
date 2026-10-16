<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\User;
use Pterodactyl\Models\AuthProvider;
use Illuminate\Support\Facades\Hash;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

/**
 * The tests of signing in, up and linking share one database, so what they create is found by the address its email ends in and
 * removed before and after every test.
 */
abstract class AuthTestCase extends IntegrationTestCase
{
    protected const DOMAIN = 'auth-test.example';

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        config(['auth.captcha.provider' => 'none', 'auth.registration.enabled' => false, 'auth.registration.password' => true, 'auth.passkeys.enabled' => true]);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        User::query()->where('email', 'like', '%@' . self::DOMAIN)->delete();
        AuthProvider::query()->delete();
        \DB::table('settings')->where('key', 'like', 'settings::auth:%')->orWhere('key', 'like', 'settings::recaptcha:%')->delete();
    }

    /** Forgets who is signed in, as a visitor who closed the browser. */
    protected function signOut(): void
    {
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->flushSession();
    }

    protected function makeUser(array $attributes = []): User
    {
        $name = $attributes['username'] ?? 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(array_merge([
            'username' => $name,
            'email' => $name . '@' . self::DOMAIN,
            'password' => Hash::make('correct-horse-battery'),
        ], $attributes));
    }
}
