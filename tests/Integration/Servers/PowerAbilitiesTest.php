<?php

namespace Pterodactyl\Tests\Integration\Servers;

use Illuminate\Support\Facades\Hash;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Permission;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** The server list shows power buttons only for the actions the user may use. */
class PowerAbilitiesTest extends IntegrationTestCase
{
    use CreatesTestModels;

    public function tearDown(): void
    {
        $ids = User::query()->where('email', 'like', '%@power-test.example')->pluck('id');
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();

        parent::tearDown();
    }

    private function user(array $attributes = []): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(array_merge(['username' => $name, 'email' => $name . '@power-test.example', 'password' => Hash::make('correct-horse-battery')], $attributes));
    }

    private function server(User $owner): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(['user_id' => $owner->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);
    }

    public function testTheOwnerMayUseEveryButton(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->getJson("/api/client/servers/{$server->uuid}")
            ->assertOk()
            ->assertJsonPath('attributes.can_control', ['start' => true, 'stop' => true, 'restart' => true]);
    }

    public function testASubuserGetsOnlyTheButtonsOfTheirPermissions(): void
    {
        $server = $this->server($this->user());
        $helper = $this->user();
        Subuser::query()->create(['user_id' => $helper->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_CONTROL_START, Permission::ACTION_CONTROL_CONSOLE]]);

        $this->actingAs($helper)->getJson("/api/client/servers/{$server->uuid}")
            ->assertOk()
            ->assertJsonPath('attributes.can_control', ['start' => true, 'stop' => false, 'restart' => false]);
    }

    public function testASubuserWithoutAnyPowerRightGetsNoButton(): void
    {
        $server = $this->server($this->user());
        $reader = $this->user();
        Subuser::query()->create(['user_id' => $reader->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_FILE_READ]]);

        $this->actingAs($reader)->getJson("/api/client/servers/{$server->uuid}")
            ->assertOk()
            ->assertJsonPath('attributes.can_control', ['start' => false, 'stop' => false, 'restart' => false]);
    }

    public function testARootAdminMayUseEveryButtonOnAnyServer(): void
    {
        $server = $this->server($this->user());
        $admin = $this->user(['root_admin' => true]);

        $this->actingAs($admin)->getJson("/api/client/servers/{$server->uuid}")
            ->assertOk()
            ->assertJsonPath('attributes.can_control', ['start' => true, 'stop' => true, 'restart' => true]);
    }
}
