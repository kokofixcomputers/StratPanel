<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\User;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Models\UserIdentity;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

class OAuthTest extends AuthTestCase
{
    private function provider(array $attributes = []): AuthProvider
    {
        return AuthProvider::query()->create(array_merge([
            'key' => 'github',
            'type' => 'github',
            'name' => 'GitHub',
            'client_id' => 'client-id',
            'client_secret' => 'client-secret',
            'enabled' => true,
            'allow_signup' => true,
        ], $attributes));
    }

    /** What the service answers: a token, then the person. */
    private function github(array $profile = [], ?array $emails = null): void
    {
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'the-token']),
            'api.github.com/user/emails' => Http::response($emails ?? [], $emails === null ? 404 : 200),
            'api.github.com/user' => Http::response(array_merge(['id' => 4242, 'login' => 'octo', 'name' => 'Octo Cat', 'email' => 'octo@' . self::DOMAIN], $profile)),
        ]);
    }

    private function state(string $key = 'github', string $mode = 'login', ?int $user = null, int $expires = 0): array
    {
        return ['oauth' => ['state' => 'known-state', 'provider' => $key, 'mode' => $mode, 'user' => $user, 'expires' => $expires ?: time() + 600]];
    }

    private function comeBack(string $key = 'github', array $query = [], ?array $session = null)
    {
        return $this->withSession($session ?? $this->state($key))
            ->get("/auth/oauth/$key/callback?" . http_build_query(array_merge(['code' => 'the-code', 'state' => 'known-state'], $query)));
    }

    // ---- sending the browser there --------------------------------------------------------------------------------------

    public function testTheBrowserIsSentToTheServiceWithAStateOfThisSession(): void
    {
        $this->provider();

        $response = $this->get('/auth/oauth/github/redirect')->assertRedirect();
        $location = $response->headers->get('Location');
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $location);
        $this->assertSame('client-id', $query['client_id']);
        $this->assertSame('code', $query['response_type']);
        $this->assertSame('read:user user:email', $query['scope']);
        $this->assertSame(url('/auth/oauth/github/callback'), $query['redirect_uri']);
        $this->assertSame(40, strlen($query['state']));
        $response->assertSessionHas('oauth.state', $query['state']);
        $response->assertSessionHas('oauth.mode', 'login');
        $this->assertStringNotContainsString('client-secret', $location);
    }

    public function testAServiceThatIsOffOrUnknownIsNotUsed(): void
    {
        $this->provider(['enabled' => false]);

        $this->get('/auth/oauth/github/redirect')->assertRedirect('/auth/login?error=unknown');
        $this->get('/auth/oauth/nothing/redirect')->assertRedirect('/auth/login?error=unknown');
        $this->get('/auth/oauth/github/callback?code=x&state=y')->assertRedirect('/auth/login?error=unknown');
    }

    public function testSomebodyWhoIsSignedInIsNotSentToSignInAgain(): void
    {
        $this->provider();

        $this->actingAs($this->makeUser())->get('/auth/oauth/github/redirect')->assertRedirect('/');
    }

    public function testLinkingNeedsASignedInUser(): void
    {
        $this->provider();

        $this->get('/auth/oauth/github/redirect?link=1')->assertRedirect('/auth/login');

        $this->actingAs($this->makeUser())->get('/auth/oauth/github/redirect?link=1')->assertSessionHas('oauth.mode', 'link');
    }

    // ---- what comes back ------------------------------------------------------------------------------------------------

    public function testAStateThatIsNotOursIsRefused(): void
    {
        $this->provider();
        $this->github();
        $user = $this->makeUser();
        UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => AuthProvider::query()->firstOrFail()->id, 'provider_user_id' => '4242']);

        $this->comeBack('github', ['state' => 'forged'])->assertRedirect('/auth/login?error=state');
        $this->comeBack('github', ['state' => ''])->assertRedirect('/auth/login?error=state');
        $this->get('/auth/oauth/github/callback?code=x&state=known-state')->assertRedirect('/auth/login?error=state');
        $this->comeBack('github', [], $this->state('other-service'))->assertRedirect('/auth/login?error=state');
        $this->comeBack('github', [], $this->state('github', 'login', null, time() - 1))->assertRedirect('/auth/login?error=state');
        $this->assertGuest();
        Http::assertNothingSent();
    }

    public function testAStateWorksOnce(): void
    {
        $this->provider();
        $this->github();

        $this->comeBack()->assertRedirect('/auth/login?error=not_linked');
        $this->get('/auth/oauth/github/callback?code=x&state=known-state')->assertRedirect('/auth/login?error=state');
    }

    public function testTheServiceRefusing(): void
    {
        $this->provider();
        $this->comeBack('github', ['error' => 'access_denied', 'code' => ''])->assertRedirect('/auth/login?error=denied');
        $this->comeBack('github', ['error' => 'server_error', 'code' => ''])->assertRedirect('/auth/login?error=provider');
        $this->comeBack('github', ['code' => ''])->assertRedirect('/auth/login?error=provider');
    }

    public function testTheServiceRefusingTheCode(): void
    {
        $this->provider();
        Http::fake(['github.com/login/oauth/access_token' => Http::response(['error' => 'bad_verification_code'], 200)]);

        $this->comeBack()->assertRedirect('/auth/login?error=token');
        $this->assertGuest();
    }

    public function testTheServiceBeingDown(): void
    {
        $this->provider();
        Http::fake(['github.com/login/oauth/access_token' => Http::response('', 500)]);

        $this->comeBack()->assertRedirect('/auth/login?error=token');
    }

    public function testTheServiceNotGivingTheDetails(): void
    {
        $this->provider();
        Http::fake(['github.com/login/oauth/access_token' => Http::response(['access_token' => 't']), 'api.github.com/user' => Http::response('nope', 500)]);

        $this->comeBack()->assertRedirect('/auth/login?error=profile');
        $this->assertGuest();
    }

    public function testTheServiceNotSayingWhoThePersonIs(): void
    {
        $this->provider();
        $this->github(['id' => null]);

        $this->comeBack()->assertRedirect('/auth/login?error=profile');
        $this->assertGuest();
    }

    public function testTheSecretIsSentToTheServiceAndNowhereElse(): void
    {
        $this->provider();
        $this->github();

        $this->comeBack();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'access_token')
            && $request['client_secret'] === 'client-secret' && $request['code'] === 'the-code' && $request['grant_type'] === 'authorization_code');
        Http::assertSent(fn ($request) => $request->url() === 'https://api.github.com/user' && $request->hasHeader('Authorization', 'Bearer the-token'));
    }

    // ---- signing in -----------------------------------------------------------------------------------------------------

    public function testALinkedAccountSignsIn(): void
    {
        $provider = $this->provider();
        $this->github();
        $user = $this->makeUser();
        $identity = UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '4242']);

        $this->comeBack()->assertRedirect('/');

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($identity->fresh()->last_used_at);
    }

    public function testAnAccountIsRecognisedByItsIdNotItsEmailAddress(): void
    {
        $this->provider();
        // Somebody has the address of an existing account at the service, that is no reason to let them in.
        $victim = $this->makeUser(['email' => 'victim@' . self::DOMAIN]);
        $this->github(['email' => 'victim@' . self::DOMAIN, 'id' => 999]);

        $this->comeBack()->assertRedirect('/auth/login?error=not_linked');

        $this->assertGuest();
        $this->assertSame(0, $victim->identities()->count());
    }

    public function testWithoutSignUpAnUnknownAccountIsTurnedAway(): void
    {
        $this->provider();
        $this->github();
        $before = User::query()->count();

        $this->comeBack()->assertRedirect('/auth/login?error=not_linked');

        $this->assertGuest();
        $this->assertSame($before, User::query()->count());
    }

    public function testAProviderThatDoesNotAllowSignUpTurnsThemAway(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider(['allow_signup' => false]);
        $this->github();

        $this->comeBack()->assertRedirect('/auth/login?error=not_linked');
        $this->assertSame(0, User::query()->where('email', 'octo@' . self::DOMAIN)->count());
    }

    public function testWithSignUpOnAnUnknownAccountGetsAnAccount(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->github();
        Notification::fake();

        $this->comeBack()->assertRedirect('/');

        $user = User::query()->where('email', 'octo@' . self::DOMAIN)->firstOrFail();
        $this->assertSame('octo', $user->username);
        $this->assertSame('Octo', $user->name_first);
        $this->assertSame('Cat', $user->name_last);
        $this->assertFalse($user->password_set);
        $this->assertFalse($user->root_admin);
        $this->assertSame('4242', $user->identities()->firstOrFail()->provider_user_id);
        $this->assertAuthenticatedAs($user);
        Notification::assertNothingSent();
    }

    public function testAnAddressThatIsTakenIsNotSignedUpAgain(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->makeUser(['email' => 'octo@' . self::DOMAIN]);
        $this->github();

        $this->comeBack()->assertRedirect('/auth/login?error=email_taken');

        $this->assertGuest();
    }

    public function testTheUsernameIsMadeToFitAndIsUnique(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->makeUser(['username' => 'octo', 'email' => 'someone.else@' . self::DOMAIN]);
        $this->github();

        $this->comeBack()->assertRedirect('/');

        $name = User::query()->where('email', 'octo@' . self::DOMAIN)->firstOrFail()->username;
        $this->assertNotSame('octo', $name);
        $this->assertStringStartsWith('octo', $name);
    }

    /** @dataProvider awkwardNames */
    public function testAwkwardNamesBecomeValidUsernames(?string $login, string $email): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->github(['login' => $login, 'email' => $email, 'name' => null]);

        $this->comeBack()->assertRedirect('/');

        $user = User::query()->where('email', $email)->firstOrFail();
        $this->assertMatchesRegularExpression(\Pterodactyl\Rules\Username::VALIDATION_REGEX, $user->username);
        $this->assertSame('-', $user->name_last);
    }

    public static function awkwardNames(): array
    {
        return [
            'spaces and symbols' => ['Ünï cödé  !!', 'one@' . self::DOMAIN],
            'too short' => ['a', 'two@' . self::DOMAIN],
            'only symbols' => ['***', 'three@' . self::DOMAIN],
            'no name at all' => [null, 'four.five@' . self::DOMAIN],
            'very long' => [str_repeat('x', 300), 'six@' . self::DOMAIN],
            'dots at the ends' => ['..dotty..', 'seven@' . self::DOMAIN],
        ];
    }

    public function testAnAddressTheServiceDidNotCheckIsNotEnoughToSignUp(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider(['key' => 'discord', 'type' => 'discord', 'name' => 'Discord']);
        Http::fake([
            'discord.com/api/oauth2/token' => Http::response(['access_token' => 't']),
            'discord.com/api/users/@me' => Http::response(['id' => '77', 'username' => 'dis', 'email' => 'dis@' . self::DOMAIN, 'verified' => false]),
        ]);

        $this->comeBack('discord')->assertRedirect('/auth/login?error=no_email');
        $this->assertSame(0, User::query()->where('email', 'dis@' . self::DOMAIN)->count());
    }

    public function testGithubPrivateAddressesAreReadFromTheList(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->github(['email' => null, 'login' => 'hidden'], [
            ['email' => 'other@' . self::DOMAIN, 'verified' => true, 'primary' => false],
            ['email' => 'main@' . self::DOMAIN, 'verified' => true, 'primary' => true],
            ['email' => 'unchecked@' . self::DOMAIN, 'verified' => false, 'primary' => false],
        ]);

        $this->comeBack()->assertRedirect('/');

        $this->assertSame(1, User::query()->where('email', 'main@' . self::DOMAIN)->count());
        $this->assertSame(0, User::query()->where('email', 'unchecked@' . self::DOMAIN)->count());
    }

    public function testGithubAddressesThatWereNotCheckedDoNotCount(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->github(['email' => null], [['email' => 'unchecked@' . self::DOMAIN, 'verified' => false, 'primary' => true]]);

        $this->comeBack()->assertRedirect('/auth/login?error=no_email');
        $this->assertGuest();
    }

    public function testGithubWithoutAnyAddressCannotSignUp(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->github(['email' => null], null);

        $this->comeBack()->assertRedirect('/auth/login?error=no_email');
    }

    public function testSomebodyWithTwoFactorStillHasToGiveTheCode(): void
    {
        $provider = $this->provider();
        $this->github();
        $user = $this->makeUser(['use_totp' => true, 'totp_secret' => encrypt('secret')]);
        UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '4242']);

        $response = $this->comeBack();

        $this->assertGuest();
        $response->assertSessionHas('auth_confirmation_token.user_id', $user->id);
        $token = session('auth_confirmation_token.token_value');
        $response->assertRedirect('/auth/login/checkpoint?token=' . $token);
    }

    // ---- linking --------------------------------------------------------------------------------------------------------

    public function testASignedInUserLinksAService(): void
    {
        $this->provider();
        $this->github();
        $user = $this->makeUser();

        $this->actingAs($user)->withSession($this->state('github', 'link', $user->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?linked=github');

        $identity = $user->identities()->firstOrFail();
        $this->assertSame('4242', $identity->provider_user_id);
        $this->assertSame('octo@' . self::DOMAIN, $identity->email);
        $this->assertAuthenticatedAs($user);
    }

    public function testAnAccountOfAServiceBelongsToOneUser(): void
    {
        $provider = $this->provider();
        $this->github();
        $owner = $this->makeUser();
        UserIdentity::query()->create(['user_id' => $owner->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '4242']);
        $other = $this->makeUser();

        $this->actingAs($other)->withSession($this->state('github', 'link', $other->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?error=linked_elsewhere');

        $this->assertSame(0, $other->identities()->count());
    }

    public function testOnlyOneAccountPerServiceCanBeLinked(): void
    {
        $provider = $this->provider();
        $this->github(['id' => 5555]);
        $user = $this->makeUser();
        UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '4242']);

        $this->actingAs($user)->withSession($this->state('github', 'link', $user->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?error=has_account');

        $this->assertSame(1, $user->identities()->count());
    }

    public function testLinkingTheSameAccountAgainSaysSo(): void
    {
        $provider = $this->provider();
        $this->github();
        $user = $this->makeUser();
        UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '4242']);

        $this->actingAs($user)->withSession($this->state('github', 'link', $user->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?error=already_yours');
    }

    public function testALinkStartedByAnotherUserIsRefused(): void
    {
        $this->provider();
        $this->github();
        $starter = $this->makeUser();
        $now = $this->makeUser();

        $this->actingAs($now)->withSession($this->state('github', 'link', $starter->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?error=state');

        $this->assertSame(0, $now->identities()->count());
        $this->assertSame(0, $starter->identities()->count());
    }

    public function testALinkWithoutBeingSignedInIsRefused(): void
    {
        $this->provider();
        $this->github();
        $user = $this->makeUser();

        $this->withSession($this->state('github', 'link', $user->id))
            ->get('/auth/oauth/github/callback?code=c&state=known-state')->assertRedirect('/account/providers?error=state');

        $this->assertSame(0, $user->identities()->count());
    }

    // ---- any other service ----------------------------------------------------------------------------------------------

    public function testAnyOtherServiceIsReadWithTheFieldsTheAdminNamed(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider([
            'key' => 'corp-sso',
            'type' => 'oauth2',
            'name' => 'Corporate',
            'scopes' => 'profile mail',
            'endpoints' => [
                'authorize_url' => 'https://sso.corp.test/authorize?tenant=1',
                'token_url' => 'https://sso.corp.test/token',
                'userinfo_url' => 'https://sso.corp.test/me',
                'mapping' => ['id' => 'person.id', 'email' => 'person.mail', 'username' => 'person.handle', 'name' => 'person.display'],
            ],
        ]);
        Http::fake([
            'sso.corp.test/token' => Http::response(['access_token' => 'tok']),
            'sso.corp.test/me' => Http::response(['person' => ['id' => 'abc-1', 'mail' => 'p@' . self::DOMAIN, 'handle' => 'corp.person', 'display' => 'Pat Person']]),
        ]);

        $start = $this->get('/auth/oauth/corp-sso/redirect')->headers->get('Location');
        $this->assertStringStartsWith('https://sso.corp.test/authorize?tenant=1&client_id=client-id', $start);
        $this->assertStringContainsString('scope=profile%20mail', $start);

        $this->comeBack('corp-sso')->assertRedirect('/');

        $user = User::query()->where('email', 'p@' . self::DOMAIN)->firstOrFail();
        $this->assertSame('corp.person', $user->username);
        $this->assertSame('Pat', $user->name_first);
        $this->assertSame('abc-1', $user->identities()->firstOrFail()->provider_user_id);
    }

    public function testTheSecretIsNeverStoredOrShownInTheClear(): void
    {
        $provider = $this->provider();

        $raw = \DB::table('auth_providers')->where('id', $provider->id)->value('client_secret');
        $this->assertNotSame('client-secret', $raw);
        $this->assertStringNotContainsString('client-secret', json_encode($provider->fresh()->toArray()));
        $this->assertSame('client-secret', $provider->fresh()->client_secret);
    }

    public function testThePagesOnlyTellTheBrowserWhatIsPublic(): void
    {
        config(['auth.registration.enabled' => true]);
        $this->provider();
        $this->provider(['key' => 'hidden', 'name' => 'Hidden', 'enabled' => false]);

        $page = $this->get('/auth/login')->getContent();

        $this->assertStringContainsString('"providers":[{"key":"github","name":"GitHub","type":"github","signup":true}]', $page);
        $this->assertStringNotContainsString('client-secret', $page);
        $this->assertStringNotContainsString('client-id', $page);
        $this->assertStringNotContainsString('Hidden', $page);
    }
}
