<?php

namespace Pterodactyl\Tests\Integration\Tunnels;

use Mockery\MockInterface;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Tunnel;
use Pterodactyl\Models\Allocation;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Services\Tunnels\TunnelService;
use Pterodactyl\Repositories\Wings\DaemonTunnelRepository;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

/** Opening the ports of servers to the internet through a tunnel (ngrok, run by the node). */
class TunnelsTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    private Egg $egg;

    public function setUp(): void
    {
        parent::setUp();

        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }
        DB::table('settings')->where('key', 'like', 'settings::tunnels:%')->delete();
        Tunnel::query()->delete();

        $this->egg = Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        $this->daemon = \Mockery::mock(DaemonTunnelRepository::class);
        $this->daemon->shouldReceive('setNode')->andReturnSelf();
        $this->swap(DaemonTunnelRepository::class, $this->daemon);
    }

    public function tearDown(): void
    {
        DB::table('settings')->where('key', 'like', 'settings::tunnels:%')->delete();
        Tunnel::query()->delete();

        parent::tearDown();
    }

    private function turnOn(string $token = 'ngrok-token'): void
    {
        $service = $this->app->make(TunnelService::class);
        $service->setEnabled(true);
        $service->setToken($token);
    }

    /** @return array{0: User, 1: Server} */
    private function account(int $ports = 2): array
    {
        $user = User::factory()->create();
        $server = $this->createServerModel(['owner_id' => $user->id, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        Allocation::factory()->times($ports - 1)->create(['node_id' => $server->node_id, 'server_id' => $server->id]);

        return [$user, $server];
    }

    private function url(Server $server, string $path = ''): string
    {
        return '/api/client/servers/' . $server->uuidShort . '/tunnels' . $path;
    }

    public function testNothingIsOpenedUntilAnAdminTurnsItOn(): void
    {
        [$user, $server] = $this->account();
        $this->actingAs($user);

        $this->getJson($this->url($server))->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(2, 'allocations');
        $this->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(400);

        // Switched on without a token is still off.
        $this->app->make(TunnelService::class)->setEnabled(true);
        $this->getJson($this->url($server))->assertJsonPath('enabled', false);
    }

    public function testAnOwnerOpensAPortAndTheNodeIsTold(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->expects('sync')->once();
        $this->actingAs($user);

        $this->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201)
            ->assertJsonPath('allocations.0.tunnel.status', 'pending');

        $tunnel = Tunnel::query()->where('server_id', $server->id)->firstOrFail();
        $this->assertSame($server->allocation_id, $tunnel->allocation_id);

        // One tunnel a server by default, and not twice the same port.
        $this->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(400);
        $other = Allocation::query()->where('server_id', $server->id)->where('id', '!=', $server->allocation_id)->firstOrFail();
        $this->postJson($this->url($server), ['allocation_id' => $other->id])->assertStatus(400)->assertSee('1 tunnel');
    }

    public function testAnAllocationOfAnotherServerIsNotOpened(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        [, $stranger] = $this->account();
        $this->actingAs($user);

        $this->postJson($this->url($server), ['allocation_id' => $stranger->allocation_id])->assertStatus(404);
    }

    public function testTheNodeAsksWhatToOpenAndSaysHowItWent(): void
    {
        $this->turnOn('the-token');
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        $tunnel = Tunnel::query()->where('server_id', $server->id)->firstOrFail();

        $node = Node::query()->findOrFail($server->node_id);
        $headers = ['Authorization' => 'Bearer ' . $node->daemon_token_id . '.' . app('encrypter')->decrypt($node->daemon_token)];

        $config = $this->withHeaders($headers)->getJson('/api/remote/tunnels')->assertOk()->json();
        $this->assertSame('the-token', $config['token']);
        $this->assertSame([['id' => $tunnel->id, 'ip' => $server->allocation->ip, 'port' => $server->allocation->port]], $config['tunnels']);

        $this->withHeaders($headers)->postJson('/api/remote/tunnels/' . $tunnel->id, ['state' => 'active', 'address' => '0.tcp.ngrok.io:12345'])->assertNoContent();
        $this->actingAs($user)->getJson($this->url($server))->assertJsonPath('allocations.0.tunnel.address', '0.tcp.ngrok.io:12345')->assertJsonPath('allocations.0.tunnel.status', 'active');

        $this->withHeaders($headers)->postJson('/api/remote/tunnels/' . $tunnel->id, ['state' => 'failed', 'message' => 'authentication failed'])->assertNoContent();
        $tunnel->refresh();
        $this->assertSame(['failed', null, 'authentication failed'], [$tunnel->status, $tunnel->address, $tunnel->error]);
    }

    public function testANodeOnlyHearsOfItsOwnTunnels(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        $tunnel = Tunnel::query()->firstOrFail();

        $otherServer = $this->createServerModel(['owner_id' => $user->id, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id]);
        $other = Node::query()->findOrFail($otherServer->node_id);
        $headers = ['Authorization' => 'Bearer ' . $other->daemon_token_id . '.' . app('encrypter')->decrypt($other->daemon_token)];

        $this->assertSame([], $this->withHeaders($headers)->getJson('/api/remote/tunnels')->assertOk()->json('tunnels'));
        $this->withHeaders($headers)->postJson('/api/remote/tunnels/' . $tunnel->id, ['state' => 'active', 'address' => 'x:1'])->assertStatus(403);
    }

    public function testANodeHasATokenOfItsOwnWhenItWasGivenOne(): void
    {
        $this->turnOn('panel-token');
        [, $server] = $this->account();
        $node = Node::query()->findOrFail($server->node_id);
        $service = $this->app->make(TunnelService::class);

        $this->assertSame('panel-token', $service->tokenFor($node));
        $node->forceFill(['tunnel_token' => 'node-token'])->save();
        $this->assertSame('node-token', $service->tokenFor($node->fresh()));
        $this->assertSame('node-token', $service->configFor($node->fresh())['token']);
        $this->assertStringNotContainsString('node-token', json_encode($node->fresh()->toArray()));
    }

    public function testClosingAndTurningOffClosesThem(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        $tunnel = Tunnel::query()->firstOrFail();

        $this->deleteJson($this->url($server, '/' . $tunnel->id))->assertOk()->assertJsonPath('allocations.0.tunnel', null);
        $this->assertSame(0, Tunnel::query()->count());

        $this->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        $this->app->make(TunnelService::class)->setEnabled(false);
        $config = $this->app->make(TunnelService::class)->configFor(Node::query()->findOrFail($server->node_id));
        $this->assertSame([null, []], [$config['token'], $config['tunnels']]);
    }

    public function testANodeThatCanNotBeReachedMarksItFailed(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->expects('sync')->andThrow(new DaemonConnectionException(new \GuzzleHttp\Exception\ConnectException('down', new \GuzzleHttp\Psr7\Request('POST', '/'))));

        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201)
            ->assertJsonPath('allocations.0.tunnel.status', 'failed');
        $this->assertStringContainsString('can not be reached', Tunnel::query()->firstOrFail()->error);
    }

    public function testTheTunnelsOfADeletedServerGoAndTheNodeIsTold(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);

        $this->assertSame(1, Tunnel::query()->count());
        $server->delete();
        $this->assertSame(0, Tunnel::query()->count());
    }

    public function testAdminsSeeAndChangeTheSettingsButNeverGetTheTokens(): void
    {
        $this->actingAs(User::factory()->create(['root_admin' => true]));
        [, $server] = $this->account();
        $this->daemon->shouldReceive('sync');

        $response = $this->patchJson('/api/client/admin/settings/tunnels', [
            'enabled' => true, 'token' => 'secret-ngrok-token', 'max' => 3, 'node_tokens' => [['id' => $server->node_id, 'token' => 'secret-node-token']],
        ])->assertOk()->assertJsonPath('enabled', true)->assertJsonPath('token_set', true)->assertJsonPath('max', 3);
        $this->assertStringNotContainsString('secret-', $response->getContent());
        $node = collect($response->json('nodes'))->firstWhere('id', $server->node_id);
        $this->assertTrue($node['has_token']);

        // An empty token keeps the saved one, clearing removes it.
        $this->patchJson('/api/client/admin/settings/tunnels', ['enabled' => true, 'token' => '', 'max' => 3])->assertJsonPath('token_set', true);
        $this->patchJson('/api/client/admin/settings/tunnels', ['enabled' => true, 'clear_token' => true, 'max' => 3, 'node_tokens' => [['id' => $server->node_id, 'clear' => true]]])
            ->assertJsonPath('token_set', false);
        $this->assertNull(Node::query()->find($server->node_id)->tunnel_token);

        $this->patchJson('/api/client/admin/settings/tunnels', ['enabled' => true, 'max' => 0])->assertStatus(422);
    }

    public function testAdminsCanCloseATunnel(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        $tunnel = Tunnel::query()->firstOrFail();

        $this->actingAs(User::factory()->create(['root_admin' => true]));
        $this->getJson('/api/client/admin/settings/tunnels')->assertOk()->assertJsonPath('tunnels.0.server', $server->name);
        $this->deleteJson('/api/client/admin/settings/tunnels/' . $tunnel->id)->assertNoContent();
        $this->assertSame(0, Tunnel::query()->count());
    }

    public function testThePageOfTheServerListSaysWhichTunnelsAreOpen(): void
    {
        $this->turnOn();
        [$user, $server] = $this->account();
        $this->daemon->shouldReceive('sync');
        $this->actingAs($user)->postJson($this->url($server), ['allocation_id' => $server->allocation_id])->assertStatus(201);
        Tunnel::query()->update(['status' => 'active', 'address' => '1.tcp.ngrok.io:4242']);

        $row = collect($this->getJson('/api/client')->assertOk()->json('data'))->firstWhere('attributes.uuid', $server->uuid);
        $this->assertSame([['allocation_id' => $server->allocation_id, 'address' => '1.tcp.ngrok.io:4242']], $row['attributes']['tunnels']);
    }
}
