<?php

namespace Pterodactyl\Tests\Integration\Pools;

use Mockery\MockInterface;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** Resource pools: what a person may spend on the servers they create, as a total. */
class PoolsTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    private Egg $egg;

    public function setUp(): void
    {
        parent::setUp();

        // The admin pages print how long they took.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        config([
            'pterodactyl.pools' => ['enabled' => true, 'memory' => 4096, 'cpu' => 200, 'disk' => 10240, 'allocations' => 5],
            'pterodactyl.self_service' => array_merge(config('pterodactyl.self_service'), [
                'enabled' => true, 'max_servers' => 1, 'memory' => 2048, 'disk' => 5120, 'cpu' => 100, 'locations' => [],
                'egg' => null, 'max_memory' => 8192, 'max_disk' => 51200, 'max_cpu' => 400,
            ]),
        ]);

        // The eggs of the panel are not in the test database, so this one makes its own and the creation page uses it.
        $nest = Nest::factory()->create();
        $this->egg = Egg::factory()->create([
            'nest_id' => $nest->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        config(['pterodactyl.self_service.egg' => $this->egg->id]);

        $this->daemon = \Mockery::mock(DaemonServerRepository::class);
        $this->daemon->shouldReceive('setServer')->andReturnSelf();
        $this->daemon->shouldReceive('create')->andReturnNull();
        $this->swap(DaemonServerRepository::class, $this->daemon);
    }

    private function pool(): ResourcePool
    {
        return $this->app->make(ResourcePool::class);
    }

    private function user(array $attributes = []): User
    {
        return User::factory()->create($attributes);
    }

    /** A node that people may create servers on, with free allocations. */
    private function node(int $allocations = 8): Node
    {
        $node = Node::factory()->create(['location_id' => Location::factory()->create()->id, 'public' => true, 'maintenance_mode' => false]);
        Allocation::factory()->times($allocations)->create(['node_id' => $node->id]);

        return $node;
    }

    private function spend(User $user, int $memory, int $disk, int $cpu, int $allocations = 1): Server
    {
        $server = $this->createServerModel(['owner_id' => $user->id, 'memory' => $memory, 'disk' => $disk, 'cpu' => $cpu, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        Allocation::factory()->times(max(0, $allocations - 1))->create(['node_id' => $server->node_id, 'server_id' => $server->id]);

        return $server;
    }

    // ---- the pool itself ------------------------------------------------------------------------------------------------

    public function testEverybodyHasTheDefaultsUntilTheyAreGivenAPool(): void
    {
        $user = $this->user();
        $this->assertSame(['memory' => 4096, 'disk' => 10240, 'cpu' => 200, 'allocations' => 5], $this->pool()->limits($user));

        $user->forceFill(['pool_memory' => 8192, 'pool_allocations' => 0])->save();
        $this->assertSame(['memory' => 8192, 'disk' => 10240, 'cpu' => 200, 'allocations' => 0], $this->pool()->limits($user->fresh()));
    }

    public function testWhatTheServersUseIsCountedFromTheServers(): void
    {
        $user = $this->user();
        $this->spend($user, 1024, 2048, 50, 2);
        $this->spend($user, 512, 1024, 50, 1);
        $this->spend($this->user(), 4096, 4096, 100, 3);

        $this->assertSame(['memory' => 1536, 'disk' => 3072, 'cpu' => 100, 'allocations' => 3], $this->pool()->used($user));
        $this->assertSame(['memory' => 2560, 'disk' => 7168, 'cpu' => 100, 'allocations' => 2], $this->pool()->remaining($user));
        $this->assertTrue($this->pool()->canCreate($user));
    }

    public function testDeletingAServerGivesItsShareBack(): void
    {
        $user = $this->user();
        $server = $this->spend($user, 2048, 4096, 100, 2);
        $this->assertSame(2048, $this->pool()->remaining($user)['memory']);

        Allocation::query()->where('server_id', $server->id)->update(['server_id' => null]);
        $server->delete();

        $this->assertSame(4096, $this->pool()->remaining($user)['memory']);
        $this->assertSame(5, $this->pool()->remaining($user)['allocations']);
    }

    public function testAPoolThatIsUsedUpCanNotMakeAnotherServer(): void
    {
        $user = $this->user();
        $this->spend($user, 4096, 2048, 50, 1);

        $this->assertFalse($this->pool()->canCreate($user), 'no memory left');
        $this->assertSame(0, $this->pool()->remaining($user)['memory']);
    }

    public function testWhatDoesNotFitIsRefusedSayingWhat(): void
    {
        $user = $this->user();
        $this->spend($user, 3072, 1024, 50, 1);

        $this->pool()->check($user, ['memory' => 1024, 'cpu' => 100, 'disk' => 1024, 'allocations' => 2]);

        $this->expectExceptionMessage('Your resource pool has 1 GB of 4 GB memory left, this needs 2 GB.');
        $this->pool()->check($user, ['memory' => 2048]);
    }

    public function testNeverMoreThanIsLeftWhenAskingForTheUsualSize(): void
    {
        $user = $this->user();
        $this->spend($user, 3584, 9216, 150, 4);

        $this->assertSame(['memory' => 512, 'disk' => 1024, 'cpu' => 50, 'allocations' => 1], $this->pool()->fit($user, ['memory' => 2048, 'disk' => 5120, 'cpu' => 100, 'allocations' => 2]));
    }

    public function testAdminsWhoCreateServersAreNotLimited(): void
    {
        $this->assertFalse($this->pool()->appliesTo($this->user(['root_admin' => true])));
        $this->assertTrue($this->pool()->appliesTo($this->user()));

        config(['pterodactyl.pools.enabled' => false]);
        $this->assertFalse($this->pool()->appliesTo($this->user()));
    }

    // ---- the creation page ----------------------------------------------------------------------------------------------

    public function testThePageShowsThePoolAndNeverOffersMoreThanIsLeft(): void
    {
        $user = $this->user();
        $this->spend($user, 3072, 8192, 100, 3);

        $attributes = $this->actingAs($user)->getJson('/api/client/self-service')->assertOk()->json('attributes');

        $this->assertTrue($attributes['can_create']);
        $this->assertSame(['memory' => 1024, 'disk' => 2048, 'cpu' => 100, 'allocations' => 2], $attributes['pool']['remaining']);
        $this->assertSame(1024, $attributes['max']['memory']);
        $this->assertSame(2048, $attributes['max']['disk']);
        $this->assertSame(100, $attributes['max']['cpu']);
        $this->assertSame(2, $attributes['max']['allocations']);
        $this->assertSame(1024, $attributes['limits']['memory'], 'the usual size is cut down to what is left');
        $this->assertSame(2, $attributes['limits']['allocations']);
    }

    public function testTheNumberOfServersDoesNotMatterWithAPool(): void
    {
        $user = $this->user();
        $this->spend($user, 512, 1024, 50, 1);
        $this->spend($user, 512, 1024, 50, 1);

        $this->assertTrue($this->actingAs($user)->getJson('/api/client/self-service')->json('attributes.can_create'), 'max_servers is 1 and does not apply');

        config(['pterodactyl.pools.enabled' => false]);
        $attributes = $this->actingAs($user)->getJson('/api/client/self-service')->json('attributes');
        $this->assertFalse($attributes['can_create'], 'without pools the number of servers counts again');
        $this->assertNull($attributes['pool']);
    }

    public function testThePageSaysNoWhenThePoolIsUsedUp(): void
    {
        $user = $this->user();
        $this->spend($user, 4096, 1024, 50, 1);

        $this->assertFalse($this->actingAs($user)->getJson('/api/client/self-service')->json('attributes.can_create'));
    }

    public function testAServerThatDoesNotFitIsNotMade(): void
    {
        $node = $this->node();
        $user = $this->user();
        $this->spend($user, 3072, 1024, 50, 1);

        $this->actingAs($user)->postJson('/api/client/self-service', ['name' => 'Big', 'memory' => 2048, 'node_id' => $node->id])
            ->assertStatus(400)->assertSee('Your resource pool has 1 GB of 4 GB memory left');
        $this->actingAs($user)->postJson('/api/client/self-service', ['name' => 'Wide', 'memory' => 512, 'allocations' => 5, 'node_id' => $node->id])
            ->assertStatus(400)->assertSee('allocations left');

        $this->assertSame(1, Server::query()->where('owner_id', $user->id)->count());
    }

    public function testAServerIsMadeFromThePoolWithTheAllocationsAsked(): void
    {
        $node = $this->node();
        $user = $this->user();

        $response = $this->actingAs($user)->postJson('/api/client/self-service', ['name' => 'First', 'memory' => 1024, 'disk' => 2048, 'cpu' => 100, 'allocations' => 3, 'node_id' => $node->id]);
        $response->assertStatus(201);

        $server = Server::query()->where('owner_id', $user->id)->firstOrFail();
        $this->assertSame(3, $server->allocations()->count());
        $this->assertSame(5, $server->allocation_limit, 'it may grow up to the whole pool of its owner');
        $this->assertSame(['memory' => 1024, 'disk' => 2048, 'cpu' => 100, 'allocations' => 3], $this->pool()->used($user));

        // The second one is made from what is left.
        $this->actingAs($user)->postJson('/api/client/self-service', ['name' => 'Second', 'memory' => 3072, 'disk' => 8192, 'cpu' => 100, 'allocations' => 2, 'node_id' => $node->id])->assertStatus(201);
        $this->assertSame(0, $this->pool()->remaining($user)['memory']);
        $this->assertSame(0, $this->pool()->remaining($user)['allocations']);
        $this->assertFalse($this->actingAs($user)->getJson('/api/client/self-service')->json('attributes.can_create'));
    }

    public function testWithoutPoolsAServerStillStartsWithTwoAllocations(): void
    {
        config(['pterodactyl.pools.enabled' => false]);
        $node = $this->node();
        $user = $this->user();

        $this->actingAs($user)->postJson('/api/client/self-service', ['name' => 'Old way', 'allocations' => 5, 'node_id' => $node->id])->assertStatus(201);

        $this->assertSame(2, Server::query()->where('owner_id', $user->id)->firstOrFail()->allocations()->count());
    }

    // ---- allocations added later ----------------------------------------------------------------------------------------

    public function testAllocationsAddedLaterComeOutOfThePoolToo(): void
    {
        $user = $this->user(['pool_allocations' => 2]);
        $server = $this->spend($user, 1024, 1024, 50, 2);
        $server->forceFill(['allocation_limit' => 5])->save();
        Allocation::factory()->times(2)->create(['node_id' => $server->node_id]);

        $this->actingAs($user)->postJson("/api/client/servers/{$server->uuid}/network/allocations")
            ->assertStatus(400)->assertSee('Your resource pool has 0 of 2 allocations left');

        $user->forceFill(['pool_allocations' => 3])->save();
        $this->actingAs($user->fresh())->postJson("/api/client/servers/{$server->uuid}/network/allocations")->assertOk();
    }

    // ---- the admin pages ------------------------------------------------------------------------------------------------

    public function testAnAdminSetsTheDefaultsAndTheSwitch(): void
    {
        $admin = $this->user(['root_admin' => true]);

        $this->actingAs($admin)->get('/admin/settings/pools')->assertOk()->assertSee('Resource pools');
        $this->actingAs($admin)->patch('/admin/settings/pools', ['enabled' => '1', 'memory' => 8192, 'disk' => 20480, 'cpu' => 400, 'allocations' => 8])->assertRedirect();

        (new \Pterodactyl\Providers\SettingsServiceProvider($this->app))->boot(
            $this->app['config'],
            $this->app->make(\Illuminate\Contracts\Encryption\Encrypter::class),
            $this->app->make(\Psr\Log\LoggerInterface::class),
            $this->app->make(\Pterodactyl\Contracts\Repository\SettingsRepositoryInterface::class)
        );
        $this->assertTrue($this->pool()->enabled());
        $this->assertSame(['memory' => 8192, 'disk' => 20480, 'cpu' => 400, 'allocations' => 8], $this->pool()->defaults());

        // Settings stay in the database between tests.
        $settings = $this->app->make(\Pterodactyl\Contracts\Repository\SettingsRepositoryInterface::class);
        foreach (['enabled', 'memory', 'disk', 'cpu', 'allocations'] as $key) {
            $settings->forget('settings::pterodactyl:pools:' . $key);
        }
    }

    public function testAnAdminGivesAPersonTheirOwnPool(): void
    {
        $admin = $this->user(['root_admin' => true]);
        $person = $this->user();

        $this->actingAs($admin)->get('/admin/users/view/' . $person->id)->assertOk()->assertSee('Resource pool');
        $this->actingAs($admin)->patch('/admin/settings/pools/users/' . $person->id, ['memory' => 16384, 'disk' => '', 'cpu' => 800, 'allocations' => 0])->assertRedirect();

        $person = $person->fresh();
        $this->assertSame(16384, $person->pool_memory);
        $this->assertNull($person->pool_disk, 'empty is the default');
        $this->assertSame(800, $person->pool_cpu);
        $this->assertSame(0, $person->pool_allocations);
        $this->assertSame(10240, $this->pool()->limits($person)['disk']);
    }

    public function testNobodyChangesThePoolOfAStrongerAccountOrWithoutThePermission(): void
    {
        $root = $this->user(['root_admin' => true]);
        $plain = $this->user();

        $this->actingAs($plain)->patch('/admin/settings/pools/users/' . $root->id, ['memory' => 1])->assertStatus(403);
        $this->actingAs($plain)->get('/admin/settings/pools')->assertStatus(403);
    }
}
