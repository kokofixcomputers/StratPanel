<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Illuminate\Support\Facades\Notification;
use Pterodactyl\Notifications\MailTested;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

/** The pages of Settings that are one form each. The ones with a list have tests of their own (providers, domains, certificates). */
class SettingsApiTest extends RoleTestCase
{
    private function stored(string $key): ?string
    {
        return \DB::table('settings')->where('key', 'settings::' . $key)->value('value');
    }

    public function tearDown(): void
    {
        \DB::table('settings')->whereIn('key', ['settings::app:name', 'settings::app:locale', 'settings::pterodactyl:auth:2fa_required', 'settings::pterodactyl:guzzle:timeout', 'settings::pterodactyl:guzzle:connect_timeout', 'settings::mail:from:address', 'settings::mail:from:name', 'settings::mail:mailers:smtp:host', 'settings::mail:mailers:smtp:port', 'settings::mail:mailers:smtp:encryption', 'settings::mail:mailers:smtp:username', 'settings::mail:mailers:smtp:password'])->delete();

        parent::tearDown();
    }

    public function testThePagesAreTheApp(): void
    {
        $this->actingAs($this->rootAdmin());

        foreach (['', '/mail', '/advanced', '/branding', '/authentication', '/providers', '/providers/new', '/domains', '/domains/new', '/pools', '/trash', '/certificates', '/curseforge'] as $path) {
            $this->get('/admin/settings' . $path)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testTheGeneralSettingsAreSavedAndGivenBack(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/settings/general')->assertOk()->assertJsonStructure(['name', 'two_factor', 'locale', 'languages']);
        $this->patchJson('/api/client/admin/settings/general', ['app:name' => 'Koko Hosting', 'pterodactyl:auth:2fa_required' => 1, 'app:locale' => 'en'])
            ->assertOk()->assertJsonPath('name', 'Koko Hosting')->assertJsonPath('two_factor', 1);
        $this->assertSame('Koko Hosting', $this->stored('app:name'));
        $this->patchJson('/api/client/admin/settings/general', ['app:name' => '', 'pterodactyl:auth:2fa_required' => 9, 'app:locale' => 'xx'])->assertStatus(422);
    }

    public function testTheAdvancedSettingsAreChecked(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->patchJson('/api/client/admin/settings/advanced', ['pterodactyl:guzzle:timeout' => 30, 'pterodactyl:guzzle:connect_timeout' => 5])->assertOk()->assertJsonPath('timeout', 30);
        $this->assertSame('30', $this->stored('pterodactyl:guzzle:timeout'));
        $this->patchJson('/api/client/admin/settings/advanced', ['pterodactyl:guzzle:timeout' => 61, 'pterodactyl:guzzle:connect_timeout' => 5])->assertStatus(422);
    }

    public function testMailIsSavedWithTheSecretKeptEncryptedAndKeptWhenLeftEmpty(): void
    {
        config(['mail.default' => 'smtp']);
        $this->actingAs($this->rootAdmin());
        $body = ['mail:mailers:smtp:host' => 'smtp.example.com', 'mail:mailers:smtp:port' => 587, 'mail:mailers:smtp:encryption' => 'tls', 'mail:mailers:smtp:username' => 'koko', 'mail:mailers:smtp:password' => 'hunter2', 'mail:from:address' => 'no-reply@example.com', 'mail:from:name' => 'Koko'];

        $json = $this->patchJson('/api/client/admin/settings/mail', $body)->assertOk()->json();
        $this->assertSame('smtp.example.com', $json['host']);
        $this->assertTrue($json['password_saved']);
        $this->assertArrayNotHasKey('password', $json);
        $this->assertNotSame('hunter2', $this->stored('mail:mailers:smtp:password'));

        $stored = $this->stored('mail:mailers:smtp:password');
        $this->patchJson('/api/client/admin/settings/mail', array_merge($body, ['mail:mailers:smtp:password' => '']))->assertOk();
        $this->assertSame($stored, $this->stored('mail:mailers:smtp:password'), 'empty keeps the saved one');

        $this->patchJson('/api/client/admin/settings/mail', array_merge($body, ['mail:mailers:smtp:password' => '!e']))->assertOk()->assertJsonPath('password_saved', false);
        $this->patchJson('/api/client/admin/settings/mail', array_merge($body, ['mail:from:address' => 'nope']))->assertStatus(422);
    }

    public function testMailIsOnlyForSmtp(): void
    {
        config(['mail.default' => 'log']);
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/settings/mail')->assertOk()->assertJsonPath('disabled', true);
        $this->patchJson('/api/client/admin/settings/mail', ['mail:mailers:smtp:host' => 'x', 'mail:mailers:smtp:port' => 25, 'mail:mailers:smtp:encryption' => null, 'mail:from:address' => 'a@example.com'])->assertStatus(400);
    }

    public function testATestMessageGoesToWhoAsks(): void
    {
        Notification::fake();
        $me = $this->rootAdmin();
        $this->actingAs($me);

        $this->postJson('/api/client/admin/settings/mail/test')->assertOk()->assertJsonPath('sent_to', $me->email);
        Notification::assertSentOnDemand(MailTested::class);
    }

    public function testBrandingTakesTheListsWholeAndAFavicon(): void
    {
        $this->actingAs($this->rootAdmin());

        $json = $this->postJson('/api/client/admin/settings/branding', [
            'console_prompt' => 'koko@hosting~',
            'announcements' => [['title' => 'Hi', 'message' => 'Maintenance tonight', 'type' => 'warning', 'enabled' => '1', 'dismissible' => '0']],
            'links' => [['label' => 'Status', 'url' => 'https://status.example.com', 'location' => 'footer', 'new_tab' => '1']],
        ])->assertOk()->json();

        $this->assertSame('koko@hosting~', $json['console_prompt']);
        $this->assertSame('Maintenance tonight', $json['announcements'][0]['message']);
        $this->assertFalse($json['announcements'][0]['dismissible']);
        $this->assertSame('Status', $json['links'][0]['label']);

        $this->postJson('/api/client/admin/settings/branding', ['links' => [['label' => 'Bad', 'url' => 'javascript:alert(1)', 'location' => 'footer']]])->assertStatus(422);
        $this->postJson('/api/client/admin/settings/branding', ['console_prompt' => ''])->assertOk()->assertJsonPath('links', [])->assertJsonPath('announcements', []);
    }

    public function testCurseForgeKeyIsTestedAndRemoved(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/settings/curseforge')->assertOk()->assertJsonStructure(['enabled', 'from_environment']);
        $this->postJson('/api/client/admin/settings/curseforge/test')->assertOk()->assertJsonPath('ok', false);
        $this->patchJson('/api/client/admin/settings/curseforge', ['api_key' => 'has spaces!'])->assertStatus(422);
    }

    public function testEachPageNeedsItsOwnPermission(): void
    {
        $this->actingAs($this->userWith(['settings.trash.view']));

        $this->getJson('/api/client/admin/settings/trash')->assertOk();
        $this->patchJson('/api/client/admin/settings/trash', ['retention_days' => 5])->assertStatus(403);
        foreach (['general', 'advanced', 'mail', 'pools', 'curseforge', 'authentication', 'branding', 'providers', 'domains', 'certificates'] as $page) {
            $this->getJson('/api/client/admin/settings/' . $page)->assertStatus(403);
        }
    }
}
