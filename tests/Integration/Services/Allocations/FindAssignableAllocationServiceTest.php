<?php

namespace Pterodactyl\Tests\Integration\Services\Allocations;

use Pterodactyl\Models\Allocation;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Services\Allocations\FindAssignableAllocationService;
use Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException;

class FindAssignableAllocationServiceTest extends IntegrationTestCase
{
    /**
     * Test that a free allocation of the node is assigned to the server.
     */
    public function testFreeAllocationIsAssigned()
    {
        $server = $this->createServerModel();

        $created = Allocation::factory()->create([
            'node_id' => $server->node_id,
            'ip' => $server->allocation->ip,
        ]);

        $response = $this->getService()->handle($server);

        $this->assertSame($created->id, $response->id);
        $this->assertSame($server->allocation->ip, $response->ip);
        $this->assertSame($server->node_id, $response->node_id);
        $this->assertSame($server->id, $response->server_id);
        $this->assertNotSame($server->allocation_id, $response->id);
    }

    /**
     * Test that an allocation on the IP address of the server wins over one on another address.
     */
    public function testAllocationOnTheSameIpIsPreferred()
    {
        $server = $this->createServerModel();

        Allocation::factory()->times(5)->create(['node_id' => $server->node_id, 'ip' => '203.0.113.9']);
        $same = Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => $server->allocation->ip]);

        $this->assertSame($same->id, $this->getService()->handle($server)->id);
    }

    /**
     * Test that a free allocation on another IP address of the node is used when there is none on the server's own.
     */
    public function testAllocationOnAnotherIpIsUsedWhenNothingElseIsFree()
    {
        $server = $this->createServerModel();

        $other = Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => '203.0.113.9']);

        $this->assertSame($other->id, $this->getService()->handle($server)->id);
    }

    /**
     * Test that allocations that belong to other nodes or other servers are never taken.
     */
    public function testExceptionIsThrownIfTheNodeHasNothingFree()
    {
        $server = $this->createServerModel();

        Allocation::factory()->create(['ip' => $server->allocation->ip]);

        $this->expectException(NoAutoAllocationSpaceAvailableException::class);
        $this->expectExceptionMessage('Cannot assign additional allocation: no more space available on node.');

        $this->getService()->handle($server);
    }

    private function getService(): FindAssignableAllocationService
    {
        return $this->app->make(FindAssignableAllocationService::class);
    }
}
