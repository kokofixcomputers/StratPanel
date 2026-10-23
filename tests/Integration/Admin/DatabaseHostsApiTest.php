<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\DatabaseHost;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class DatabaseHostsApiTest extends RoleTestCase
{
    /** @return array<string, string> a host the tests can reach: the database they run on */
    private function reachable(string $name): array
    {
        $connection = config('database.connections.' . config('database.default'));

        return [
            'name' => $name,
            'host' => (string) $connection['host'],
            'port' => (string) $connection['port'],
            'username' => (string) $connection['username'],
            'password' => (string) ($connection['password'] ?? ''),
            'node_id' => '',
        ];
    }

    public function setUp(): void
    {
        parent::setUp();

        DatabaseHost::query()->where('name', 'like', 'apitest%')->delete();
    }

    public function tearDown(): void
    {
        DatabaseHost::query()->where('name', 'like', 'apitest%')->delete();

        parent::tearDown();
    }

    public function testAHostIsMadeListedChangedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());

        $id = $this->postJson('/api/client/admin/databases', $this->reachable('apitest one'))->assertStatus(201)->json('id');
        $this->assertSame('apitest one', DatabaseHost::query()->findOrFail($id)->name);

        $row = collect($this->getJson('/api/client/admin/databases')->assertOk()->json('hosts'))->firstWhere('id', $id);
        $this->assertSame(['apitest one', 0, null], [$row['name'], $row['databases'], $row['node']]);

        $json = $this->getJson('/api/client/admin/databases/' . $id)->assertOk()->json();
        $this->assertSame('apitest one', $json['host']['name']);
        $this->assertArrayNotHasKey('password', $json['host'], 'the password is never sent back');
        $this->assertSame([], $json['databases']);
        $this->assertSame(0, $json['pagination']['total']);

        $this->patchJson('/api/client/admin/databases/' . $id, array_merge($this->reachable('apitest two'), ['password' => '']))->assertOk()->assertJsonPath('name', 'apitest two');
        $this->assertSame('apitest two', DatabaseHost::query()->findOrFail($id)->name);

        $this->deleteJson('/api/client/admin/databases/' . $id)->assertNoContent();
        $this->assertNull(DatabaseHost::query()->find($id));
    }

    public function testTheFormIsChecked(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/databases', array_merge($this->reachable('apitest bad'), ['name' => '']))->assertStatus(422);
        $this->postJson('/api/client/admin/databases', array_merge($this->reachable('apitest bad'), ['port' => 'many']))->assertStatus(422);
        $this->postJson('/api/client/admin/databases', array_merge($this->reachable('apitest bad'), ['node_id' => 99999]))->assertStatus(422);
        $this->assertSame(0, DatabaseHost::query()->where('name', 'apitest bad')->count());
    }

    public function testAHostThatCanNotBeReachedSaysWhy(): void
    {
        $this->actingAs($this->rootAdmin());

        $response = $this->postJson('/api/client/admin/databases', array_merge($this->reachable('apitest down'), ['host' => '127.0.0.1', 'port' => '1']));

        $response->assertStatus(400);
        $this->assertStringContainsString('There was an error while trying to connect to the host', $response->json('errors.0.detail'));
        $this->assertSame(0, DatabaseHost::query()->where('name', 'apitest down')->count());
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $host = DatabaseHost::factory()->create(['name' => 'apitest perms']);
        $this->actingAs($this->userWith(['databases.view']));

        $this->getJson('/api/client/admin/databases')->assertOk();
        $this->getJson('/api/client/admin/databases/' . $host->id)->assertOk();
        $this->getJson('/api/client/admin/lookups/nodes')->assertOk();
        $this->postJson('/api/client/admin/databases', $this->reachable('apitest nope'))->assertStatus(403);
        $this->patchJson('/api/client/admin/databases/' . $host->id, $this->reachable('apitest nope'))->assertStatus(403);
        $this->deleteJson('/api/client/admin/databases/' . $host->id)->assertStatus(403);
        $this->assertNotNull(DatabaseHost::query()->find($host->id));
    }

    public function testThePagesAreTheApp(): void
    {
        $host = DatabaseHost::factory()->create(['name' => 'apitest page']);
        $this->actingAs($this->userWith(['databases.view']));

        foreach (['/admin/databases', '/admin/databases/view/' . $host->id] as $uri) {
            $this->page($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testTheNodesOfEveryLocationAreAvailableToTheForms(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/lookups/nodes')->assertOk()->assertJsonStructure(['locations']);
    }
}
