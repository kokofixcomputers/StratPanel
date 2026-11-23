<?php

namespace Pterodactyl\Tests\Integration\Boxes;

use Mockery\MockInterface;
use Pterodactyl\Models\Box;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Services\Store\StoreService;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** Boxes: resources a person owns that their servers share. They work without the store, and servers outside a box are left alone. */
class BoxesTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    private Egg $egg;

    private int $node;

    public function setUp(): void
    {
        parent::setUp();

        $this->egg = Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        config(['pterodactyl.self_service.egg' => $this->egg->id, 'pterodactyl.self_service.skip_scripts' => true]);

        $this->daemon = \Mockery::mock(DaemonServerRepository::class);
        $this->daemon->shouldReceive('setServer')->andReturnSelf();
        $this->daemon->shouldReceive('create')->andReturnNull();
        $this->daemon->shouldReceive('sync')->andReturnNull();
        $this->daemon->shouldReceive('delete')->andReturnNull();
        $this->swap(DaemonServerRepository::class, $this->daemon);

        // A node with ports to give: made with a server of somebody else, which also leaves free allocations behind.
        $seed = $this->createServerModel(['egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        Allocation::factory()->times(12)->create(['node_id' => $seed->node_id]);
        $this->node = $seed->node_id;
    }

    private function admin(): User
    {
        return User::factory()->create(['root_admin' => true]);
    }

    private function n(string $name): string
    {
        static $suffix;
        $suffix ??= bin2hex(random_bytes(3));

        return $name . '-' . $suffix . '-' . $this->name();
    }

    private function box(User $user, array $extra = []): Box
    {
        return $this->app->make(\Pterodactyl\Services\Boxes\BoxService::class)->create($user, $extra + [
            'name' => $this->n('Box'), 'node_id' => $this->node, 'memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'allocations' => 4, 'backups' => 3, 'databases' => 2,
        ]);
    }

    private function share(array $over = []): array
    {
        return $over + ['memory' => 1024, 'disk' => 2048, 'cpu' => 50, 'allocations' => 1, 'backups' => 1, 'databases' => 0];
    }

    public function testAnAdminMakesABoxForAPersonWithoutAnyPayment(): void
    {
        $person = User::factory()->create();
        $this->actingAs($this->admin());

        $response = $this->postJson('/api/client/admin/boxes', ['user_id' => $person->id, 'name' => $this->n('Gift'), 'memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'allocations' => 3, 'backups' => 2, 'databases' => 1])
            ->assertStatus(201)->assertJsonPath('owner.id', $person->id)->assertJsonPath('source', 'admin')->assertJsonPath('limits.memory', 4096)->assertJsonPath('remaining.disk', 10240);

        $this->assertDatabaseHas('boxes', ['uuid' => $response->json('id'), 'user_id' => $person->id, 'source' => 'admin']);
    }

    public function testAPersonSeesTheirOwnBoxesOnly(): void
    {
        [$mine, $other] = [User::factory()->create(), User::factory()->create()];
        $box = $this->box($mine);
        $this->box($other);

        $this->actingAs($mine)->getJson('/api/client/boxes')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $box->uuid);
        $this->actingAs($mine)->getJson('/api/client/boxes/' . $box->uuid)->assertOk()->assertJsonPath('name', $box->name);
        $this->actingAs($other)->getJson('/api/client/boxes/' . $box->uuid)->assertStatus(403);
        // An admin opens it the way its owner sees it.
        $this->actingAs($this->admin())->getJson('/api/client/boxes/' . $box->uuid)->assertOk()->assertJsonPath('owner.id', $mine->id);
    }

    public function testAServerInABoxTakesItsShareAndTheRestStaysInTheBox(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user);

        $this->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Lobby'), 'allocations' => 2]))
            ->assertStatus(201)->assertJsonPath('used.memory', 1024)->assertJsonPath('remaining.memory', 3072)->assertJsonPath('used.allocations', 2)->assertJsonCount(1, 'servers_list');

        $server = Server::query()->where('box_id', $box->id)->firstOrFail();
        $this->assertSame($user->id, $server->owner_id);
        $this->assertSame($this->node, $server->node_id);
        $this->assertSame([1024, 2048, 50, 2, 1, 0], [$server->memory, $server->disk, $server->cpu, $server->allocation_limit, $server->backup_limit, $server->database_limit]);
        $this->assertSame(2, Allocation::query()->where('server_id', $server->id)->count());
    }

    public function testWhatDoesNotFitInTheBoxIsRefused(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user);

        $this->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('A'), 'memory' => 3072]))->assertStatus(201);
        $this->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('B'), 'memory' => 2048]))
            ->assertStatus(400)->assertJsonPath('errors.0.detail', fn ($detail) => str_contains($detail, 'memory') && str_contains($detail, '1 GB'));
        $this->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('C'), 'memory' => 1024]))->assertStatus(201);
        // The box is used up: no memory is left for another.
        $this->assertFalse(app(\Pterodactyl\Services\Boxes\BoxService::class)->canCreateServer($box->refresh()));
    }

    public function testAnotherPersonCannotMakeServersInYourBox(): void
    {
        $box = $this->box(User::factory()->create());

        $this->actingAs(User::factory()->create())->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Sneaky')]))->assertStatus(403);
        $this->assertSame(0, $box->servers()->count());
    }

    public function testServerSharesCanBeChangedWithinTheBox(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user);
        $this->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('One')]))->assertStatus(201);
        $one = Server::query()->where('box_id', $box->id)->firstOrFail();

        // Up to everything that is left, counting what it has already.
        $this->patchJson('/api/client/boxes/' . $box->uuid . '/servers/' . $one->uuid, $this->share(['memory' => 4096]))->assertOk()->assertJsonPath('used.memory', 4096)->assertJsonPath('remaining.memory', 0);
        $this->assertSame(4096, $one->refresh()->memory);
        $this->patchJson('/api/client/boxes/' . $box->uuid . '/servers/' . $one->uuid, $this->share(['memory' => 4608]))->assertStatus(400);
        $this->assertSame(4096, $one->refresh()->memory);
    }

    public function testASuspendedBoxMakesNoServersAndTheBoxCannotShrinkBelowItsServers(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user)->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Keep'), 'memory' => 2048]))->assertStatus(201);

        $this->actingAs($this->admin());
        $this->patchJson('/api/client/admin/boxes/' . $box->id, ['memory' => 1024])->assertStatus(400);
        $this->patchJson('/api/client/admin/boxes/' . $box->id, ['memory' => 8192, 'name' => 'Bigger'])->assertOk()->assertJsonPath('limits.memory', 8192);

        $this->postJson('/api/client/admin/boxes/' . $box->id . '/suspend', ['suspended' => true])->assertOk()->assertJsonPath('status', 'suspended');
        $this->actingAs($user)->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Late')]))->assertStatus(400);
    }

    public function testABoxWithServersIsOnlyDeletedWhenTheyAreLetOutOrDeleted(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user)->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Stay')]))->assertStatus(201);
        $server = Server::query()->where('box_id', $box->id)->firstOrFail();

        $this->actingAs($this->admin());
        $this->deleteJson('/api/client/admin/boxes/' . $box->id)->assertStatus(400);
        $this->deleteJson('/api/client/admin/boxes/' . $box->id, ['servers' => 'detach'])->assertStatus(204);
        $this->assertDatabaseMissing('boxes', ['id' => $box->id]);
        // The server lives on, as one of its own.
        $this->assertNull($server->refresh()->box_id);
    }

    public function testServersInABoxDoNotUseUpTheResourcePoolOfTheirOwner(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user);
        $this->actingAs($user)->postJson('/api/client/boxes/' . $box->uuid . '/servers', $this->share(['name' => $this->n('Boxed'), 'memory' => 2048]))->assertStatus(201);
        $outside = $this->createServerModel(['owner_id' => $user->id, 'memory' => 1024, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);

        $used = app(ResourcePool::class)->used($user);
        $this->assertSame(1024, $used['memory']);
        $this->assertSame($outside->id, Server::query()->where('owner_id', $user->id)->whereNull('box_id')->value('id'));
    }

    public function testABoxThatRanOutIsSuspendedAndLetGoWhenTimeIsAdded(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user, ['expires_at' => now()->subDay(), 'source' => 'order']);

        $this->assertSame(1, app(StoreService::class)->expireDue());
        $this->assertSame('expired', $box->refresh()->status);

        $this->actingAs($this->admin())->patchJson('/api/client/admin/boxes/' . $box->id, ['expires_at' => now()->addDays(30)->toIso8601String()])->assertOk()->assertJsonPath('status', 'active');
    }

    public function testBoxesAreListedForAdminsWithTheirOwnerAndUsage(): void
    {
        $user = User::factory()->create();
        $box = $this->box($user, ['name' => $this->n('Findable')]);

        $this->actingAs($this->admin())->getJson('/api/client/admin/boxes?search=' . urlencode($box->name))->assertOk()->assertJsonPath('boxes.0.id', $box->uuid)->assertJsonPath('boxes.0.owner.username', $user->username);
        $this->actingAs($user)->getJson('/api/client/admin/boxes')->assertStatus(403);
    }
}
