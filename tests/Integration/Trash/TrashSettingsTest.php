<?php

namespace Pterodactyl\Tests\Integration\Trash;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Hash;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

class TrashSettingsTest extends IntegrationTestCase
{
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
        User::query()->where('email', 'like', '%@trash-settings.example')->delete();
        Role::query()->where('name', 'like', 'trash-%')->delete();
        \DB::table('settings')->where('key', 'like', 'settings::trash:%')->delete();
    }

    private function user(array $attributes = []): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(array_merge(['username' => $name, 'email' => $name . '@trash-settings.example', 'password' => Hash::make('x-long-password')], $attributes));
    }

    private function stored(string $key): ?string
    {
        return \DB::table('settings')->where('key', 'settings::trash:' . $key)->value('value');
    }

    private function page()
    {
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        return $this->get('/admin/settings/trash');
    }

    public function testRootAdminsSeeThePage(): void
    {
        $this->actingAs($this->user(['root_admin' => true]));

        $this->page()->assertOk()->assertSee('Keep deleted files and schedules')->assertSee('Keep for (days)');
    }

    public function testItIsSavedOnAndOff(): void
    {
        $this->actingAs($this->user(['root_admin' => true]));

        $this->patch('/admin/settings/trash', ['enabled' => '1', 'retention_days' => '14'])->assertRedirect('/admin/settings/trash');
        $this->assertSame('true', $this->stored('enabled'));
        $this->assertSame('14', $this->stored('retention_days'));

        $this->patch('/admin/settings/trash', ['retention_days' => '30'])->assertRedirect();
        $this->assertSame('false', $this->stored('enabled'));
    }

    public function testTheDaysAreChecked(): void
    {
        $this->actingAs($this->user(['root_admin' => true]));

        foreach (['0', '366', 'many', '', '-3', '1.5'] as $days) {
            $this->patch('/admin/settings/trash', ['enabled' => '1', 'retention_days' => $days])->assertStatus(422);
        }
        $this->assertNull($this->stored('enabled'));
    }

    public function testRolesGetSeparateSeeAndChangePermissions(): void
    {
        $viewer = $this->user();
        $viewer->roles()->attach(Role::query()->create(['name' => 'trash-view', 'permissions' => ['settings.trash.view'], 'color' => '#000000'])->id);
        $this->actingAs($viewer->fresh());

        $this->page()->assertOk();
        $this->patch('/admin/settings/trash', ['enabled' => '1', 'retention_days' => '5'])->assertStatus(403);
        $this->assertNull($this->stored('enabled'));
    }

    public function testNobodyElseGetsIn(): void
    {
        $this->actingAs($this->user())->get('/admin/settings/trash')->assertStatus(403);
    }

    public function testTheSettingsAreRead(): void
    {
        \DB::table('settings')->insert([['key' => 'settings::trash:enabled', 'value' => 'true'], ['key' => 'settings::trash:retention_days', 'value' => '9']]);

        (new \Pterodactyl\Providers\SettingsServiceProvider($this->app))->boot(
            $this->app['config'],
            $this->app->make(\Illuminate\Contracts\Encryption\Encrypter::class),
            $this->app->make(\Psr\Log\LoggerInterface::class),
            new \Pterodactyl\Repositories\Eloquent\SettingsRepository($this->app)
        );

        $this->assertTrue(config('trash.enabled'));
        $this->assertSame(9, app(\Pterodactyl\Services\Trash\TrashService::class)->retentionDays());
    }
}
