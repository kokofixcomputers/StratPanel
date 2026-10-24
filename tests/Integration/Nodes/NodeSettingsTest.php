<?php

namespace Pterodactyl\Tests\Integration\Nodes;

use Mockery;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Location;
use Pterodactyl\Services\Nodes\NodeUpdateService;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonConfigurationRepository;

class NodeSettingsTest extends IntegrationTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        // The admin layout prints how long the request took.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }
    }

    private function node(array $extra = []): Node
    {
        return Node::factory()->create(array_merge([
            'fqdn' => 'cpu-test-' . bin2hex(random_bytes(3)) . '.example.com',
            'location_id' => Location::query()->first()?->id ?? Location::factory()->create()->id,
        ], $extra));
    }

    /** What Wings is told when the settings are saved, caught instead of sent. */
    private function catchWingsUpdate(): \ArrayObject
    {
        $sent = new \ArrayObject();
        $repository = Mockery::mock(DaemonConfigurationRepository::class);
        $repository->shouldReceive('setNode')->andReturnSelf();
        $repository->shouldReceive('update')->andReturnUsing(function (Node $node) use ($sent) {
            $sent['configuration'] = $node->getConfiguration();

            return new \GuzzleHttp\Psr7\Response(200);
        });
        $this->app->instance(DaemonConfigurationRepository::class, $repository);

        return $sent;
    }

    public function testTheConfigurationHandedToWingsCarriesTheBurstSetting(): void
    {
        $node = $this->node(['cpu_burst_enabled' => false, 'cpu_burst_percent' => 40]);

        $this->assertSame(['enabled' => false, 'percent' => 40], $node->getConfiguration()['docker']['cpu_burst']);
        $this->assertStringContainsString('cpu_burst', $node->getYamlConfiguration());
    }

    public function testNodesBurstByDefaultLikeWingsAlwaysDid(): void
    {
        $node = $this->node();

        $this->assertTrue($node->fresh()->cpu_burst_enabled);
        $this->assertSame(100, $node->fresh()->cpu_burst_percent);
    }

    public function testSavingTheSettingsOfANodeStillWorksAndTellsWings(): void
    {
        $sent = $this->catchWingsUpdate();
        $node = $this->node();
        $root = User::factory()->create(['root_admin' => true]);

        $this->actingAs($root)->patchJson("/api/client/admin/nodes/{$node->id}", [
            'name' => 'Renamed node',
            'description' => 'x',
            'location_id' => $node->location_id,
            'public' => 1,
            'fqdn' => $node->fqdn,
            'scheme' => 'http',
            'behind_proxy' => 0,
            'maintenance_mode' => 0,
            'memory' => $node->memory,
            'memory_overallocate' => 0,
            'disk' => $node->disk,
            'disk_overallocate' => 0,
            'upload_size' => 100,
            'daemonBase' => $node->daemonBase,
            'daemonSFTP' => 2022,
            'daemonListen' => 8080,
            'cpu_burst_enabled' => 0,
            'cpu_burst_percent' => 60,
        ])->assertOk()->assertJsonPath('name', 'Renamed node')->assertJsonPath('cpu_burst_percent', 60);

        $fresh = $node->fresh();
        $this->assertSame('Renamed node', $fresh->name);
        $this->assertFalse($fresh->cpu_burst_enabled);
        $this->assertSame(60, $fresh->cpu_burst_percent);
        $this->assertSame(['enabled' => false, 'percent' => 60], $sent['configuration']['docker']['cpu_burst']);
    }

    public function testTheBurstShareHasToBeBetweenOneAndAHundred(): void
    {
        $this->catchWingsUpdate();
        $node = $this->node();
        $root = User::factory()->create(['root_admin' => true]);

        foreach ([0, 101, -3] as $bad) {
            $this->actingAs($root)->patchJson("/api/client/admin/nodes/{$node->id}", [
                'name' => $node->name, 'location_id' => $node->location_id, 'fqdn' => $node->fqdn, 'scheme' => 'http',
                'memory' => $node->memory, 'memory_overallocate' => 0, 'disk' => $node->disk, 'disk_overallocate' => 0,
                'daemonSFTP' => 2022, 'daemonListen' => 8080, 'cpu_burst_enabled' => 1, 'cpu_burst_percent' => $bad,
            ])->assertStatus(422)->assertJsonFragment(['source_field' => 'cpu_burst_percent']);
        }
        $this->assertSame(100, $node->fresh()->cpu_burst_percent);
    }

    public function testTheNodeSaysItsBurstSetting(): void
    {
        $node = $this->node(['cpu_burst_percent' => 55]);
        $root = User::factory()->create(['root_admin' => true]);

        $this->actingAs($root)->get("/admin/nodes/view/{$node->id}/settings")->assertOk()->assertSee('<div id="app"></div>', false);
        $this->actingAs($root)->getJson("/api/client/admin/nodes/{$node->id}")->assertOk()->assertJsonPath('cpu_burst_percent', 55)->assertJsonPath('cpu_burst_enabled', true);
    }

    public function testTheServiceKeepsItsOwnName(): void
    {
        // Not the same class as the one that updates Wings itself (that one is WingsUpdateService).
        $this->assertTrue(method_exists(NodeUpdateService::class, 'handle'));
        $this->assertFalse(method_exists(NodeUpdateService::class, 'latest'));
    }
}
