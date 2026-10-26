<?php

namespace Pterodactyl\Tests\Integration\Split;

use Mockery\MockInterface;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** Splitting a server into parts that share its resources. */
class SplitTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    private Egg $egg;

    public function setUp(): void
    {
        parent::setUp();

        $nest = Nest::factory()->create();
        $this->egg = Egg::factory()->create([
            'nest_id' => $nest->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);

        $this->daemon = \Mockery::mock(DaemonServerRepository::class);
        $this->daemon->shouldReceive('setServer')->andReturnSelf();
        $this->daemon->shouldReceive('create')->andReturnNull();
        $this->daemon->shouldReceive('sync')->andReturnNull();
        $this->daemon->shouldReceive('delete')->andReturnNull();
        $this->swap(DaemonServerRepository::class, $this->daemon);
    }

    private function serverFor(User $user, int $memory = 4096, int $disk = 10240, int $cpu = 200, int $free = 4): Server
    {
        $server = $this->createServerModel(['owner_id' => $user->id, 'memory' => $memory, 'disk' => $disk, 'cpu' => $cpu, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        Allocation::factory()->times($free)->create(['node_id' => $server->node_id]);

        return $server;
    }

    private function n(string $name): string
    {
        static $suffix;
        $suffix ??= bin2hex(random_bytes(3));

        return $name . '-' . $suffix . '-' . $this->name();
    }

    private function url(Server $server): string
    {
        return '/api/client/servers/' . $server->uuidShort . '/split';
    }

    private function shares(Server $server): array
    {
        $out = [];
        foreach ($this->getJson($this->url($server))->json('parts') as $part) {
            $out[$part['name']] = [$part['memory'], $part['disk'], $part['cpu']];
        }

        return $out;
    }

    public function testASingleServerIsOnePartWithTheTotal(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);

        $this->getJson($this->url($server))->assertOk()
            ->assertJsonPath('total', ['memory' => 4096, 'disk' => 10240, 'cpu' => 200])
            ->assertJsonPath('splittable', true)
            ->assertJsonCount(1, 'parts');
    }

    public function testSplittingTakesTheShareFromTheFirstServer(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);

        $this->postJson($this->url($server), ['name' => $this->n('Lobby'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])
            ->assertStatus(201)->assertJsonCount(2, 'parts')
            ->assertJsonPath('total', ['memory' => 4096, 'disk' => 10240, 'cpu' => 200]);

        $child = Server::query()->where('name', $this->n('Lobby'))->firstOrFail();
        $child->forceFill(['status' => null])->save();
        $this->assertSame($server->id, $child->parent_server_id);
        $this->assertSame($user->id, $child->owner_id);
        $this->assertSame($server->node_id, $child->node_id);
        $this->assertSame([1024, 2048, 50], [$child->memory, $child->disk, $child->cpu]);
        $server->refresh();
        $this->assertSame([3072, 8192, 150], [$server->memory, $server->disk, $server->cpu]);

        // The part shows the same family.
        $this->getJson($this->url($child))->assertOk()->assertJsonPath('root', $server->uuidShort)->assertJsonPath('is_part', true)->assertJsonCount(2, 'parts');
    }

    public function testAPartIsMadeFromTheEggOfTheCreationWizardNotTheOneOfTheFirstServer(): void
    {
        $user = User::factory()->create();
        $paper = Egg::factory()->create([
            'nest_id' => $this->egg->nest_id, 'name' => 'Paper', 'author' => 'test@example.com', 'docker_images' => ['Java 8' => 'ghcr.io/example/java_8', 'Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}', 'startup' => 'java -jar paper.jar',
        ]);
        $server = $this->createServerModel(['owner_id' => $user->id, 'memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'egg_id' => $paper->id, 'nest_id' => $paper->nest_id]);
        Allocation::factory()->times(2)->create(['node_id' => $server->node_id]);
        config(['pterodactyl.self_service.egg' => $this->egg->id]);
        $this->actingAs($user);

        $this->postJson($this->url($server), ['name' => $this->n('Lobby'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(201);

        $child = Server::query()->where('name', $this->n('Lobby'))->firstOrFail();
        $this->assertSame($this->egg->id, $child->egg_id);
        $this->assertSame('ghcr.io/example/java_21', $child->image);
        $this->assertSame($this->egg->startup, $child->startup);
    }

    public function testTheFirstServerCanNotBeLeftWithTooLittle(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user, 1024, 2048, 100);
        $this->actingAs($user);

        $this->postJson($this->url($server), ['name' => $this->n('Big'), 'memory' => 1024, 'disk' => 1024, 'cpu' => 50])->assertStatus(400);
        $this->postJson($this->url($server), ['name' => $this->n('Tiny'), 'memory' => 100, 'disk' => 1024, 'cpu' => 50])->assertStatus(400);
        $this->assertSame(1, Server::query()->where('owner_id', $user->id)->count());
    }

    public function testAServerWithoutLimitsCanNotBeSplit(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user, 0, 0, 0);
        $this->actingAs($user);

        $this->getJson($this->url($server))->assertJsonPath('splittable', false);
        $this->postJson($this->url($server), ['name' => $this->n('A'), 'memory' => 1024, 'disk' => 1024, 'cpu' => 50])->assertStatus(400);
    }

    public function testAPartIsNotSplitAgain(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);
        $this->postJson($this->url($server), ['name' => $this->n('Lobby'), 'memory' => 2048, 'disk' => 4096, 'cpu' => 100])->assertStatus(201);
        $child = Server::query()->where('name', $this->n('Lobby'))->firstOrFail();
        $child->forceFill(['status' => null])->save();

        // From the page of the part the root is split further, so the part itself stays a part.
        $this->postJson($this->url($child), ['name' => $this->n('Second'), 'memory' => 512, 'disk' => 1024, 'cpu' => 50])->assertStatus(201);
        $this->assertSame($server->id, Server::query()->where('name', $this->n('Second'))->value('parent_server_id'));
    }

    public function testResourcesMoveBetweenParts(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);
        $this->postJson($this->url($server), ['name' => $this->n('A'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(201);
        $this->postJson($this->url($server), ['name' => $this->n('B'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(201);

        $uuids = collect($this->getJson($this->url($server))->json('parts'))->pluck('uuid', 'name');
        $divide = fn (array $shares) => $this->putJson($this->url($server), ['parts' => collect($shares)->map(fn ($s, $name) => ['uuid' => $uuids[$name], 'memory' => $s[0], 'disk' => $s[1], 'cpu' => $s[2]])->values()->all()]);
        $name = $server->name;
        $aA = $this->n('A');
        $aB = $this->n('B');

        // A gives memory to B, the total stays.
        $divide([$name => [2048, 6144, 100], $aA => [512, 2048, 50], $aB => [1536, 2048, 50]])->assertOk();
        $this->assertSame([2048, 6144, 100], $this->shares($server)[$name]);
        $this->assertSame([512, 2048, 50], $this->shares($server)[$aA]);
        $this->assertSame([1536, 2048, 50], $this->shares($server)[$aB]);

        // Not the same total, a part missing and a part below the least are refused.
        $divide([$name => [2048, 6144, 100], $aA => [512, 2048, 50], $aB => [1600, 2048, 50]])->assertStatus(400);
        $divide([$name => [2048, 6144, 100], $aA => [2048, 4096, 100]])->assertStatus(400);
        $divide([$name => [2560, 6144, 100], $aA => [100, 2048, 50], $aB => [1536, 2048, 50]])->assertStatus(400);
        $this->assertSame([512, 2048, 50], $this->shares($server)[$aA]);
    }

    public function testDeletingAPartGivesItsShareBack(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);
        $this->postJson($this->url($server), ['name' => $this->n('A'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(201);
        $child = Server::query()->where('name', $this->n('A'))->firstOrFail();
        $child->forceFill(['status' => null])->save();

        $this->deleteJson($this->url($server) . '/' . $child->uuidShort)->assertOk()->assertJsonCount(1, 'parts');
        $this->assertNull(Server::query()->find($child->id));
        $server->refresh();
        $this->assertSame([4096, 10240, 200], [$server->memory, $server->disk, $server->cpu]);
    }

    public function testOnlyTheOwnerSplits(): void
    {
        $owner = User::factory()->create();
        $server = $this->serverFor($owner);

        $this->actingAs(User::factory()->create());
        $this->postJson($this->url($server), ['name' => $this->n('A'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(404);
    }

    public function testAPartNeedsAnAllocationFromThePool(): void
    {
        config(['pterodactyl.pools' => ['enabled' => true, 'memory' => 4096, 'cpu' => 200, 'disk' => 10240, 'allocations' => 1, 'backups' => 0]]);
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        Allocation::query()->where('id', $server->allocation_id)->update(['server_id' => $server->id]);
        $this->actingAs($user);

        $this->postJson($this->url($server), ['name' => $this->n('A'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(400)
            ->assertSee('allocations', false);
        $this->assertSame(ResourcePool::MINIMUM['memory'], 512);
    }

    public function testTheServerListSaysWhichServersAreSplit(): void
    {
        $user = User::factory()->create();
        $server = $this->serverFor($user);
        $this->actingAs($user);
        $this->postJson($this->url($server), ['name' => $this->n('Lobby'), 'memory' => 1024, 'disk' => 2048, 'cpu' => 50])->assertStatus(201);

        $rows = collect($this->getJson('/api/client')->assertOk()->json('data'))->pluck('attributes', 'attributes.name');
        $this->assertSame(['part_of' => null, 'parts' => 1], $rows[$server->name]['split']);
        $part = $rows[$this->n('Lobby')]['split'];
        $this->assertSame($server->name, $part['part_of']['name']);
        $this->assertSame(0, $part['parts']);
    }
}
