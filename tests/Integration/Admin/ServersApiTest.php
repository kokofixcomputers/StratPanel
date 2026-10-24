<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Mount;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class ServersApiTest extends RoleTestCase
{
    use CreatesTestModels;

    private function server(array $patch = []): Server
    {
        $owner = $patch['owner'] ?? $this->makeUser();
        unset($patch['owner']);

        return $this->createServerModel(array_merge(['owner_id' => $owner->id, 'egg_id' => Egg::query()->firstOrFail()->id, 'name' => 'apitest server'], $patch));
    }

    private function daemon(): \Mockery\MockInterface
    {
        $mock = \Mockery::mock(DaemonServerRepository::class);
        $mock->shouldReceive('setServer')->andReturnSelf();
        $this->app->instance(DaemonServerRepository::class, $mock);

        return $mock;
    }

    public function tearDown(): void
    {
        Server::query()->where('name', 'like', 'apitest%')->delete();

        parent::tearDown();
    }

    public function testThePagesAreTheApp(): void
    {
        $server = $this->server();
        $this->actingAs($this->rootAdmin());

        foreach (['', '/new', '/view/' . $server->id, '/view/' . $server->id . '/details', '/view/' . $server->id . '/build', '/view/' . $server->id . '/startup', '/view/' . $server->id . '/database', '/view/' . $server->id . '/mounts', '/view/' . $server->id . '/domains', '/view/' . $server->id . '/manage', '/view/' . $server->id . '/delete'] as $path) {
            $this->get('/admin/servers' . $path)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testAServerThatIsNotInstalledOnlyHasTheFewPages(): void
    {
        $server = $this->server(['status' => Server::STATUS_INSTALLING]);
        $this->actingAs($this->rootAdmin());

        $this->get('/admin/servers/view/' . $server->id)->assertOk();
        $this->get('/admin/servers/view/' . $server->id . '/build')->assertStatus(403);
        $this->get('/admin/servers/view/' . $server->id . '/manage')->assertOk();
    }

    public function testTheListCanBeSearchedAndFilteredByOwner(): void
    {
        $owner = $this->makeUser(['username' => 'ownerone']);
        $a = $this->server(['owner' => $owner, 'name' => 'apitest alpha']);
        $this->server(['name' => 'apitest beta']);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/servers?search=alpha')->assertOk()->json();
        $this->assertSame([$a->id], array_column($json['servers'], 'id'));
        $this->assertSame('active', $json['servers'][0]['state']);
        $this->assertSame('ownerone', $json['servers'][0]['owner']['username']);

        $this->assertSame([$a->id], array_column($this->getJson('/api/client/admin/servers?owner_id=' . $owner->id)->json('servers'), 'id'));
    }

    public function testTheFormHasTheNodesAndTheEggsWithTheirVariables(): void
    {
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/servers/form')->assertOk()->json();
        $this->assertNotEmpty($json['nests']);
        $this->assertArrayHasKey('docker_images', $json['nests'][0]['eggs'][0]);
        $this->assertArrayHasKey('variables', $json['nests'][0]['eggs'][0]);
        $this->assertArrayHasKey('locations', $json);
    }

    public function testThePeopleCanBeFoundForTheOwnerField(): void
    {
        $person = $this->makeUser(['username' => 'findableone']);
        $this->actingAs($this->userWith(['servers.create']));

        $this->getJson('/api/client/admin/lookups/people?search=findable')->assertOk()->assertJsonPath('people.0.username', 'findableone');
        $this->getJson('/api/client/admin/lookups/people?user_id=' . $person->id)->assertOk()->assertJsonPath('people.0.id', $person->id);
        $this->getJson('/api/client/admin/lookups/people')->assertOk()->assertJsonPath('people', []);
    }

    public function testTheDetailsAreChangedAndTheExternalIdStaysUnique(): void
    {
        $server = $this->server(['external_id' => 'first-external-id']);
        $other = $this->server(['external_id' => 'duplicate-external-id']);
        $this->actingAs($this->rootAdmin());
        $body = ['external_id' => $server->external_id, 'owner_id' => $server->owner_id, 'name' => 'apitest renamed', 'description' => 'Hi'];

        $this->patchJson('/api/client/admin/servers/' . $server->id, array_merge($body, ['external_id' => $other->external_id]))->assertStatus(422);
        $this->assertSame('first-external-id', $server->refresh()->external_id);

        $this->patchJson('/api/client/admin/servers/' . $server->id, $body)->assertOk()->assertJsonPath('name', 'apitest renamed');
    }

    public function testTheBuildIsReadAndChanged(): void
    {
        $server = $this->server();
        $this->daemon()->shouldReceive('sync')->andReturnNull();
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson("/api/client/admin/servers/{$server->id}/build")->assertOk()->json();
        $this->assertSame($server->allocation_id, $json['allocation_id']);
        $this->assertContains($server->allocation_id, array_column($json['assigned'], 'id'));

        $this->patchJson("/api/client/admin/servers/{$server->id}/build", [
            'allocation_id' => $server->allocation_id, 'memory' => 2048, 'swap' => 0, 'io' => 500, 'cpu' => 200, 'threads' => '', 'disk' => 4096,
            'database_limit' => 1, 'allocation_limit' => 2, 'backup_limit' => 3, 'oom_disabled' => true,
        ])->assertOk()->assertJsonPath('memory', 2048)->assertJsonPath('backup_limit', 3);

        $this->patchJson("/api/client/admin/servers/{$server->id}/build", ['allocation_id' => $server->allocation_id, 'memory' => -5, 'swap' => 0, 'io' => 500, 'cpu' => 0, 'disk' => 0])->assertStatus(422);
    }

    public function testTheStartupIsReadAndChanged(): void
    {
        $server = $this->server();
        $this->daemon()->shouldReceive('sync')->andReturnNull();
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson("/api/client/admin/servers/{$server->id}/startup")->assertOk()->json();
        $this->assertSame($server->egg_id, $json['egg_id']);
        $this->assertNotEmpty($json['nests']);

        $this->patchJson("/api/client/admin/servers/{$server->id}/startup", [
            'startup' => 'java -jar changed.jar', 'nest_id' => $server->nest_id, 'egg_id' => $server->egg_id, 'docker_image' => $server->image, 'environment' => [], 'skip_scripts' => false,
        ])->assertOk()->assertJsonPath('startup', 'java -jar changed.jar');
    }

    public function testMountsAreAddedAndRemoved(): void
    {
        $server = $this->server();
        $mount = Mount::query()->forceCreate(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'name' => 'apitest mount', 'source' => '/srv/x', 'target' => '/x', 'read_only' => false, 'user_mountable' => false]);
        $mount->eggs()->attach($server->egg_id);
        $mount->nodes()->attach($server->node_id);
        $this->actingAs($this->rootAdmin());
        $base = "/api/client/admin/servers/{$server->id}/mounts";

        $this->assertFalse(collect($this->getJson($base)->assertOk()->json('mounts'))->firstWhere('id', $mount->id)['mounted']);
        $this->assertTrue(collect($this->postJson($base, ['mount_id' => $mount->id])->assertOk()->json('mounts'))->firstWhere('id', $mount->id)['mounted']);
        $this->assertFalse(collect($this->deleteJson($base . '/' . $mount->id)->assertOk()->json('mounts'))->firstWhere('id', $mount->id)['mounted']);

        $mount->delete();
    }

    public function testDomainsAreAddedAndRemovedWithinTheRules(): void
    {
        config(['pterodactyl.domains.enabled' => true]);
        $server = $this->server();
        $this->actingAs($this->rootAdmin());
        $base = "/api/client/admin/servers/{$server->id}/domains";

        $json = $this->postJson($base, ['domain' => 'Play.Example.com.', 'allocation_id' => $server->allocation_id])->assertStatus(201)->json();
        $this->assertSame('play.example.com', $json['domains'][0]['domain']);
        $this->assertSame($server->allocation_id, $json['allocations'][0]['id']);

        $this->postJson($base, ['domain' => 'play.example.com', 'allocation_id' => $server->allocation_id])->assertStatus(422);
        $this->postJson($base, ['domain' => 'nonsense', 'allocation_id' => $server->allocation_id])->assertStatus(422);
        $this->postJson($base, ['domain' => 'other.example.com', 'allocation_id' => 999999])->assertStatus(400);

        $this->deleteJson($base . '/' . ServerDomain::query()->firstOrFail()->id)->assertOk()->assertJsonPath('domains', []);
        config(['pterodactyl.domains.enabled' => false]);
        $this->postJson($base, ['domain' => 'again.example.com', 'allocation_id' => $server->allocation_id])->assertStatus(400);
    }

    public function testReinstallingSuspendingAndTheInstallStatus(): void
    {
        $server = $this->server();
        $daemon = $this->daemon();
        $daemon->shouldReceive('reinstall')->once();
        $daemon->shouldReceive('sync')->andReturnNull();
        $this->actingAs($this->rootAdmin());
        $base = "/api/client/admin/servers/{$server->id}/manage";

        $this->getJson($base)->assertOk()->assertJsonPath('installed', true)->assertJsonPath('suspended', false);
        $this->postJson($base . '/reinstall')->assertOk()->assertJsonPath('installed', false);
        $this->postJson($base . '/toggle')->assertOk()->assertJsonPath('installed', true);
        $this->postJson($base . '/suspension', ['action' => 'suspend'])->assertOk()->assertJsonPath('suspended', true);
        $this->postJson($base . '/suspension', ['action' => 'unsuspend'])->assertOk()->assertJsonPath('suspended', false);
        $this->postJson($base . '/suspension', ['action' => 'whatever'])->assertStatus(422);
    }

    public function testAServerThatSkipsItsScriptsIsNotReinstalled(): void
    {
        $server = $this->server(['skip_scripts' => true]);
        $this->daemon()->shouldReceive('reinstall')->never();
        $this->actingAs($this->rootAdmin());

        $this->postJson("/api/client/admin/servers/{$server->id}/manage/reinstall")->assertStatus(400);
        $this->assertNull($server->refresh()->status);
    }

    public function testAServerIsDeleted(): void
    {
        $server = $this->server();
        $this->daemon()->shouldReceive('delete')->andReturnNull();
        $this->actingAs($this->rootAdmin());

        $this->deleteJson("/api/client/admin/servers/{$server->id}", ['force' => true])->assertNoContent();
        $this->assertNull(Server::query()->find($server->id));
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $server = $this->server();
        $this->actingAs($this->userWith(['servers.view']));
        $base = "/api/client/admin/servers/{$server->id}";

        $this->getJson('/api/client/admin/servers')->assertOk();
        $this->getJson($base)->assertOk();
        foreach (['build', 'startup', 'databases', 'mounts', 'domains', 'manage'] as $part) {
            $this->getJson("$base/$part")->assertOk();
        }
        $this->getJson('/api/client/admin/servers/form')->assertStatus(403);
        $this->postJson('/api/client/admin/servers', [])->assertStatus(403);
        $this->patchJson($base, ['name' => 'apitest no'])->assertStatus(403);
        $this->deleteJson($base)->assertStatus(403);
        $this->patchJson("$base/build", [])->assertStatus(403);
        $this->patchJson("$base/startup", [])->assertStatus(403);
        $this->postJson("$base/databases", [])->assertStatus(403);
        $this->postJson("$base/mounts", [])->assertStatus(403);
        $this->postJson("$base/domains", [])->assertStatus(403);
        $this->postJson("$base/manage/reinstall")->assertStatus(403);
        $this->postJson("$base/manage/suspension", ['action' => 'suspend'])->assertStatus(403);
        $this->postJson("$base/manage/transfer", [])->assertStatus(403);
        $this->assertNotNull(Server::query()->find($server->id));
    }
}
