<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

class RegistrationTest extends AuthTestCase
{
    private function signUp(array $data = [])
    {
        return $this->postJson('/auth/register', array_merge([
            'username' => 'new.player',
            'email' => 'new.player@auth-test.example',
            'password' => 'a-good-password',
            'password_confirmation' => 'a-good-password',
        ], $data));
    }

    public function testItIsOffUntilAnAdminTurnsItOn(): void
    {
        $this->signUp()->assertNotFound();
        $this->assertSame(0, User::query()->where('username', 'new.player')->count());
        $this->assertFalse(config('auth.registration.enabled'));
    }

    public function testItNeedsBothSwitches(): void
    {
        config(['auth.registration.enabled' => false, 'auth.registration.password' => true]);
        $this->signUp()->assertNotFound();

        config(['auth.registration.enabled' => true, 'auth.registration.password' => false]);
        $this->signUp()->assertNotFound();
    }

    public function testSomebodyCanSignUpAndIsSignedIn(): void
    {
        config(['auth.registration.enabled' => true]);
        Notification::fake();

        $this->signUp()->assertOk()->assertJsonPath('data.complete', true);

        $user = User::query()->where('username', 'new.player')->firstOrFail();
        $this->assertSame('new.player@auth-test.example', $user->email);
        $this->assertFalse($user->root_admin);
        $this->assertTrue($user->password_set);
        $this->assertTrue(Hash::check('a-good-password', $user->password));
        $this->assertAuthenticatedAs($user);
        // Nothing is mailed to an address that anybody can type in.
        Notification::assertNothingSent();
    }

    public function testTheFormIsValidated(): void
    {
        config(['auth.registration.enabled' => true]);

        $this->signUp(['password' => 'short', 'password_confirmation' => 'short'])->assertStatus(422);
        $this->signUp(['password_confirmation' => 'different'])->assertStatus(422);
        $this->signUp(['email' => 'not-an-email'])->assertStatus(422);
        $this->signUp(['username' => '-bad-'])->assertStatus(422);
        $this->signUp(['username' => 'has space'])->assertStatus(422);
        $this->signUp(['username' => ''])->assertStatus(422);
        $this->signUp(['password' => str_repeat('a', 300), 'password_confirmation' => str_repeat('a', 300)])->assertStatus(422);

        $this->assertSame(0, User::query()->where('email', 'new.player@auth-test.example')->count());
    }

    public function testNobodyTakesTheNameOrAddressOfAnother(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->makeUser(['username' => 'taken']);

        $this->signUp(['username' => 'taken'])->assertStatus(422);
        $this->signUp(['username' => 'TAKEN'])->assertStatus(422);
        $this->signUp(['email' => 'taken@auth-test.example'])->assertStatus(422);
    }

    public function testOnlyTheFieldsOfTheFormAreUsed(): void
    {
        config(['auth.registration.enabled' => true]);

        $this->signUp(['root_admin' => true, 'password_set' => false, 'use_totp' => true, 'uuid' => 'x'])->assertOk();

        $user = User::query()->where('username', 'new.player')->firstOrFail();
        $this->assertFalse($user->root_admin);
        $this->assertTrue($user->password_set);
        $this->assertFalse($user->use_totp);
        $this->assertNotSame('x', $user->uuid);
    }

    public function testTheBrowserKnowsWhetherThereIsASignUpPage(): void
    {
        $page = fn () => $this->get('/auth/login')->assertOk()->getContent();

        $this->assertStringContainsString('"registration":false', $page());

        config(['auth.registration.enabled' => true]);
        $this->assertStringContainsString('"registration":true', $page());
        $this->assertStringContainsString('"passwordRegistration":true', $page());

        config(['auth.registration.password' => false]);
        $this->assertStringContainsString('"registration":false', $page());
    }
}
