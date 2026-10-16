<?php

namespace Pterodactyl\Tests\Integration\Files;

use Illuminate\Support\Facades\Hash;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
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

    public function testOnlyThoseWhoMayCreateFilesCanLookAtAServer(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->postJson("/api/client/servers/{$server->uuid}/files/import/test", $this->form())->assertStatus(403);
        $this->postJson("/api/client/servers/{$server->uuid}/files/import/test", $this->form())->assertStatus(403);
        $this->assertSame([], $this->node->sent);
    }

    public function testTheFormIsChecked(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $url = "/api/client/servers/{$server->uuid}/files/import/test";

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
}

/** A node with the importer, in memory. */
class FakeImportNode extends DaemonImportRepository
{
    /** @var list<array<string, mixed>> what the panel sent to the node */
    public array $sent = [];

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

}
