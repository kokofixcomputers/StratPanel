<?php

namespace Pterodactyl\Tests\Integration\Http\Controllers\Admin;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Request;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

class CurseForgeSettingsControllerTest extends HttpTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        // The layout of the admin pages shows how long the page took, the constant is set by public/index.php.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        $this->service()->clearKey();
    }

    protected function tearDown(): void
    {
        $this->service()->clearKey();

        parent::tearDown();
    }

    private function service(): CurseForgeService
    {
        return $this->app->make(CurseForgeService::class);
    }

    private function admin(): User
    {
        return User::factory()->admin()->create();
    }

    public function testThePageShowsThatCurseForgeIsOff(): void
    {
        $response = $this->actingAs($this->admin())->get(route('admin.settings.curseforge'));

        $response->assertOk();
        $response->assertSee('CurseForge is off');
        $response->assertSee('Paste your API key');
        $response->assertDontSee('Test the key');
        // The settings tabs know about the new page.
        $response->assertSee(route('admin.settings.curseforge'));
    }

    public function testOnlyAnAdminCanSeeItOrChangeIt(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get(route('admin.settings.curseforge'))->assertForbidden();
        $this->actingAs($user)->patch(route('admin.settings.curseforge'), ['api_key' => 'abc'])->assertForbidden();
        $this->actingAs($user)->post(route('admin.settings.curseforge.test'))->assertForbidden();
        $this->assertFalse($this->service()->enabled());
    }

    public function testSavingAKeyTurnsItOnAndChecksIt(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['name' => 'Minecraft']])]);

        $response = $this->actingAs($this->admin())->patch(route('admin.settings.curseforge'), ['api_key' => '$2a$10$abc.def/GHI']);

        $response->assertRedirect(route('admin.settings.curseforge'));
        $this->assertTrue($this->service()->enabled());
        $this->assertSame('$2a$10$abc.def/GHI', $this->service()->apiKey());
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/games/432'
            && $request->hasHeader('x-api-key', '$2a$10$abc.def/GHI'));
        $this->assertStringContainsString('CurseForge accepted the key', session('alert-success') ?? $this->flashed());
    }

    private function flashed(): string
    {
        return json_encode(session()->all());
    }

    public function testAKeyThatIsRefusedIsStillSavedButTheAdminIsTold(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response([], 403)]);

        $this->actingAs($this->admin())->patch(route('admin.settings.curseforge'), ['api_key' => 'wrong-key'])
            ->assertRedirect(route('admin.settings.curseforge'));

        $this->assertTrue($this->service()->enabled());
        $this->assertStringContainsString('did not accept the API key', $this->flashed());
    }

    public function testAKeyHasToLookLikeOne(): void
    {
        Http::fake();
        $admin = $this->admin();

        foreach (['', '   ', 'has a space', "line\nbreak", '<script>', str_repeat('a', 201)] as $bad) {
            $response = $this->actingAs($admin)->patch(route('admin.settings.curseforge'), ['api_key' => $bad]);
            // Refused, as a redirect back with the errors or as the JSON the panel's handler makes of them.
            $this->assertTrue($response->status() === 422 || $response->isRedirect(), 'Accepted: ' . json_encode($bad));
            $this->assertFalse($this->service()->enabled(), 'Saved: ' . json_encode($bad));
        }

        $this->assertFalse($this->service()->enabled());
        Http::assertNothingSent();
    }

    public function testThePageNeverShowsTheKey(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);
        $admin = $this->admin();
        $this->actingAs($admin)->patch(route('admin.settings.curseforge'), ['api_key' => 'very-secret-key-123']);

        $response = $this->actingAs($admin)->get(route('admin.settings.curseforge'));

        $response->assertOk();
        $response->assertSee('CurseForge is on');
        $response->assertSee('A key is saved');
        $response->assertSee('Test the key');
        $response->assertDontSee('very-secret-key-123');
        // It is in the database encrypted, not as it was typed.
        $stored = \DB::table('settings')->where('key', CurseForgeService::KEY)->value('value');
        $this->assertNotNull($stored);
        $this->assertStringNotContainsString('very-secret-key-123', $stored);
    }

    public function testTheKeyCanBeTested(): void
    {
        $this->service()->setKey('a-key');
        $admin = $this->admin();

        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['name' => 'Minecraft']])]);
        $this->actingAs($admin)->post(route('admin.settings.curseforge.test'))->assertRedirect(route('admin.settings.curseforge'));
        $this->assertStringContainsString('CurseForge accepted the key', $this->flashed());

    }

    public function testRemovingTheKeyTurnsItOff(): void
    {
        $this->service()->setKey('a-key');
        $this->assertTrue($this->service()->enabled());

        $this->actingAs($this->admin())->patch(route('admin.settings.curseforge'), ['remove_key' => '1'])
            ->assertRedirect(route('admin.settings.curseforge'));

        $this->assertFalse($this->service()->enabled());
    }

    public function testTestingWithoutAKeyIsAnErrorNotACrash(): void
    {
        Http::fake();

        $this->actingAs($this->admin())->post(route('admin.settings.curseforge.test'))
            ->assertRedirect(route('admin.settings.curseforge'));

        $this->assertStringContainsString('there is no key to test', $this->flashed());
        Http::assertNothingSent();
    }
}
