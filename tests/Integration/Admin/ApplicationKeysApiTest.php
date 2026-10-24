<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\ApiKey;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class ApplicationKeysApiTest extends RoleTestCase
{
    public function testThePagesAreTheApp(): void
    {
        $this->actingAs($this->rootAdmin());

        foreach (['/admin/api', '/admin/api/new'] as $uri) {
            $this->get($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testAKeyIsMadeListedAndRevoked(): void
    {
        $me = $this->rootAdmin();
        $this->actingAs($me);

        $resources = $this->getJson('/api/client/admin/application-keys/resources')->assertOk()->json();
        $this->assertContains('servers', $resources['resources']);
        $this->assertSame(['none' => 0, 'read' => 1, 'write' => 3], $resources['levels']);

        $body = ['memo' => 'for tests'];
        foreach ($resources['resources'] as $resource) {
            $body['r_' . $resource] = $resource === 'servers' ? 3 : 0;
        }
        $this->postJson('/api/client/admin/application-keys', $body)->assertStatus(201);
        $this->postJson('/api/client/admin/application-keys', ['memo' => ''])->assertStatus(422);

        $keys = $this->getJson('/api/client/admin/application-keys')->assertOk()->json('keys');
        $this->assertCount(1, $keys);
        $this->assertSame('for tests', $keys[0]['memo']);
        $this->assertSame($me->username, $keys[0]['user']['username']);
        $this->assertGreaterThan(16, strlen($keys[0]['key']), 'the person who made it sees all of it');
        $this->assertSame(3, ApiKey::query()->firstOrFail()->r_servers);

        // Anyone else sees only where it starts.
        $this->actingAs($this->rootAdmin());
        $this->assertStringEndsWith('****', $this->getJson('/api/client/admin/application-keys')->json('keys.0.key'));

        $this->deleteJson('/api/client/admin/application-keys/' . $keys[0]['identifier'])->assertNoContent();
        $this->assertSame(0, ApiKey::query()->count());
    }
}
