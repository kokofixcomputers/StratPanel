<?php

namespace Pterodactyl\Tests\Integration\Api\Client\Server\Allocation;

use Illuminate\Http\Response;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Permission;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

class CreateNewAllocationTest extends ClientApiIntegrationTestCase
{
    /**
     * Tests that a new allocation can be properly assigned to a server.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('permissionDataProvider')]
    public function testNewAllocationCanBeAssignedToServer(array $permission)
    {
        /** @var \Pterodactyl\Models\Server $server */
        [$user, $server] = $this->generateTestAccount($permission);
        $server->update(['allocation_limit' => 2]);

        // Allocations are taken from the ones the node has free, nothing is created on the fly.
        Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => $server->allocation->ip]);

        $response = $this->actingAs($user)->postJson($this->link($server, '/network/allocations'));
        $response->assertJsonPath('object', Allocation::RESOURCE_NAME);

        $matched = Allocation::query()->findOrFail($response->json('attributes.id'));

        $this->assertSame($server->id, $matched->server_id);
        $this->assertJsonTransformedWith($response->json('attributes'), $matched);
    }

    /**
     * Test that a user without the required permissions cannot create an allocation for
     * the server instance.
     */
    public function testAllocationCannotBeCreatedIfUserDoesNotHavePermission()
    {
        /** @var \Pterodactyl\Models\Server $server */
        [$user, $server] = $this->generateTestAccount([Permission::ACTION_ALLOCATION_UPDATE]);
        $server->update(['allocation_limit' => 2]);

        $this->actingAs($user)->postJson($this->link($server, '/network/allocations'))->assertForbidden();
    }

    /**
     * Test that an allocation cannot be created if the server has reached its allocation limit.
     */
    public function testAllocationCannotBeCreatedIfServerIsAtLimit()
    {
        /** @var \Pterodactyl\Models\Server $server */
        [$user, $server] = $this->generateTestAccount();
        $server->update(['allocation_limit' => 1]);

        $this->actingAs($user)->postJson($this->link($server, '/network/allocations'))
            ->assertStatus(Response::HTTP_BAD_REQUEST)
            ->assertJsonPath('errors.0.code', 'DisplayException')
            ->assertJsonPath('errors.0.detail', 'Cannot assign additional allocations to this server: limit has been reached.');
    }

    public static function permissionDataProvider(): array
    {
        return [[[Permission::ACTION_ALLOCATION_CREATE]], [[]]];
    }
}
