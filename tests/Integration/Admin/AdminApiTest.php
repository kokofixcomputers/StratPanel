<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\Location;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

/** The admin pages that are part of the React app: they are the app itself, with the data coming from /api/client/admin. */
class AdminApiTest extends RoleTestCase
{
    private function location(?string $short = null): Location
    {
        return Location::query()->create(['short' => $short ?? 'api' . bin2hex(random_bytes(3)), 'long' => 'Somewhere']);
    }

    public function testThePagesAreTheAppForWhoMayOpenThem(): void
    {
        $location = $this->location();
        $this->actingAs($this->rootAdmin());

        foreach (['/admin', '/admin/roles', '/admin/locations', '/admin/locations/view/' . $location->id] as $uri) {
            $this->page($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testTheAppKnowsWhatThePersonMayDo(): void
    {
        $user = $this->userWith(['locations.view', 'roles.view']);
        $this->actingAs($user);

        $html = $this->page('/admin/locations')->assertOk()->getContent();
        $this->assertStringContainsString('"admin_permissions":["roles.view","locations.view"]', $html);
    }

    public function testRootAdminsGetEveryPermissionAndOthersTheirOwn(): void
    {
        $this->assertSame(\Pterodactyl\Services\Roles\PermissionRegistry::all(), $this->rootAdmin()->toVueObject()['admin_permissions']);
        $this->assertSame(['locations.view'], $this->userWith(['locations.view'])->toVueObject()['admin_permissions']);
        $this->assertSame([], $this->makeUser()->toVueObject()['admin_permissions']);
    }

    public function testNobodyWithoutAccessGetsTheApiOrThePages(): void
    {
        $this->actingAs($this->makeUser());
        // The page first: after a request to the client API a test process answers a refused page differently from a real server.
        $this->get('/admin/locations')->assertStatus(403);
        $this->getJson('/api/client/admin/overview')->assertStatus(403);
        $this->getJson('/api/client/admin/roles')->assertStatus(403);
        $this->getJson('/api/client/admin/locations')->assertStatus(403);
    }

    public function testTheApiNeedsTheSamePermissionAsThePage(): void
    {
        $this->actingAs($this->userWith(['locations.view']));

        $this->getJson('/api/client/admin/locations')->assertOk();
        $this->getJson('/api/client/admin/roles')->assertStatus(403);
        $this->getJson('/api/client/admin/overview')->assertStatus(403);
        $this->postJson('/api/client/admin/locations', ['short' => 'nope'])->assertStatus(403);
    }

    public function testTheOverviewHasTheTotals(): void
    {
        $this->actingAs($this->userWith(['overview.view']));

        $json = $this->getJson('/api/client/admin/overview')->assertOk()->json();
        foreach (['totals', 'capacity', 'nodes', 'eggs', 'recent_servers', 'recent_users', 'activity', 'links'] as $key) {
            $this->assertArrayHasKey($key, $json);
        }
        $this->assertGreaterThanOrEqual(1, $json['totals']['users']['total']);
        $this->assertContains('level', array_keys($json['capacity']['memory']));
    }

    public function testLocationsAreListedMadeChangedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());

        $id = $this->postJson('/api/client/admin/locations', ['short' => 'made.one', 'long' => 'Made'])->assertStatus(201)->json('id');
        $this->assertSame('made.one', Location::query()->findOrFail($id)->short);
        $this->postJson('/api/client/admin/locations', ['short' => 'made.one'])->assertStatus(422);
        $this->postJson('/api/client/admin/locations', ['short' => ''])->assertStatus(422);

        $listed = collect($this->getJson('/api/client/admin/locations')->assertOk()->json('locations'))->firstWhere('id', $id);
        $this->assertSame(['made.one', 'Made', 0, 0], [$listed['short'], $listed['long'], $listed['nodes'], $listed['servers']]);
        $this->assertSame([], $this->getJson('/api/client/admin/locations/' . $id)->assertOk()->json('nodes'));

        $this->patchJson('/api/client/admin/locations/' . $id, ['short' => 'made.two', 'long' => 'Changed'])->assertOk();
        $this->assertSame('Changed', Location::query()->findOrFail($id)->long);
        $this->patchJson('/api/client/admin/locations/' . $id, ['short' => 'made.two'])->assertOk();

        $this->deleteJson('/api/client/admin/locations/' . $id)->assertNoContent();
        $this->assertNull(Location::query()->find($id));
        $this->getJson('/api/client/admin/locations/' . $id)->assertStatus(404);
    }
}
