<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\UserPasskey;

class PasskeyTest extends AuthTestCase
{
    private const ADD = '/api/client/account/passkeys';

    /** Gets the challenge for adding a passkey. */
    private function challenge($user): array
    {
        return [$this->actingAs($user)->postJson(self::ADD . '/options')->assertOk()->json(), []];
    }

    private function add($user, VirtualAuthenticator $device, string $name = 'Laptop')
    {
        [$options, $session] = $this->challenge($user);

        return $this->actingAs($user)->withSession($session)->postJson(self::ADD, ['name' => $name, 'credential' => $device->create($options)]);
    }

    private function signInChallenge(): array
    {
        $options = $this->postJson('/auth/passkey/options')->assertOk()->json();

        return [$options, ['passkey.login' => session('passkey.login')]];
    }

    private function signIn(array $credential, array $session)
    {
        return $this->withSession($session)->postJson('/auth/passkey/login', ['credential' => $credential]);
    }

    // ---- adding ---------------------------------------------------------------------------------------------------------

    public function testTheChallengeAsksForAKeyThatCanBeFoundWithoutAUsername(): void
    {
        $user = $this->makeUser();

        $options = $this->actingAs($user)->postJson(self::ADD . '/options')->assertOk()->json();

        $this->assertSame('localhost', $options['rp']['id']);
        $this->assertSame($user->username, $options['user']['name']);
        $this->assertSame($user->uuid, VirtualAuthenticator::unb64($options['user']['id']));
        $this->assertSame('required', $options['authenticatorSelection']['userVerification']);
        $this->assertSame('required', $options['authenticatorSelection']['residentKey']);
        $this->assertGreaterThanOrEqual(32, strlen(VirtualAuthenticator::unb64($options['challenge'])));
        $this->assertSame([-7, -8, -257], array_column($options['pubKeyCredParams'], 'alg'));
    }

    public function testAPasskeyIsAdded(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();

        $this->add($user, $device, 'My laptop')->assertStatus(201)->assertJsonPath('name', 'My laptop');

        $key = $user->passkeys()->firstOrFail();
        $this->assertSame(VirtualAuthenticator::b64($device->credentialId), $key->credential_id);
        $this->assertNull($key->last_used_at);
        $this->actingAs($user)->getJson(self::ADD)->assertOk()->assertJsonPath('data.0.name', 'My laptop')->assertJsonMissingPath('data.0.record');
    }

    public function testTheSameDeviceIsAddedOnce(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);

