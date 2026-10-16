<?php

namespace Pterodactyl\Tests\Integration\Roles;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Hash;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

/**
 * The tests of roles share one database: what they create is found by the address its email ends in and removed before and after.
 */
abstract class RoleTestCase extends IntegrationTestCase
{
    protected const DOMAIN = 'roles-test.example';

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        $ids = User::query()->where('email', 'like', '%@' . self::DOMAIN)->pluck('id');
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();
        Role::query()->delete();
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

    protected function rootAdmin(): User
    {
        return $this->makeUser(['root_admin' => true]);
    }

    /** A role with these permissions. */
    protected function role(array $permissions, ?string $name = null): Role
    {
        return Role::query()->create([
            'name' => $name ?? 'role-' . bin2hex(random_bytes(3)),
            'permissions' => $permissions,
            'color' => '#3b82f6',
        ]);
    }

    /** A user who has a role with these permissions. */
    protected function userWith(array $permissions, array $attributes = []): User
    {
        $user = $this->makeUser($attributes);
        $user->roles()->attach($this->role($permissions)->id);

        return $user->fresh();
    }

    protected function page(string $uri)
    {
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        return $this->get($uri);
    }
}
