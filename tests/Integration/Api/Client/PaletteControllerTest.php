<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Palette\AdminDestinations;

class PaletteControllerTest extends ClientApiIntegrationTestCase
{
    public function testEveryDestinationHasARoute(): void
    {
        $root = User::factory()->create(['root_admin' => true]);

        // A route that was renamed would silently disappear from the search: this notices.
        $this->assertCount(count(AdminDestinations::ITEMS), AdminDestinations::for($root));
        foreach (AdminDestinations::for($root) as $item) {
            $this->assertStringStartsWith('/admin', $item['url']);
        }
    }

    public function testRootAdminsGetEverything(): void
    {
        $root = User::factory()->create(['root_admin' => true]);

        $labels = collect($this->actingAs($root)->getJson('/api/client/palette')->assertOk()->json('attributes.admin'))->pluck('label');
        $this->assertTrue($labels->contains('Update the panel'));
        $this->assertTrue($labels->contains('Create a server'));
    }

    public function testRolesGetOnlyWhatTheyMayOpen(): void
    {
        $user = User::factory()->create(['root_admin' => false]);
        $user->roles()->attach(Role::query()->create(['name' => 'pal-' . bin2hex(random_bytes(3)), 'permissions' => ['nodes.view'], 'color' => '#000000'])->id);

        $labels = collect($this->actingAs($user->fresh())->getJson('/api/client/palette')->assertOk()->json('attributes.admin'))->pluck('label');
        $this->assertTrue($labels->contains('Nodes'));
        $this->assertFalse($labels->contains('Users'));
        $this->assertFalse($labels->contains('Update the panel'));
        $this->assertFalse($labels->contains('Create a node'));

        \DB::table('roles')->where('name', 'like', 'pal-%')->delete();
    }

    public function testPeopleWithoutAdminAccessGetNothing(): void
    {
        $user = User::factory()->create(['root_admin' => false]);

        $this->actingAs($user)->getJson('/api/client/palette')->assertOk()->assertJsonPath('attributes.admin', []);
    }
}
