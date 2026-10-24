<?php

namespace Pterodactyl\Tests\Integration\Http\Controllers\Admin;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Request;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

class CurseForgeSettingsControllerTest extends HttpTestCase
{
    private const API = '/api/client/admin/settings/curseforge';

    public function setUp(): void
    {
        parent::setUp();

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

    public function testTheSettingsSayThatCurseForgeIsOff(): void
    {
        $this->actingAs($this->admin())->getJson(self::API)->assertOk()->assertJson(['enabled' => false, 'from_environment' => false]);
    }

    public function testThePageIsTheApp(): void
    {
        $this->actingAs($this->admin())->get('/admin/settings/curseforge')->assertOk()->assertSee('<div id="app"></div>', false);
    }

    public function testOnlyAnAdminCanSeeItOrChangeIt(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin/settings/curseforge')->assertForbidden();
        $this->actingAs($user)->getJson(self::API)->assertForbidden();
        $this->actingAs($user)->patchJson(self::API, ['api_key' => 'abc'])->assertForbidden();
        $this->actingAs($user)->postJson(self::API . '/test')->assertForbidden();
        $this->assertFalse($this->service()->enabled());
    }

    public function testSavingAKeyTurnsItOnAndChecksIt(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['name' => 'Minecraft']])]);

        $response = $this->actingAs($this->admin())->patchJson(self::API, ['api_key' => '$2a$10$abc.def/GHI']);

        $response->assertOk()->assertJsonPath('ok', true)->assertJsonPath('enabled', true);
        $this->assertStringContainsString('CurseForge accepted the key', $response->json('message'));
        $this->assertTrue($this->service()->enabled());
        $this->assertSame('$2a$10$abc.def/GHI', $this->service()->apiKey());
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/games/432'
            && $request->hasHeader('x-api-key', '$2a$10$abc.def/GHI'));
    }

    public function testAKeyThatIsRefusedIsStillSavedButTheAdminIsTold(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response([], 403)]);

        $response = $this->actingAs($this->admin())->patchJson(self::API, ['api_key' => 'wrong-key'])->assertOk()->assertJsonPath('ok', false);

        $this->assertTrue($this->service()->enabled());
        $this->assertStringContainsString('did not accept the API key', $response->json('message'));
    }

    public function testAKeyHasToLookLikeOne(): void
    {
        Http::fake();
        $admin = $this->admin();

        foreach (['', '   ', 'has a space', "line\nbreak", '<script>', str_repeat('a', 201)] as $bad) {
            $this->actingAs($admin)->patchJson(self::API, ['api_key' => $bad])->assertStatus(422);
            $this->assertFalse($this->service()->enabled(), 'Saved: ' . json_encode($bad));
        }

        $this->assertFalse($this->service()->enabled());
        Http::assertNothingSent();
    }

    public function testTheSettingsNeverShowTheKey(): void
    {
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);
        $admin = $this->admin();
        $this->actingAs($admin)->patchJson(self::API, ['api_key' => 'very-secret-key-123']);

        $response = $this->actingAs($admin)->getJson(self::API);

        $response->assertOk()->assertJsonPath('enabled', true)->assertDontSee('very-secret-key-123');
        // It is in the database encrypted, not as it was typed.
        $stored = \DB::table('settings')->where('key', CurseForgeService::KEY)->value('value');
        $this->assertNotNull($stored);
        $this->assertStringNotContainsString('very-secret-key-123', $stored);
    }

    public function testTheKeyCanBeTested(): void
    {
        $this->service()->setKey('a-key');

        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['name' => 'Minecraft']])]);
        $response = $this->actingAs($this->admin())->postJson(self::API . '/test')->assertOk()->assertJsonPath('ok', true);

        $this->assertStringContainsString('CurseForge accepted the key', $response->json('message'));
    }

    public function testRemovingTheKeyTurnsItOff(): void
    {
        $this->service()->setKey('a-key');
        $this->assertTrue($this->service()->enabled());

        $this->actingAs($this->admin())->patchJson(self::API, ['remove_key' => '1'])->assertOk()->assertJsonPath('enabled', false);

        $this->assertFalse($this->service()->enabled());
    }

    public function testTestingWithoutAKeyIsAnErrorNotACrash(): void
    {
        Http::fake();

        $response = $this->actingAs($this->admin())->postJson(self::API . '/test')->assertOk()->assertJsonPath('ok', false);

        $this->assertStringContainsString('there is no key to test', $response->json('message'));
        Http::assertNothingSent();
    }
}
