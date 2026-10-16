<?php

namespace Pterodactyl\Tests\Integration\Files;

use GuzzleHttp\Psr7\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Permission;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonImportRepository;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

class ImportTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private FakeImportNode $node;

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        $this->node = new FakeImportNode();
        $this->app->instance(DaemonImportRepository::class, $this->node);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        $ids = User::query()->where('email', 'like', '%@import-test.example')->pluck('id');
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();
    }

    private function user(): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(['username' => $name, 'email' => $name . '@import-test.example', 'password' => Hash::make('correct-horse-battery')]);
    }

    private function server(?User $owner = null): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(['user_id' => ($owner ?? $this->user())->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);
    }

    private function subuser(Server $server, array $permissions): User
    {
        $user = $this->user();
        Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => $permissions]);

        return $user;
    }

    private function form(array $extra = []): array
    {
        return array_merge(['protocol' => 'sftp', 'host' => 'old-host.example.com', 'username' => 'minecraft', 'password' => 'hunter2-secret', 'path' => '/srv/mc', 'directory' => '/'], $extra);
    }

    // ---- who and what ---------------------------------------------------------------------------------------------------

    public function testOnlyThoseWhoMayCreateFilesCanImport(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form())->assertStatus(403);
        $this->postJson("/api/client/servers/{$server->uuid}/files/import/test", $this->form())->assertStatus(403);
        $this->assertSame([], $this->node->sent);
    }

    public function testTheFormIsChecked(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $url = "/api/client/servers/{$server->uuid}/files/import";

        $this->actingAs($owner)->postJson($url, $this->form(['protocol' => 'smb']))->assertStatus(422);
        $this->postJson($url, $this->form(['host' => 'host.example.com/path']))->assertStatus(422);
        $this->postJson($url, $this->form(['host' => 'http://host.example.com']))->assertStatus(422);
        $this->postJson($url, $this->form(['port' => 70000]))->assertStatus(422);
        $this->postJson($url, array_diff_key($this->form(), ['host' => 1]))->assertStatus(422);
        $this->assertSame([], $this->node->sent);
    }

    public function testTheTestShowsTheFingerprintAndTheFolder(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/import/test", $this->form())
            ->assertOk()
            ->assertJsonPath('fingerprint', 'SHA256:abc')
            ->assertJsonPath('entries.0.name', 'world')
            ->assertJsonPath('total', 2);
        $this->assertSame('old-host.example.com', $this->node->sent[0]['host']);
    }

    public function testTheImportIsStreamedFromTheNode(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->lines = [['event' => 'connected', 'fingerprint' => 'SHA256:abc'], ['event' => 'listing', 'files' => 2], ['event' => 'file', 'done' => 1, 'total' => 2, 'ok' => true], ['event' => 'file', 'done' => 2, 'total' => 2, 'ok' => true], ['event' => 'finished']];

        $response = $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form(['fingerprint' => 'SHA256:abc']));

        $response->assertOk();
        $this->assertStringContainsString('application/x-ndjson', (string) $response->headers->get('Content-Type'));
        $this->assertSame('no', $response->headers->get('X-Accel-Buffering'));
        $lines = array_map(fn ($l) => json_decode($l, true), array_filter(explode("\n", $response->streamedContent())));
        $this->assertCount(5, $lines);
        $this->assertSame('finished', end($lines)['event']);

        // What the node got: the login, the pinned fingerprint and the defaults.
        $sent = $this->node->sent[0];
        $this->assertSame('hunter2-secret', $sent['password']);
        $this->assertSame('SHA256:abc', $sent['fingerprint']);
        $this->assertSame('/srv/mc', $sent['path']);
        $this->assertSame('/', $sent['directory']);
        $this->assertFalse($sent['overwrite']);
    }

    public function testTheLoginIsNeverKept(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form(['private_key' => "-----BEGIN KEY-----\nsecret\n-----END KEY-----", 'passphrase' => 'phrase-secret']))
            ->assertOk()->streamedContent();

        $log = ActivityLog::query()->where('event', 'server:file.import')->latest('id')->firstOrFail();
        $stored = json_encode($log->properties);
        $this->assertStringContainsString('old-host.example.com', $stored);
        foreach (['hunter2-secret', 'phrase-secret', 'BEGIN KEY', 'secret'] as $secret) {
            $this->assertStringNotContainsString($secret, $stored);
        }
    }

    public function testReplacingFilesNeedsTheRightToChangeThem(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $adder = $this->subuser($server, [Permission::ACTION_FILE_CREATE]);
        $url = "/api/client/servers/{$server->uuid}/files/import";

        $this->actingAs($adder)->postJson($url, $this->form(['overwrite' => true]))->assertStatus(400);
        $this->assertSame([], $this->node->sent, 'the node was not asked');

        $this->postJson($url, $this->form(['overwrite' => false]))->assertOk()->streamedContent();
        $this->assertCount(1, $this->node->sent);
    }

    // ---- the node ------------------------------------------------------------------------------------------------------

    public function testWhatTheNodeRefusesIsShownInItsWords(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->refuse = 'That address is on a private network and the node may not connect to it.';

        $response = $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form());

        $response->assertStatus(400);
        $this->assertStringContainsString('private network', json_encode($response->json()));
        // The lock was given back: the next try is not told that an import is running.
        $this->node->refuse = null;
        $this->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form())->assertOk()->streamedContent();
    }

    public function testOnlyOneImportRunsPerServer(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $lock = Cache::lock('files:import:' . $server->id, 60);
        $this->assertTrue($lock->get());

        $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form())->assertStatus(409);
        $this->assertSame([], $this->node->sent);

        $lock->release();
        $this->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form())->assertOk()->streamedContent();
        $this->postJson("/api/client/servers/{$server->uuid}/files/import", $this->form())->assertOk()->streamedContent();
    }
}

/** A node with the importer, in memory. */
class FakeImportNode extends DaemonImportRepository
{
    /** @var list<array<string, mixed>> what the panel sent to the node */
    public array $sent = [];

    /** @var list<array<string, mixed>> */
    public array $lines = [['event' => 'connected'], ['event' => 'finished']];

    public ?string $refuse = null;

    public function __construct()
    {
    }

    public function setServer($server): static
    {
        return $this;
    }

    public function test(array $payload): array
    {
        $this->sent[] = $payload;
        if ($this->refuse !== null) {
            throw new DisplayException($this->refuse);
        }

        return ['fingerprint' => 'SHA256:abc', 'entries' => [['name' => 'world', 'dir' => true, 'size' => 0], ['name' => 'server.properties', 'dir' => false, 'size' => 120]], 'total' => 2];
    }

    public function stream(array $payload): ResponseInterface
    {
        if ($this->refuse !== null) {
            throw new DisplayException($this->refuse);
        }
        $this->sent[] = $payload;

        return new Response(200, [], implode('', array_map(fn ($l) => json_encode($l) . "\n", $this->lines)));
    }
}
