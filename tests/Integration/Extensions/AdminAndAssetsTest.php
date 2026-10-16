<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use Pterodactyl\Models\User;
use Pterodactyl\Models\InstalledExtension;

class AdminAndAssetsTest extends ExtensionTestCase
{
    private function admin(): User
    {
        return User::factory()->create(['root_admin' => true]);
    }

    private function settingsExtension(bool $enable = true): InstalledExtension
    {
        return $this->install($this->phpExtension('set-one', 'SetOne', '', ['settings' => [
            ['key' => 'greeting', 'label' => 'Greeting', 'type' => 'text', 'default' => 'hi', 'max_length' => 10],
            ['key' => 'loud', 'label' => 'Loud', 'type' => 'boolean', 'default' => false],
            ['key' => 'count', 'label' => 'Count', 'type' => 'number', 'default' => 3, 'min' => 1, 'max' => 9],
            ['key' => 'mode', 'label' => 'Mode', 'type' => 'select', 'default' => 'a', 'options' => ['a' => 'A', 'b' => 'B']],
        ]]), $enable);
    }

    private function page(string $uri)
    {
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        return $this->get($uri);
    }

    // ---- the admin pages ------------------------------------------------------------------------------------------------

    public function testOnlyAdminsSeeThePages(): void
    {
        $this->settingsExtension();
        $user = User::factory()->create();

        $this->get('/admin/extensions')->assertStatus(403);
        $this->actingAs($user)->get('/admin/extensions')->assertStatus(403);
        $this->actingAs($user)->post('/admin/extensions/set-one/toggle')->assertStatus(403);
        $this->assertTrue(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testTheListShowsEveryExtensionAndItsProblems(): void
    {
        $this->settingsExtension();
        $this->install($this->phpExtension('broken-one', 'Broken', 'public function boot(): void { throw new \RuntimeException("it fell over"); }'));

        $this->actingAs($this->admin());
        $response = $this->page('/admin/extensions')->assertOk();

        $response->assertSee('set-one')->assertSee('broken-one')->assertSee('it fell over');
    }

    public function testTheListWorksWithNothingInstalledAndInSafeMode(): void
    {
        $this->actingAs($this->admin());
        $this->page('/admin/extensions')->assertOk();

        $this->settingsExtension();
        config(['extensions.enabled' => false]);
        $this->page('/admin/extensions')->assertOk()->assertSee('afe mode');
    }

    public function testTheListWorksWhenTheFilesAreGone(): void
    {
        $this->settingsExtension();
        $this->removePath($this->directory . '/set-one');

        $this->actingAs($this->admin());
        $this->page('/admin/extensions')->assertOk()->assertSee('set-one');
    }

    public function testExtensionsAreSwitchedOnAndOff(): void
    {
        $this->settingsExtension(false);
        $this->actingAs($this->admin());

        $this->post('/admin/extensions/set-one/toggle')->assertRedirect('/admin/extensions');
        $this->assertTrue(InstalledExtension::query()->firstOrFail()->enabled);

        $this->post('/admin/extensions/set-one/toggle')->assertRedirect('/admin/extensions');
        $this->assertFalse(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testAnExtensionWithoutFilesIsNotSwitchedOn(): void
    {
        $this->settingsExtension(false);
        $this->removePath($this->directory . '/set-one');
        $this->actingAs($this->admin());

        $this->post('/admin/extensions/set-one/toggle')->assertRedirect('/admin/extensions');

        $this->assertFalse(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testSwitchingOnForgetsTheOldError(): void
    {
        $this->settingsExtension(false);
        InstalledExtension::query()->update(['last_error' => 'old', 'last_error_at' => now()]);
        $this->actingAs($this->admin());

        $this->post('/admin/extensions/set-one/toggle');

        $this->assertNull(InstalledExtension::query()->firstOrFail()->last_error);
    }

    public function testAnErrorCanBeDismissed(): void
    {
        $this->settingsExtension();
        InstalledExtension::query()->update(['last_error' => 'old', 'last_error_at' => now()]);
        $this->actingAs($this->admin());

        $this->post('/admin/extensions/set-one/clear-error')->assertRedirect('/admin/extensions');

        $this->assertNull(InstalledExtension::query()->firstOrFail()->last_error);
    }

    public function testUnknownExtensionsAreNotFound(): void
    {
        $this->actingAs($this->admin());

        $this->get('/admin/extensions/nothing/settings')->assertNotFound();
        $this->post('/admin/extensions/nothing/toggle')->assertNotFound();
    }

    public function testTheSettingsFormShowsTheFieldsWithTheirValues(): void
    {
        $this->settingsExtension();
        InstalledExtension::query()->update(['settings' => ['greeting' => 'hello']]);
        $this->actingAs($this->admin());

        $this->page('/admin/extensions/set-one/settings')->assertOk()
            ->assertSee('Greeting')->assertSee('hello')->assertSee('Loud')->assertSee('Mode');
    }

    public function testAnExtensionWithoutSettingsHasNoSettingsPage(): void
    {
        $this->install($this->phpExtension('plain-one', 'Plain', ''));
        $this->actingAs($this->admin());

        $this->get('/admin/extensions/plain-one/settings')->assertRedirect('/admin/extensions');
    }

    public function testSettingsAreSavedWithTheirTypes(): void
    {
        $this->settingsExtension();
        $this->actingAs($this->admin());

        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => 'yo', 'loud' => '1', 'count' => '5', 'mode' => 'b']])
            ->assertRedirect('/admin/extensions/set-one/settings');

        $saved = InstalledExtension::query()->firstOrFail()->settings;
        $this->assertSame('yo', $saved['greeting']);
        $this->assertTrue($saved['loud']);
        $this->assertSame(5, $saved['count']);
        $this->assertSame('b', $saved['mode']);
    }

    public function testAnUncheckedBoxIsSavedAsOff(): void
    {
        $this->settingsExtension();
        InstalledExtension::query()->update(['settings' => ['loud' => true]]);
        $this->actingAs($this->admin());

        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => 'yo', 'count' => '5', 'mode' => 'a']]);

        $this->assertFalse(InstalledExtension::query()->firstOrFail()->settings['loud']);
    }