        $this->add($user, $device)->assertStatus(400);
        $this->assertSame(1, $user->passkeys()->count());
    }

    public function testAnAnswerWithoutAChallengeIsRefused(): void
    {
        $user = $this->makeUser();
        [$options] = $this->challenge($user);
        \Illuminate\Support\Facades\Cache::forget('passkey:registration:' . $user->id);

        $this->actingAs($user)->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options)])->assertStatus(400);
        $this->assertSame(0, $user->passkeys()->count());
    }

    public function testAnAnswerToAnotherChallengeIsRefused(): void
    {
        $user = $this->makeUser();
        [$other, $session] = $this->challenge($user);
        $device = new VirtualAuthenticator();
        $credential = $device->create(array_merge($other, ['challenge' => VirtualAuthenticator::b64(random_bytes(32))]));

        $this->actingAs($user)->withSession($session)->postJson(self::ADD, ['credential' => $credential])->assertStatus(400);
        $this->assertSame(0, $user->passkeys()->count());
    }

    public function testAChallengeIsGoodOnce(): void
    {
        $user = $this->makeUser();
        [$options, $session] = $this->challenge($user);
        $device = new VirtualAuthenticator();
        $credential = $device->create($options);

        $this->actingAs($user)->withSession($session)->postJson(self::ADD, ['credential' => $credential])->assertStatus(201);
        $this->actingAs($user)->postJson(self::ADD, ['credential' => $credential])->assertStatus(400);
        $this->assertSame(1, $user->passkeys()->count());
    }

    public function testAnExpiredChallengeIsRefused(): void
    {
        $user = $this->makeUser();
        [$options] = $this->challenge($user);
        \Illuminate\Support\Facades\Cache::put('passkey:registration:' . $user->id, ['options' => '{}', 'expires' => time() - 1], 60);

        $this->actingAs($user)->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options)])->assertStatus(400);
    }

    public function testAChallengeOfAnotherUserIsRefused(): void
    {
        $owner = $this->makeUser();
        $thief = $this->makeUser();
        [$options] = $this->challenge($owner);

        $this->actingAs($thief)->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options)])->assertStatus(400);
        $this->assertSame(0, $thief->passkeys()->count());
    }

    public function testAnAnswerFromAnotherSiteIsRefused(): void
    {
        $user = $this->makeUser();
        [$options, $session] = $this->challenge($user);

        $this->actingAs($user)->withSession($session)
            ->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options, 'https://evil.example')])->assertStatus(400);
        $this->assertSame(0, $user->passkeys()->count());
    }

    public function testAnAnswerMadeForAnotherDomainIsRefused(): void
    {
        $user = $this->makeUser();
        [$options, $session] = $this->challenge($user);

        $this->actingAs($user)->withSession($session)
            ->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options, 'http://localhost', 'evil.example')])->assertStatus(400);
    }

    public function testAnAnswerWithoutUserVerificationIsRefused(): void
    {
        $user = $this->makeUser();
        [$options, $session] = $this->challenge($user);

        // The user was present but nobody checked who they were (no fingerprint, no PIN).
        $this->actingAs($user)->withSession($session)
            ->postJson(self::ADD, ['credential' => (new VirtualAuthenticator())->create($options, 'http://localhost', null, 0x41)])->assertStatus(400);
    }

    public function testGarbageIsRefused(): void
    {
        $user = $this->makeUser();
        $this->challenge($user);

        $this->actingAs($user)->postJson(self::ADD, ['credential' => ['id' => 'x']])->assertStatus(400);
        $this->actingAs($user)->postJson(self::ADD, ['credential' => 'text'])->assertStatus(422);
        $this->actingAs($user)->postJson(self::ADD, [])->assertStatus(422);
    }

    public function testOnlyAUserWhoIsSignedInManagesPasskeys(): void
    {
        $this->getJson(self::ADD)->assertUnauthorized();
        $this->postJson(self::ADD . '/options')->assertUnauthorized();
    }

    public function testPasskeysBelongToTheirUser(): void
    {
        $owner = $this->makeUser();
        $this->add($owner, new VirtualAuthenticator())->assertStatus(201);
        $id = $owner->passkeys()->firstOrFail()->id;
        $other = $this->makeUser();

        $this->actingAs($other)->getJson(self::ADD)->assertJsonCount(0, 'data');
        $this->actingAs($other)->deleteJson(self::ADD . '/' . $id)->assertNoContent();
        $this->assertSame(1, $owner->passkeys()->count());
    }

    public function testAPasskeyIsRemoved(): void
    {
        $user = $this->makeUser();
        $this->add($user, new VirtualAuthenticator())->assertStatus(201);

        $this->actingAs($user)->deleteJson(self::ADD . '/' . $user->passkeys()->firstOrFail()->id)->assertNoContent();

        $this->assertSame(0, $user->passkeys()->count());
    }

    public function testTheOnlyWayInIsNotRemoved(): void
    {
        $user = $this->makeUser(['password_set' => false]);
        $this->add($user, new VirtualAuthenticator())->assertStatus(201);

        $this->actingAs($user)->deleteJson(self::ADD . '/' . $user->passkeys()->firstOrFail()->id)->assertStatus(400);
        $this->assertSame(1, $user->passkeys()->count());

        $this->add($user, new VirtualAuthenticator())->assertStatus(201);
        $this->actingAs($user)->deleteJson(self::ADD . '/' . $user->passkeys()->firstOrFail()->id)->assertNoContent();
    }

    public function testAdminsCanTurnPasskeysOff(): void
    {
        $user = $this->makeUser();
        config(['auth.passkeys.enabled' => false]);

        $this->actingAs($user)->postJson(self::ADD . '/options')->assertNotFound();
        $this->actingAs($user)->getJson(self::ADD)->assertOk()->assertJsonPath('enabled', false);
        $this->signOut();
        $this->postJson('/auth/passkey/options')->assertNotFound();
        $this->postJson('/auth/passkey/login', ['credential' => []])->assertNotFound();
    }

    // ---- signing in -----------------------------------------------------------------------------------------------------

    public function testAPasskeySignsIn(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->assertSame('required', $options['userVerification']);
        $this->assertSame('localhost', $options['rpId']);
        $this->assertEmpty($options['allowCredentials'] ?? []);

        $this->signIn($device->get($options, $user->uuid), $session)->assertOk()->assertJsonPath('data.complete', true);

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->passkeys()->firstOrFail()->last_used_at);
    }

    public function testSigningInDoesNotAskForTheTwoFactorCode(): void
    {
        $user = $this->makeUser(['use_totp' => true, 'totp_secret' => encrypt('secret')]);
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $user->uuid), $session)->assertOk()->assertJsonPath('data.complete', true);
        $this->assertAuthenticatedAs($user);
    }

    public function testAPasskeyThatIsNotKnownIsRefused(): void
    {
        $user = $this->makeUser();
        [$options, $session] = $this->signInChallenge();

        $this->signIn((new VirtualAuthenticator())->get($options, $user->uuid), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testAnotherDeviceCannotSignInAsSomeoneWhoseIdItKnows(): void
    {
        $user = $this->makeUser();
        $real = new VirtualAuthenticator();
        $this->add($user, $real)->assertStatus(201);
        $this->signOut();

        // Same credential id, signed with a different key.
        $fake = new VirtualAuthenticator();
        $fake->credentialId = $real->credentialId;
        [$options, $session] = $this->signInChallenge();

        $this->signIn($fake->get($options, $user->uuid), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testPasskeysOfOtherUsersAreNotAcceptedForAUserHandle(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $other = $this->makeUser();
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $other->uuid), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testAnOldCounterIsRefused(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $user->uuid, counter: 10), $session)->assertOk();
        $this->signOut();

        // A copy of the key signs with a lower counter than the last time.
        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $user->uuid, counter: 3), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testASignInWorksOnce(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $credential = $device->get($options, $user->uuid);
        $this->signIn($credential, $session)->assertOk();
        $this->signOut();

        $this->signIn($credential, [])->assertStatus(400);
        $this->assertGuest();
    }

    public function testASignInForAnotherSiteIsRefused(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $user->uuid, 'https://evil.example'), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testASignInWithoutUserVerificationIsRefused(): void
    {
        $user = $this->makeUser();
        $device = new VirtualAuthenticator();
        $this->add($user, $device)->assertStatus(201);
        $this->signOut();

        [$options, $session] = $this->signInChallenge();
        $this->signIn($device->get($options, $user->uuid, flags: 0x01), $session)->assertStatus(400);
        $this->assertGuest();
    }

    public function testGarbageDoesNotSignInAnyone(): void
    {
        [, $session] = $this->signInChallenge();

        $this->signIn(['id' => 'x', 'rawId' => 'x', 'type' => 'public-key', 'response' => []], $session)->assertStatus(400);
        $this->postJson('/auth/passkey/login', ['credential' => 'text'])->assertStatus(400);
        $this->postJson('/auth/passkey/login', [])->assertStatus(400);
        $this->assertGuest();
    }

    public function testThePublicKeyIsAllThePanelKeeps(): void
    {
        $user = $this->makeUser();
        $this->add($user, new VirtualAuthenticator())->assertStatus(201);

        $this->assertStringNotContainsString('PRIVATE', (string) UserPasskey::query()->firstOrFail()->record);
        $this->assertArrayNotHasKey('record', UserPasskey::query()->firstOrFail()->toArray());
    }
}
