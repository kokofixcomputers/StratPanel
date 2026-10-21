<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Illuminate\Support\Str;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\ServerDomain;

class ServerDomainsAttributeTest extends ClientApiIntegrationTestCase
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

    public function testTheServerListsTheNamesPlayersCanUse(): void
    {
        [$user, $server] = $this->generateTestAccount();

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}")->assertOk()->assertJsonPath('attributes.domains', []);

        foreach (['play.example.com', 'survival.example.org'] as $name) {
            ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => $name]);
        }

        $this->getJson("/api/client/servers/{$server->uuid}")->assertJsonPath('attributes.domains', ['play.example.com', 'survival.example.org']);
        // The list of servers carries them too.
        $this->getJson('/api/client')->assertOk()->assertJsonPath('data.0.attributes.domains', ['play.example.com', 'survival.example.org']);
    }
}
