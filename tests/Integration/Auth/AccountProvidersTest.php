<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Models\UserIdentity;
use Illuminate\Support\Facades\Hash;

class AccountProvidersTest extends AuthTestCase
{
    private const URL = '/api/client/account/providers';

    private function provider(string $key = 'github', array $attributes = []): AuthProvider
    {
        return AuthProvider::query()->create(array_merge([
            'key' => $key, 'type' => $key, 'name' => ucfirst($key), 'client_id' => 'id', 'client_secret' => 'secret', 'enabled' => true, 'allow_signup' => true,
        ], $attributes));
    }

    private function link($user, AuthProvider $provider, string $id = '1'): UserIdentity
    {
        return UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => $id, 'display_name' => 'octo']);
    }

    public function testTheListShowsWhatCanBeLinkedAndWhatIs(): void
    {
        $user = $this->makeUser();
        $github = $this->provider('github');
        $this->provider('discord');
        $this->provider('google', ['enabled' => false]);
        $this->link($user, $github);

        $response = $this->actingAs($user)->getJson(self::URL)->assertOk()->assertJsonPath('password_set', true);

        $rows = collect($response->json('data'))->keyBy('key');
        $this->assertSame(['github', 'discord'], $rows->keys()->all());
        $this->assertTrue($rows['github']['linked']);
        $this->assertSame('octo', $rows['github']['account']);
        $this->assertFalse($rows['discord']['linked']);
        $this->assertStringNotContainsString('secret', $response->getContent());
    }

    public function testAServiceThatWasSwitchedOffCanStillBeUnlinked(): void
    {
        $user = $this->makeUser();
        $this->link($user, $this->provider('google', ['enabled' => false]));

        $this->actingAs($user)->getJson(self::URL)->assertJsonPath('data.0.key', 'google')->assertJsonPath('data.0.enabled', false);
    }

    public function testUnlinking(): void
    {
        $user = $this->makeUser();
        $this->link($user, $this->provider('github'));

        $this->actingAs($user)->deleteJson(self::URL . '/github')->assertNoContent();

        $this->assertSame(0, $user->identities()->count());
    }

    public function testUnlinkingSomethingThatIsNotLinkedIsFine(): void
    {
        $this->actingAs($this->makeUser())->deleteJson(self::URL . '/github')->assertNoContent();
    }

    public function testNobodyUnlinksTheAccountOfAnother(): void
    {
        $owner = $this->makeUser();
        $this->link($owner, $this->provider('github'));

        $this->actingAs($this->makeUser())->deleteJson(self::URL . '/github')->assertNoContent();

        $this->assertSame(1, $owner->identities()->count());
    }

    public function testTheOnlyWayInStays(): void
    {
        $user = $this->makeUser(['password_set' => false]);
        $github = $this->provider('github');
        $this->link($user, $github);

        $this->actingAs($user)->deleteJson(self::URL . '/github')->assertStatus(400);
        $this->assertSame(1, $user->identities()->count());

        $this->link($user, $this->provider('discord'), '2');
        $this->actingAs($user)->deleteJson(self::URL . '/github')->assertNoContent();
    }

    public function testChoosingAPasswordMakesUnlinkingPossible(): void
    {
        $user = $this->makeUser(['password_set' => false]);
        $this->link($user, $this->provider('github'));

        // Somebody who signed up with a service has no password to give, so changing it does not ask for the old one.
        $this->actingAs($user)->putJson('/api/client/account/password', ['password' => 'a-brand-new-password', 'password_confirmation' => 'a-brand-new-password'])
            ->assertNoContent();

        $user->refresh();
        $this->assertTrue($user->password_set);
        $this->assertTrue(Hash::check('a-brand-new-password', $user->password));
        $this->actingAs($user)->deleteJson(self::URL . '/github')->assertNoContent();
    }

    public function testAnAccountWithAPasswordStillNeedsTheCurrentOneToChangeIt(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->putJson('/api/client/account/password', [
            'current_password' => 'wrong', 'password' => 'a-brand-new-password', 'password_confirmation' => 'a-brand-new-password',
        ])->assertStatus(400);
        $this->assertFalse(Hash::check('a-brand-new-password', $user->fresh()->password));

        $this->actingAs($user)->putJson('/api/client/account/password', [
            'password' => 'a-brand-new-password', 'password_confirmation' => 'a-brand-new-password',
        ])->assertStatus(400);
    }

    public function testNobodyWhoIsSignedOutSeesAnything(): void
    {
        $this->getJson(self::URL)->assertUnauthorized();
        $this->deleteJson(self::URL . '/github')->assertUnauthorized();
    }
}
