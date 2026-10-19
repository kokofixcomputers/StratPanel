<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Illuminate\Support\Str;
use Pterodactyl\Models\Egg;

class CpuBurstAttributeTest extends ClientApiIntegrationTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        // The test helpers build servers on the BungeeCord egg, which this panel does not ship: borrow the first egg for it.
        if (!Egg::query()->where('author', 'support@pterodactyl.io')->where('name', 'Bungeecord')->exists()) {
            $egg = Egg::query()->firstOrFail()->replicate();
            $egg->forceFill(['uuid' => (string) Str::uuid(), 'author' => 'support@pterodactyl.io', 'name' => 'Bungeecord'])->save();
        }
    }

    public function testTheServerSaysWhetherItsNodeLetsItBurst(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $server->update(['cpu' => 200]);
        $server->node->update(['cpu_burst_enabled' => true, 'cpu_burst_percent' => 50]);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}")
            ->assertOk()
            ->assertJsonPath('attributes.cpu_burst.enabled', true)
            ->assertJsonPath('attributes.cpu_burst.percent', 50);

        // Switched off on the node.
        $server->node->update(['cpu_burst_enabled' => false]);
        $this->getJson("/api/client/servers/{$server->uuid}")->assertJsonPath('attributes.cpu_burst.enabled', false);

        // A server without a CPU limit has nothing to burst above.
        $server->node->update(['cpu_burst_enabled' => true]);
        $server->update(['cpu' => 0]);
        $this->getJson("/api/client/servers/{$server->uuid}")->assertJsonPath('attributes.cpu_burst.enabled', false);
    }
}