    public function testBadSettingsAreRefusedAndNothingChanges(): void
    {
        $this->settingsExtension();
        $this->actingAs($this->admin());

        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => str_repeat('x', 11), 'count' => '5', 'mode' => 'a']])
            ->assertStatus(422);
        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => 'ok', 'count' => '99', 'mode' => 'a']])
            ->assertStatus(422);
        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => 'ok', 'count' => '5', 'mode' => 'zzz']])
            ->assertStatus(422);

        $this->assertEmpty(InstalledExtension::query()->firstOrFail()->settings ?? []);
    }

    public function testSettingsThatTheExtensionNeverAskedForAreIgnored(): void
    {
        $this->settingsExtension();
        $this->actingAs($this->admin());

        $this->patch('/admin/extensions/set-one/settings', ['settings' => ['greeting' => 'yo', 'count' => '5', 'mode' => 'a', 'sneaky' => 'x']]);

        $this->assertArrayNotHasKey('sneaky', InstalledExtension::query()->firstOrFail()->settings);
    }

    // ---- the browser files ----------------------------------------------------------------------------------------------

    private function webExtension(string $id = 'web-one', bool $enable = true): void
    {
        $this->install($this->phpExtension($id, 'Web', '', ['web' => ['scripts' => ['web/index.js']]], [
            'web/index.js' => 'console.log(1)',
            'web/style.css' => 'body{}',
            'web/img/a.png' => 'png',
            'web/run.php' => '<?php echo "no";',
            'web/noext' => 'x',
            'src/secret.txt' => 'secret',
            'extension.json.bak' => 'x',
        ]), $enable);
    }

    public function testTheFilesOfARunningExtensionAreServed(): void
    {
        $this->webExtension();

        $this->get('/extensions/web-one/assets/index.js')->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringStartsWith('text/javascript', $this->get('/extensions/web-one/assets/index.js')->headers->get('Content-Type'));
        $this->assertStringStartsWith('text/css', $this->get('/extensions/web-one/assets/style.css')->assertOk()->headers->get('Content-Type'));
        $this->assertSame('image/png', $this->get('/extensions/web-one/assets/img/a.png')->assertOk()->headers->get('Content-Type'));
    }

    public function testAnExtensionThatIsOffServesNothing(): void
    {
        $this->webExtension('web-one', false);

        $this->get('/extensions/web-one/assets/index.js')->assertNotFound();
    }

    public function testOnlyTheWebFolderAndOnlyBrowserFilesAreServed(): void
    {
        $this->webExtension();

        foreach (['run.php', 'noext', 'missing.js', '../src/secret.txt', '../extension.json', '..%2Fsrc%2Fsecret.txt', 'img/../../src/secret.txt', '%2e%2e/extension.json', 'img'] as $path) {
            $this->get('/extensions/web-one/assets/' . $path)->assertNotFound();
        }
        $this->get('/extensions/nothing/assets/index.js')->assertNotFound();
    }

    public function testASymlinkOutOfTheWebFolderIsNotFollowed(): void
    {
        $this->webExtension();
        file_put_contents($this->packages . '/outside.js', 'secret');
        symlink($this->packages . '/outside.js', $this->directory . '/web-one/web/link.js');

        $this->get('/extensions/web-one/assets/link.js')->assertNotFound();
    }

    public function testTheBrowserGetsTheListOfExtensionsOnlyWhenLoggedIn(): void
    {
        $this->webExtension();

        $page = fn () => $this->page('/auth/login')->assertOk()->getContent();
        $this->assertStringNotContainsString('web-one', $page());

        $this->actingAs(User::factory()->create());
        $this->assertStringContainsString('"extensions":[{"id":"web-one"', $this->page('/')->getContent());
    }
}
