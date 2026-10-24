<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\Node;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class NodesApiTest extends RoleTestCase
{
    private Location $location;

    public function setUp(): void
    {
        parent::setUp();

        $this->location = Location::factory()->create(['short' => 'apitest' . bin2hex(random_bytes(2))]);
    }

    public function tearDown(): void
    {
        Node::query()->where('name', 'like', 'apitest%')->get()->each(fn (Node $node) => $node->delete());
        $this->location->delete();

        parent::tearDown();
    }

    private function node(array $patch = []): Node
    {
        return Node::factory()->create(array_merge(['name' => 'apitest node', 'location_id' => $this->location->id], $patch));
    }

    /** @return array<string, mixed> */
    private function input(array $patch = []): array
    {
        return array_merge([
            'name' => 'apitest made', 'description' => 'x', 'location_id' => $this->location->id, 'public' => true, 'fqdn' => '127.0.0.1', 'scheme' => 'http',
            'behind_proxy' => false, 'maintenance_mode' => false, 'memory' => 8192, 'memory_overallocate' => 0, 'disk' => 51200, 'disk_overallocate' => 0,
            'upload_size' => 100, 'daemonBase' => '/var/lib/pterodactyl/volumes', 'daemonSFTP' => 2022, 'daemonListen' => 8080, 'cpu_burst_enabled' => true, 'cpu_burst_percent' => 100,
        ], $patch);
    }

    public function testThePagesAreTheApp(): void
    {
        $node = $this->node();
        $this->actingAs($this->rootAdmin());

        foreach (['', '/new', '/view/' . $node->id, '/view/' . $node->id . '/settings', '/view/' . $node->id . '/configuration', '/view/' . $node->id . '/allocation', '/view/' . $node->id . '/servers', '/view/' . $node->id . '/certificate'] as $path) {
            $this->get('/admin/nodes' . $path)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testTheListCanBeSearched(): void
    {
        $this->node(['name' => 'apitest alpha']);
        $this->node(['name' => 'apitest beta']);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/nodes?search=alpha')->assertOk()->json();
        $this->assertSame(['apitest alpha'], array_column($json['nodes'], 'name'));
        $this->assertSame($this->location->short, $json['nodes'][0]['location']);
        $this->assertSame(1, $json['pagination']['total']);
    }

    public function testANodeIsMadeChangedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());

        $form = $this->getJson('/api/client/admin/nodes/form')->assertOk()->json();
        $this->assertContains($this->location->id, array_column($form['locations'], 'id'));

        $json = $this->postJson('/api/client/admin/nodes', $this->input())->assertStatus(201)->json();
        $id = $json['id'];
        $this->assertSame('apitest made', $json['name']);
        $this->assertSame(0, $json['servers']);
        $this->assertSame(8192, $json['usage']['memory']['max']);
        $this->postJson('/api/client/admin/nodes', $this->input(['name' => '']))->assertStatus(422);

        $secret = Node::query()->findOrFail($id)->daemon_token;
        $this->mock(\Pterodactyl\Repositories\Wings\DaemonConfigurationRepository::class, fn ($mock) => $mock->shouldReceive('setNode')->andReturnSelf()->shouldReceive('update')->andReturn(new \GuzzleHttp\Psr7\Response()));
        $this->patchJson('/api/client/admin/nodes/' . $id, $this->input(['name' => 'apitest changed', 'reset_secret' => true]))->assertOk()->assertJsonPath('name', 'apitest changed');
        $this->assertNotSame($secret, Node::query()->findOrFail($id)->daemon_token);

        $this->deleteJson('/api/client/admin/nodes/' . $id)->assertNoContent();
        $this->assertNull(Node::query()->find($id));
    }

    public function testTheConfigurationIsTheYamlOfTheNode(): void
    {
        $node = $this->node();
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/nodes/' . $node->id . '/configuration')->assertOk()->assertJsonPath('panel_url', config('app.url'))
            ->assertJsonPath('yaml', $node->getYamlConfiguration());
    }

    public function testAnUnreachableNodeIsAnAnswerNotAnError(): void
    {
        $node = $this->node(['fqdn' => '127.0.0.1', 'scheme' => 'http', 'daemonListen' => 1]);
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/nodes/' . $node->id . '/system-information')->assertOk()->assertJsonPath('online', false);
    }

    public function testAllocationsAreAddedAliasedAndRemoved(): void
    {
        $node = $this->node();
        $this->actingAs($this->rootAdmin());
        $base = '/api/client/admin/nodes/' . $node->id;

        $json = $this->postJson($base . '/allocations', ['allocation_ip' => '10.10.0.5', 'allocation_alias' => 'play.example.com', 'allocation_ports' => ['25565', '25570-25572']])->assertOk()->json();
        $this->assertSame(4, $json['pagination']['total']);
        $this->assertSame(['10.10.0.5'], $json['ips']);
        $this->assertSame('play.example.com', $json['allocations'][0]['ip_alias']);

        $first = Allocation::query()->where('node_id', $node->id)->orderBy('port')->first();
        $this->postJson($base . '/allocations/alias', ['allocation_id' => $first->id, 'alias' => 'new.example.com'])->assertNoContent();
        $this->assertSame('new.example.com', $first->fresh()->ip_alias);
        $this->postJson($base . '/allocations/alias', ['allocation_id' => $first->id, 'alias' => ''])->assertNoContent();
        $this->assertNull($first->fresh()->ip_alias);

        $this->deleteJson($base . '/allocations/' . $first->id)->assertNoContent();
        $ids = Allocation::query()->where('node_id', $node->id)->orderBy('port')->limit(2)->pluck('id')->all();
        $this->deleteJson($base . '/allocations', ['allocations' => $ids])->assertNoContent();
        $this->assertSame(1, Allocation::query()->where('node_id', $node->id)->count());

        $this->postJson($base . '/allocations/remove-block', ['ip' => '10.10.0.5'])->assertNoContent();
        $this->assertSame(0, Allocation::query()->where('node_id', $node->id)->count());
        $this->postJson($base . '/allocations', ['allocation_ip' => '10.10.0.5', 'allocation_ports' => []])->assertStatus(422);
    }

    public function testAnAllocationOfAnotherNodeIsNotTouched(): void
    {
        $one = $this->node();
        $two = $this->node(['name' => 'apitest two']);
        $other = Allocation::factory()->create(['node_id' => $two->id, 'ip' => '10.10.1.1', 'port' => 25565]);
        $this->actingAs($this->rootAdmin());

        $this->deleteJson('/api/client/admin/nodes/' . $one->id . '/allocations/' . $other->id)->assertNotFound();
        $this->assertNotNull($other->fresh());
    }

    public function testTheServersOfANodeAreListed(): void
    {
        $node = $this->node();
        $this->actingAs($this->rootAdmin());

        $this->getJson('/api/client/admin/nodes/' . $node->id . '/servers')->assertOk()->assertJsonPath('servers', [])->assertJsonPath('pagination.total', 0);
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $node = $this->node();
        $this->actingAs($this->userWith(['nodes.view']));
        $base = '/api/client/admin/nodes/' . $node->id;

        $this->getJson('/api/client/admin/nodes')->assertOk();
        $this->getJson($base)->assertOk();
        $this->getJson($base . '/allocations')->assertOk();
        $this->getJson($base . '/servers')->assertOk();
        $this->getJson($base . '/certificate')->assertOk();
        $this->postJson('/api/client/admin/nodes', $this->input())->assertStatus(403);
        $this->patchJson($base, $this->input())->assertStatus(403);
        $this->deleteJson($base)->assertStatus(403);
        $this->getJson($base . '/configuration')->assertStatus(403);
        $this->postJson($base . '/configuration/token')->assertStatus(403);
        $this->postJson($base . '/allocations', ['allocation_ip' => '10.0.0.1', 'allocation_ports' => ['1']])->assertStatus(403);
        $this->postJson($base . '/update')->assertStatus(403);
        $this->assertNotNull(Node::query()->find($node->id));
    }
}
