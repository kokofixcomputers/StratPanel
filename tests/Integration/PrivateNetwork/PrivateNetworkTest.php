<?php

namespace Pterodactyl\Tests\Integration\PrivateNetwork;

use Mockery\MockInterface;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Allocation;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Services\PrivateNetwork\Cidr;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Services\PrivateNetwork\PrivateNetworkService;
use Pterodactyl\Repositories\Wings\DaemonPrivateNetworkRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** The private network between servers: off by default, a range made by the panel, a slice for every node, an address for every server that joins. */
class PrivateNetworkTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    private Egg $egg;

    // How many times a node was told to look again.
    private int $syncs = 0;

    private const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AbCdE=';

    public function setUp(): void
    {
        parent::setUp();

        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }
        $this->egg = Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        $this->daemon = \Mockery::mock(DaemonPrivateNetworkRepository::class);
        $this->daemon->shouldReceive('setNode')->andReturnSelf();
        $this->syncs = 0;
        $this->daemon->shouldReceive('sync')->andReturnUsing(function () {
            ++$this->syncs;

            return new \GuzzleHttp\Psr7\Response();
        });
        $this->swap(DaemonPrivateNetworkRepository::class, $this->daemon);

        // The other tests leave nodes behind, and the settings are cached: start clean.
        Server::query()->update(['private_address' => null]);
        Node::query()->update(['private_enabled' => true, 'private_subnet' => null, 'private_public_key' => null, 'private_state' => null]);
        $this->service()->configure(false);
        DB::table('settings')->where('key', 'like', 'settings::private_network:%')->delete();
    }

    private function service(): PrivateNetworkService
    {
        return $this->app->make(PrivateNetworkService::class);
    }

    private function admin(): User
    {
        $admin = User::factory()->create(['root_admin' => true]);
        $this->actingAs($admin);

        return $admin;
    }

    /** A server on a node of its own (a node has to be made with the server), owned by the user. */
    private function server(User $owner, ?Node $node = null): Server
    {
        $attributes = ['owner_id' => $owner->id, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id];
        if ($node) {
            $attributes['node_id'] = $node->id;
            $attributes['allocation_id'] = Allocation::factory()->create(['node_id' => $node->id])->id;
        }

        return $this->createServerModel($attributes);
    }

    private function url(Server $server): string
    {
        return '/api/client/servers/' . $server->uuidShort . '/private-network';
    }

    // ---- the range and the slices ---------------------------------------------------------------------------------------

    public function testItIsOffUntilAnAdminTurnsItOn(): void
    {
        $user = User::factory()->create();
        $server = $this->server($user);
        $this->actingAs($user)->getJson($this->url($server))->assertOk()->assertJsonPath('enabled', false)->assertJsonPath('available', false)->assertJsonPath('joined', false);
        $this->postJson($this->url($server))->assertStatus(400)->assertSee('not turned on');

        $this->assertFalse($this->service()->enabled());
        $this->assertSame(['enabled' => false], $this->service()->configFor(Node::query()->findOrFail($server->node_id)));
    }

    public function testTurningItOnMakesARangeAndASliceForEveryNode(): void
    {
        $user = User::factory()->create();
        $a = $this->server($user);
        $b = $this->server($user);
        $this->admin();
        $nodes = Node::query()->whereIn('id', [$a->node_id, $b->node_id])->get();

        $response = $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true])->assertOk()->assertJsonPath('enabled', true);
        $range = $response->json('range');
        $this->assertMatchesRegularExpression('#^10\.1\d\d\.0\.0/16$#', $range);

        $subnets = Node::query()->pluck('private_subnet')->filter()->all();
        $this->assertSame(count($subnets), count(array_unique($subnets)), 'every node has a slice of its own');
        foreach ($nodes as $node) {
            $this->assertNotNull($node->fresh()->private_subnet);
            $this->assertTrue(Cidr::contains($range, Cidr::gateway($node->fresh()->private_subnet)));
        }

        // The range stays when it is saved again, and the slices too.
        $before = Node::query()->pluck('private_subnet', 'id')->all();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => $range])->assertOk();
        $this->assertSame($before, Node::query()->pluck('private_subnet', 'id')->all());
    }

    public function testTheAdminCanChooseTheRangeButNotAWrongOne(): void
    {
        $this->server(User::factory()->create());
        $this->admin();
        $patch = fn (string $range) => $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => $range]);

        $patch('172.20.0.0/16')->assertOk()->assertJsonPath('range', '172.20.0.0/16');
        // Host bits are dropped.
        $patch('10.50.7.9/16')->assertOk()->assertJsonPath('range', '10.50.0.0/16');
        $patch('8.8.0.0/16')->assertStatus(400)->assertSee('private one');
        $patch('nonsense')->assertStatus(400)->assertSee('not a range');
        $patch('10.50.0.0/26')->assertStatus(400)->assertSee('too small');
        $this->assertSame('10.50.0.0/16', $this->service()->range());

        // A port of a node on an address inside the range would be shadowed by it.
        Allocation::factory()->create(['ip' => '10.77.1.5', 'node_id' => Node::query()->firstOrFail()->id]);
        $patch('10.77.0.0/16')->assertStatus(400)->assertSee('10.77.1.5');
    }

    public function testChangingTheRangeMovesTheNodesAndTheServers(): void
    {
        $user = User::factory()->create();
        $server = $this->server($user);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => '10.60.0.0/16'])->assertOk();
        $this->actingAs($user)->postJson($this->url($server))->assertStatus(201);
        $this->assertTrue(Cidr::contains('10.60.0.0/16', $server->fresh()->private_address));

        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => '10.61.0.0/16'])->assertOk();
        $this->assertTrue(Cidr::contains('10.61.0.0/16', $server->fresh()->private_address), 'the server has an address in the new range');
        $this->assertNotNull(Cidr::sliceIndex('10.61.0.0/16', Node::query()->findOrFail($server->node_id)->private_subnet));
    }

    public function testANodeThatDoesNotTakePartHasNoSlice(): void
    {
        $user = User::factory()->create();
        $server = $this->server($user);
        $this->admin();

        $this->patchJson('/api/client/admin/settings/private-network', [
            'enabled' => true, 'nodes' => [['id' => $server->node_id, 'enabled' => false, 'port' => 51820]],
        ])->assertOk();
        $this->assertNull(Node::query()->findOrFail($server->node_id)->private_subnet);

        $this->actingAs($user)->getJson($this->url($server))->assertJsonPath('enabled', true)->assertJsonPath('available', false);
        $this->postJson($this->url($server))->assertStatus(400)->assertSee('not on the private network');
    }

    // ---- joining --------------------------------------------------------------------------------------------------------

    public function testServersGetAddressesFromTheSliceOfTheirNode(): void
    {
        $user = User::factory()->create();
        $first = $this->server($user);
        $second = $this->server($user, Node::query()->findOrFail($first->node_id));
        $other = $this->server($user);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => '10.70.0.0/16'])->assertOk();

        $this->actingAs($user);
        $a = $this->postJson($this->url($first))->assertStatus(201)->assertJsonPath('joined', true)->json('address');
        $b = $this->postJson($this->url($second))->assertStatus(201)->json('address');
        $c = $this->postJson($this->url($other))->assertStatus(201)->json('address');

        $slice = Node::query()->findOrFail($first->node_id)->private_subnet;
        $this->assertSame([Cidr::toIp(Cidr::parse($slice)[0] + 2), Cidr::toIp(Cidr::parse($slice)[0] + 3)], [$a, $b], 'the first free addresses of the slice of the node');
        $this->assertFalse(Cidr::contains($slice, $c), 'a server of another node has an address of the slice of that node');

        // Joining again changes nothing, leaving frees the address.
        $this->postJson($this->url($first))->assertStatus(201)->assertJsonPath('address', $a);
        $others = collect($this->getJson($this->url($first))->assertJsonCount(2, 'others')->json('others'))->pluck('address')->sort()->values()->all();
        $this->assertSame(collect([$b, $c])->sort()->values()->all(), $others, 'the servers of the same owner that can be reached');
        $this->deleteJson($this->url($first))->assertOk()->assertJsonPath('joined', false)->assertJsonPath('address', null);
        $this->assertSame($a, $this->postJson($this->url($first))->json('address'), 'the address that was freed is the first free one again');
    }

    public function testTheNodesAreToldWhenSomethingChanges(): void
    {
        $user = User::factory()->create();
        $server = $this->server($user);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true])->assertOk();

        $before = $this->syncs;
        $this->actingAs($user)->postJson($this->url($server))->assertStatus(201);
        $this->assertGreaterThan($before, $this->syncs, 'the nodes were told');
    }

    public function testOnlyWhoMayChangeTheServerJoinsIt(): void
    {
        $owner = User::factory()->create();
        $server = $this->server($owner);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true])->assertOk();

        $this->actingAs(User::factory()->create());
        $this->postJson($this->url($server))->assertStatus(404);
    }

    // ---- the nodes ----------------------------------------------------------------------------------------------------------

    private function headers(Node $node): array
    {
        return ['Authorization' => 'Bearer ' . $node->daemon_token_id . '.' . app('encrypter')->decrypt($node->daemon_token)];
    }

    public function testANodeAsksForItsConfigurationAndSaysItsKey(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $first = $this->server($owner);
        $second = $this->server($other);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true, 'range' => '10.80.0.0/16'])->assertOk();
        $this->actingAs($owner)->postJson($this->url($first))->assertStatus(201);
        $this->actingAs($other)->postJson($this->url($second))->assertStatus(201);

        $a = Node::query()->findOrFail($first->node_id);
        $b = Node::query()->findOrFail($second->node_id);

        $config = $this->withHeaders($this->headers($a))->getJson('/api/remote/private-network')->assertOk()->json();
        $this->assertTrue($config['enabled']);
        $this->assertSame(['10.80.0.0/16', $a->fresh()->private_subnet, 51820], [$config['range'], $config['subnet'], $config['port']]);
        $this->assertSame(Cidr::gateway($config['subnet']), $config['gateway']);
        $this->assertSame([], $config['peers'], 'a node that has not said its key is not a peer yet');
        // Every server that joined, with the owner as the group: that is who may reach whom.
        $groups = collect($config['servers'])->pluck('group', 'uuid')->all();
        $this->assertSame([$first->uuid => $owner->id, $second->uuid => $other->id], $groups);

        // The key is made by the node and reported, the others hear of it.
        $before = $this->syncs;
        $this->withHeaders($this->headers($b))->postJson('/api/remote/private-network', ['public_key' => self::KEY, 'state' => 'ready'])->assertNoContent();
        $this->assertGreaterThan($before, $this->syncs, 'the other nodes were told about the new key');
        $this->assertSame(self::KEY, $b->fresh()->private_public_key);
        $this->assertSame('ready', $b->fresh()->private_state);

        $peers = $this->withHeaders($this->headers($a))->getJson('/api/remote/private-network')->json('peers');
        $this->assertSame([['name' => $b->name, 'endpoint' => $b->fqdn . ':51820', 'public_key' => self::KEY, 'subnet' => $b->fresh()->private_subnet]], $peers);

        $this->withHeaders($this->headers($b))->postJson('/api/remote/private-network', ['public_key' => 'not a key', 'state' => 'ready'])->assertStatus(422);
        $this->withHeaders($this->headers($b))->postJson('/api/remote/private-network', ['state' => 'error', 'message' => 'WireGuard is not available'])->assertNoContent();
        $this->assertSame(['error', 'WireGuard is not available', self::KEY], [$b->fresh()->private_state, $b->fresh()->private_message, $b->fresh()->private_public_key], 'a report without a key keeps the key');
    }

    public function testANodeThatIsOffIsToldSo(): void
    {
        $server = $this->server(User::factory()->create());
        $node = Node::query()->findOrFail($server->node_id);
        $this->assertSame(['enabled' => false], $this->withHeaders($this->headers($node))->getJson('/api/remote/private-network')->assertOk()->json());
    }

    public function testTheAdminPageShowsHowEachNodeIsDoing(): void
    {
        $server = $this->server(User::factory()->create());
        $node = Node::query()->findOrFail($server->node_id);
        $this->admin();
        $this->patchJson('/api/client/admin/settings/private-network', ['enabled' => true])->assertOk();
        $this->withHeaders($this->headers($node))->postJson('/api/remote/private-network', ['public_key' => self::KEY, 'state' => 'ready'])->assertNoContent();

        $row = collect($this->getJson('/api/client/admin/settings/private-network')->assertOk()->json('nodes'))->firstWhere('id', $node->id);
        $this->assertSame(['ready', true, true], [$row['state'], $row['recent'], $row['has_key']]);
        $this->assertNotNull($row['subnet']);
    }

    public function testRangeMathIsRight(): void
    {
        $this->assertSame('10.99.0.0/16', Cidr::normalize('10.99.3.7/16'));
        $this->assertSame('10.99.3.0/24', Cidr::slice('10.99.0.0/16', 3));
        $this->assertSame(3, Cidr::sliceIndex('10.99.0.0/16', '10.99.3.0/24'));
        $this->assertNull(Cidr::sliceIndex('10.99.0.0/16', '10.98.3.0/24'));
        $this->assertSame('10.99.3.1', Cidr::gateway('10.99.3.0/24'));
        $this->assertSame(253, count(Cidr::hosts('10.99.3.0/24')));
        $this->assertSame(16, Cidr::slices('10.99.0.0/20'));
        $this->assertSame(0, Cidr::slices('10.99.0.0/26'));
        $this->assertTrue(Cidr::isPrivate('100.64.1.0/24'));
        $this->assertFalse(Cidr::isPrivate('172.32.0.0/16'));
        $this->assertTrue(Cidr::overlaps('10.0.0.0/8', '10.99.0.0/16'));
        $this->assertFalse(Cidr::overlaps('10.98.0.0/16', '10.99.0.0/16'));
        $this->assertNull(Cidr::parse('300.1.1.1/8'));
    }
}
