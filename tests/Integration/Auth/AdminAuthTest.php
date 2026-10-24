<?php

namespace Pterodactyl\Tests\Integration\Auth;

use Pterodactyl\Models\Setting;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Models\UserIdentity;
use Illuminate\Contracts\Encryption\Encrypter;

class AdminAuthTest extends AuthTestCase
{
    private function admin()
    {
        return $this->makeUser(['root_admin' => true]);
    }

    private function page(string $uri)
    {
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        return $this->get($uri);
    }

    private function stored(string $key): ?string
    {
        return Setting::query()->where('key', 'settings::' . $key)->value('value');
    }

    private function save(array $data)
    {
        return $this->patchJson('/api/client/admin/settings/authentication', array_merge(['captcha' => 'none'], $data));
    }

    // ---- who may -------------------------------------------------------------------------------------------------------

    public function testOnlyAdminsSeeThePages(): void
    {
        $this->actingAs($this->makeUser())->get('/admin/settings/authentication')->assertStatus(403);
        $this->get('/admin/settings/providers')->assertStatus(403);
        $this->patchJson('/api/client/admin/settings/authentication', ['captcha' => 'none'])->assertStatus(403);
        $this->postJson('/api/client/admin/settings/providers', [])->assertStatus(403);
        $this->assertNull($this->stored('auth:captcha:provider'));
    }

