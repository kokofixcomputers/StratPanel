<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Mount;
use Pterodactyl\Models\Location;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class MountsApiTest extends RoleTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        Mount::query()->where('name', 'like', 'apitest%')->delete();
    }

    public function tearDown(): void
    {
        Mount::query()->where('name', 'like', 'apitest%')->delete();

        parent::tearDown();
    }

    /** @return array<string, mixed> */
    private function input(string $name = 'apitest mount', array $patch = []): array
    {
        return array_merge(['name' => $name, 'description' => 'For tests', 'source' => '/srv/shared', 'target' => '/shared', 'read_only' => true, 'user_mountable' => false], $patch);
    }

    public function testAMountIsMadeListedChangedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());

        $json = $this->postJson('/api/client/admin/mounts', $this->input())->assertStatus(201)->json();
        $id = $json['id'];
        $this->assertNotEmpty($json['uuid']);
        $this->assertTrue($json['read_only']);
        $this->assertFalse($json['user_mountable']);

        $row = collect($this->getJson('/api/client/admin/mounts')->assertOk()->json('mounts'))->firstWhere('id', $id);
        $this->assertSame(['apitest mount', '/srv/shared', '/shared', 0, 0, 0], [$row['name'], $row['source'], $row['target'], $row['eggs'], $row['nodes'], $row['servers']]);

        $this->patchJson('/api/client/admin/mounts/' . $id, $this->input('apitest changed', ['read_only' => false, 'user_mountable' => true]))->assertOk()->assertJsonPath('name', 'apitest changed');
        $mount = Mount::query()->findOrFail($id);
        $this->assertFalse((bool) $mount->read_only);
        $this->assertTrue((bool) $mount->user_mountable);

        $this->deleteJson('/api/client/admin/mounts/' . $id)->assertNoContent();
        $this->assertNull(Mount::query()->find($id));
        $this->getJson('/api/client/admin/mounts/' . $id)->assertStatus(404);
    }

    public function testTheFormIsChecked(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/mounts', $this->input('apitest x', ['name' => '']))->assertStatus(422);
        $this->postJson('/api/client/admin/mounts', $this->input('apitest x', ['source' => '/etc/pterodactyl']))->assertStatus(422);
        $this->postJson('/api/client/admin/mounts', $this->input('apitest x', ['target' => '/home/container']))->assertStatus(422);
        $this->assertSame(0, Mount::query()->where('name', 'apitest x')->count());
    }

    public function testEggsAndNodesAreAddedAndRemoved(): void
    {
        $this->actingAs($this->rootAdmin());
        $id = $this->postJson('/api/client/admin/mounts', $this->input())->json('id');
        $nest = Nest::factory()->create();
        $egg = Egg::factory()->create(['nest_id' => $nest->id, 'author' => 'test@example.com', 'docker_images' => ['Java' => 'ghcr.io/example/java'], 'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}']);
        $node = Node::factory()->create(['location_id' => Location::factory()->create()->id]);

        $this->postJson("/api/client/admin/mounts/$id/eggs", ['eggs' => [$egg->id]])->assertOk()->assertJsonPath('eggs.0.id', $egg->id);
        $this->postJson("/api/client/admin/mounts/$id/eggs", ['eggs' => [$egg->id]])->assertOk();
        $this->postJson("/api/client/admin/mounts/$id/nodes", ['nodes' => [$node->id]])->assertOk()->assertJsonPath('nodes.0.id', $node->id);
        $this->assertSame(1, Mount::query()->findOrFail($id)->eggs()->count(), 'adding twice is fine');
        $this->postJson("/api/client/admin/mounts/$id/nodes", ['nodes' => [999999]])->assertStatus(422);
        $this->postJson("/api/client/admin/mounts/$id/eggs", ['eggs' => []])->assertStatus(422);

        $this->assertSame([$egg->id], collect($this->getJson("/api/client/admin/mounts/$id")->json('eggs'))->pluck('id')->all());

        $this->deleteJson("/api/client/admin/mounts/$id/eggs/{$egg->id}")->assertNoContent();
        $this->deleteJson("/api/client/admin/mounts/$id/nodes/{$node->id}")->assertNoContent();
        $this->assertSame(0, Mount::query()->findOrFail($id)->eggs()->count() + Mount::query()->findOrFail($id)->nodes()->count());
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $mount = Mount::query()->forceCreate(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'name' => 'apitest perms', 'source' => '/srv/x', 'target' => '/x', 'read_only' => false, 'user_mountable' => false]);
        $this->actingAs($this->userWith(['mounts.view']));

        $this->getJson('/api/client/admin/mounts')->assertOk();
        $this->getJson('/api/client/admin/mounts/' . $mount->id)->assertOk();
        $this->getJson('/api/client/admin/lookups/eggs')->assertOk()->assertJsonStructure(['nests']);
        $this->postJson('/api/client/admin/mounts', $this->input())->assertStatus(403);
        $this->patchJson('/api/client/admin/mounts/' . $mount->id, $this->input())->assertStatus(403);
        $this->postJson('/api/client/admin/mounts/' . $mount->id . '/eggs', ['eggs' => [1]])->assertStatus(403);
        $this->deleteJson('/api/client/admin/mounts/' . $mount->id)->assertStatus(403);
        $this->assertNotNull(Mount::query()->find($mount->id));
    }

    public function testThePagesAreTheApp(): void
    {
        $mount = Mount::query()->forceCreate(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'name' => 'apitest page', 'source' => '/srv/y', 'target' => '/y', 'read_only' => false, 'user_mountable' => false]);
        $this->actingAs($this->userWith(['mounts.view']));

        foreach (['/admin/mounts', '/admin/mounts/view/' . $mount->id] as $uri) {
            $this->page($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }
}