    public function testThePagesRender(): void
    {
        $this->actingAs($this->admin());

        foreach (['/admin/settings/authentication', '/admin/settings/providers', '/admin/settings/providers/new?type=github'] as $uri) {
            $this->page($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
        $this->getJson('/api/client/admin/settings/authentication')->assertOk()->assertJsonPath('captcha', 'none')->assertJsonPath('registration', false)->assertJsonPath('passkeys', true);
        $types = array_column($this->getJson('/api/client/admin/settings/providers')->assertOk()->json('types'), 'type');
        $this->assertSame(['github', 'google', 'discord', 'microsoft', 'gitlab', 'oauth2'], $types);
        foreach ($types as $type) {
            $this->getJson('/api/client/admin/settings/providers/blank?type=' . $type)->assertOk()->assertJsonPath('type', $type)->assertJsonStructure(['callback']);
        }
        $this->getJson('/api/client/admin/settings/providers/blank?type=nonsense')->assertNotFound();
    }

    // ---- captcha, sign up, passkeys -------------------------------------------------------------------------------------

    public function testTheDefaultsAreSafe(): void
    {
        $this->assertFalse(config('auth.registration.enabled'));
        $this->assertTrue(config('auth.registration.password'));
    }

    public function testNoneIsSaved(): void
    {
        $this->actingAs($this->admin());

        $this->save([])->assertOk();

        $this->assertSame('none', $this->stored('auth:captcha:provider'));
        $this->assertSame('false', $this->stored('recaptcha:enabled'));
        $this->assertSame('false', $this->stored('auth:registration:enabled'));
        $this->assertSame('false', $this->stored('auth:passkeys:enabled'));
    }

    public function testTurnstileIsSavedWithTheSecretEncrypted(): void
    {
        $this->actingAs($this->admin());

        $this->save(['captcha' => 'turnstile', 'turnstile_site_key' => '0x4AAA-site', 'turnstile_secret_key' => '0x4AAA-secret'])
            ->assertOk();

        $this->assertSame('turnstile', $this->stored('auth:captcha:provider'));
        $this->assertSame('0x4AAA-site', $this->stored('auth:captcha:turnstile:site_key'));
        $raw = $this->stored('auth:captcha:turnstile:secret_key');
        $this->assertNotSame('0x4AAA-secret', $raw);
        $this->assertSame('0x4AAA-secret', $this->app->make(Encrypter::class)->decrypt($raw));
        $this->assertSame('false', $this->stored('recaptcha:enabled'));
    }

    public function testRecaptchaIsSavedAndSwitchesTheOldSwitchOn(): void
    {
        $this->actingAs($this->admin());

        $this->save(['captcha' => 'recaptcha', 'recaptcha_site_key' => 'site', 'recaptcha_secret_key' => 'secret']);

        $this->assertSame('recaptcha', $this->stored('auth:captcha:provider'));
        $this->assertSame('true', $this->stored('recaptcha:enabled'));
        $this->assertSame('site', $this->stored('recaptcha:website_key'));
        $this->assertSame('secret', $this->stored('recaptcha:secret_key'));
    }

    public function testASecretLeftEmptyIsKept(): void
    {
        $this->actingAs($this->admin());
        $this->save(['captcha' => 'turnstile', 'turnstile_site_key' => 'site', 'turnstile_secret_key' => 'first-secret']);
        config(['auth.captcha.turnstile.secret_key' => 'first-secret', 'auth.captcha.turnstile.site_key' => 'site']);

        $this->save(['captcha' => 'turnstile', 'turnstile_site_key' => 'site-two', 'turnstile_secret_key' => '']);

        $this->assertSame('site-two', $this->stored('auth:captcha:turnstile:site_key'));
        $this->assertSame('first-secret', $this->app->make(Encrypter::class)->decrypt($this->stored('auth:captcha:turnstile:secret_key')));
    }

    public function testACaptchaWithoutItsKeysIsRefused(): void
    {
        $this->actingAs($this->admin());
        config(['auth.captcha.turnstile.site_key' => '', 'auth.captcha.turnstile.secret_key' => '']);

        $this->save(['captcha' => 'turnstile', 'turnstile_site_key' => 'only-the-site-key'])->assertStatus(400);
        $this->assertNull($this->stored('auth:captcha:provider'));

        config(['recaptcha.website_key' => '', 'recaptcha.secret_key' => '']);
        $this->save(['captcha' => 'recaptcha'])->assertStatus(400);
        $this->assertNull($this->stored('auth:captcha:provider'));
    }

    public function testNothingButTheKnownCaptchasIsAccepted(): void
    {
        $this->actingAs($this->admin());

        $this->save(['captcha' => 'hcaptcha'])->assertStatus(422)->assertJsonFragment(['source_field' => 'captcha']);
        $this->assertNull($this->stored('auth:captcha:provider'));
    }

    public function testSignUpAndPasskeysAreSwitchedOn(): void
    {
        $this->actingAs($this->admin());

        $this->save(['registration' => '1', 'registration_password' => '1', 'passkeys' => '1']);

        $this->assertSame('true', $this->stored('auth:registration:enabled'));
        $this->assertSame('true', $this->stored('auth:registration:password'));
        $this->assertSame('true', $this->stored('auth:passkeys:enabled'));
    }

    public function testAdvancedSettingsNoLongerHoldTheCaptcha(): void
    {
        $this->actingAs($this->admin());

        $this->getJson('/api/client/admin/settings/advanced')->assertOk()->assertJsonMissing(['captcha'])->assertJsonStructure(['timeout', 'connect_timeout']);
    }

    // ---- providers ------------------------------------------------------------------------------------------------------

    private function add(array $data = [])
    {
        return $this->postJson('/api/client/admin/settings/providers', array_merge([
            'type' => 'github',
            'key' => 'github',
            'name' => 'GitHub',
            'client_id' => 'the-id',
            'client_secret' => 'the-secret',
            'enabled' => '1',
            'allow_signup' => '1',
        ], $data));
    }

    public function testAProviderIsAdded(): void
    {
        $this->actingAs($this->admin());

        $this->add()->assertStatus(201);

        $provider = AuthProvider::query()->where('key', 'github')->firstOrFail();
        $this->assertSame('github', $provider->type);
        $this->assertSame('the-id', $provider->client_id);
        $this->assertSame('the-secret', $provider->client_secret);
        $this->assertTrue($provider->enabled);
        $this->assertTrue($provider->allow_signup);
        $this->assertNotSame('the-secret', \DB::table('auth_providers')->value('client_secret'));
    }

    public function testTheFormRequiresWhatIsNeeded(): void
    {
        $this->actingAs($this->admin());

        $this->add(['client_secret' => ''])->assertStatus(422)->assertJsonFragment(['source_field' => 'client_secret']);
        $this->add(['client_id' => ''])->assertStatus(422)->assertJsonFragment(['source_field' => 'client_id']);
        $this->add(['key' => 'Bad Key!'])->assertStatus(422)->assertJsonFragment(['source_field' => 'key']);
        $this->add(['key' => '-nope'])->assertStatus(422)->assertJsonFragment(['source_field' => 'key']);
        $this->add(['scopes' => "bad\nscopes"])->assertStatus(422)->assertJsonFragment(['source_field' => 'scopes']);
        $this->add(['type' => 'nonsense'])->assertNotFound();
        $this->assertSame(0, AuthProvider::query()->count());
    }

    public function testKeysAreUnique(): void
    {
        $this->actingAs($this->admin());
        $this->add()->assertStatus(201);

        $this->add()->assertStatus(422)->assertJsonFragment(['source_field' => 'key']);
        $this->assertSame(1, AuthProvider::query()->count());
    }

    public function testAnyOtherServiceNeedsItsAddresses(): void
    {
        $this->actingAs($this->admin());
        $generic = ['type' => 'oauth2', 'key' => 'corp', 'name' => 'Corp'];

        $this->add($generic)->assertStatus(422)->assertJsonFragment(['source_field' => 'authorize_url'])->assertJsonFragment(['source_field' => 'token_url'])->assertJsonFragment(['source_field' => 'userinfo_url']);
        $this->add($generic + ['authorize_url' => 'javascript:alert(1)', 'token_url' => 'https://x.test/t', 'userinfo_url' => 'https://x.test/u'])
            ->assertStatus(422)->assertJsonFragment(['source_field' => 'authorize_url']);

        $this->add($generic + [
            'authorize_url' => 'https://x.test/a', 'token_url' => 'https://x.test/t', 'userinfo_url' => 'https://x.test/u',
            'map_id' => 'uid', 'map_email' => 'mail', 'map_username' => '', 'map_name' => ' ',
        ])->assertStatus(201);

        $provider = AuthProvider::query()->where('key', 'corp')->firstOrFail();
        $this->assertSame('https://x.test/t', $provider->endpoints['token_url']);
        $this->assertSame(['id' => 'uid', 'email' => 'mail'], $provider->endpoints['mapping']);
    }

    public function testAProviderIsEditedAndTheSecretIsKept(): void
    {
        $this->actingAs($this->admin());
        $this->add();
        $provider = AuthProvider::query()->firstOrFail();

        $this->patchJson('/api/client/admin/settings/providers/' . $provider->id, [
            'name' => 'Octo', 'client_id' => 'new-id', 'client_secret' => '', 'scopes' => 'read:user',
        ])->assertOk()->assertJsonPath('name', 'Octo');

        $provider->refresh();
        $this->assertSame('Octo', $provider->name);
        $this->assertSame('new-id', $provider->client_id);
        $this->assertSame('the-secret', $provider->client_secret);
        $this->assertSame('read:user', $provider->scopes);
        $this->assertFalse($provider->enabled, 'unchecked boxes are not sent');
        $this->assertFalse($provider->allow_signup);
        $this->assertSame('github', $provider->key, 'the key never changes');
    }

    public function testASecretIsReplaced(): void
    {
        $this->actingAs($this->admin());
        $this->add();
        $provider = AuthProvider::query()->firstOrFail();

        $this->patchJson('/api/client/admin/settings/providers/' . $provider->id, ['name' => 'GitHub', 'client_id' => 'id', 'client_secret' => 'brand-new']);

        $this->assertSame('brand-new', $provider->fresh()->client_secret);
    }

    public function testTheEditPageNeverShowsTheSecret(): void
    {
        $this->actingAs($this->admin());
        $this->add();
        $provider = AuthProvider::query()->firstOrFail();

        $this->getJson('/api/client/admin/settings/providers/' . $provider->id)->assertOk()
            ->assertDontSee('the-secret')->assertJsonPath('client_id', 'the-id')->assertJsonPath('secret_saved', true)->assertJsonPath('callback', url('/auth/oauth/github/callback'));
    }

    public function testRemovingAProviderRemovesWhatWasLinkedToIt(): void
    {
        $this->actingAs($this->admin());
        $this->add();
        $provider = AuthProvider::query()->firstOrFail();
        $user = $this->makeUser();
        UserIdentity::query()->create(['user_id' => $user->id, 'auth_provider_id' => $provider->id, 'provider_user_id' => '1']);

        $this->deleteJson('/api/client/admin/settings/providers/' . $provider->id)->assertNoContent();

        $this->assertSame(0, AuthProvider::query()->count());
        $this->assertSame(0, UserIdentity::query()->count());
        $this->assertNotNull($user->fresh());
    }
}
