<?php

namespace Pterodactyl\Tests\Integration\Files;

use Illuminate\Support\Facades\Hash;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Repositories\Wings\DaemonJobRepository;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

class JobsTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private FakeJobsNode $node;

    private FakeFolderNode $folders;

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        $this->node = new FakeJobsNode();
        $this->folders = new FakeFolderNode();
        $this->app->instance(DaemonJobRepository::class, $this->node);
        $this->app->instance(DaemonFileRepository::class, $this->folders);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        $ids = User::query()->where('email', 'like', '%@jobs-test.example')->pluck('id');
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();
    }

    private function user(): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(['username' => $name, 'email' => $name . '@jobs-test.example', 'password' => Hash::make('correct-horse-battery')]);
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

    private function url(Server $server, string $path = ''): string
    {
        return "/api/client/servers/{$server->uuid}/jobs{$path}";
    }

    private function form(array $extra = []): array
    {
        return array_merge(['protocol' => 'sftp', 'host' => 'old-host.example.com', 'username' => 'minecraft', 'password' => 'hunter2-secret', 'path' => '/srv/mc', 'directory' => '/'], $extra);
    }

    // ---- looking at jobs ------------------------------------------------------------------------------------------------

    public function testTheJobsOfAServerAreListed(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->add(['id' => 'a', 'type' => 'import', 'title' => 'Import /srv', 'status' => 'running', 'done' => 4, 'files' => 10]);

        $response = $this->actingAs($owner)->getJson($this->url($server));

        $response->assertOk()
            ->assertJsonPath('data.0.object', 'server_job')
            ->assertJsonPath('data.0.attributes.title', 'Import /srv')
            ->assertJsonPath('data.0.attributes.done', 4);
        $this->getJson($this->url($server, '/a'))->assertOk()->assertJsonPath('attributes.status', 'running');
        $this->getJson($this->url($server, '/nope'))->assertStatus(404);
    }

    public function testOnlyThoseWhoCanSeeTheFilesSeeTheJobs(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $stranger = $this->subuser($server, [Permission::ACTION_CONTROL_CONSOLE]);

        $this->actingAs($stranger)->getJson($this->url($server))->assertStatus(403);
    }

    public function testStoppingAJobTakesTheRightToChangeFiles(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->add(['id' => 'a', 'status' => 'running']);
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->deleteJson($this->url($server, '/a'))->assertStatus(400);
        $this->assertSame([], $this->node->cancelled);

        $worker = $this->subuser($server, [Permission::ACTION_FILE_READ, Permission::ACTION_FILE_CREATE]);
        $this->actingAs($worker)->deleteJson($this->url($server, '/a'))->assertStatus(204);
        $this->assertSame(['a'], $this->node->cancelled);
        $this->assertTrue(ActivityLog::query()->where('event', 'server:job.cancel')->exists());
    }

    // ---- imports --------------------------------------------------------------------------------------------------------

    public function testAnImportStartsAsAJobAndTheNodeGetsTheLogin(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $response = $this->actingAs($owner)->postJson($this->url($server, '/import'), $this->form(['fingerprint' => 'SHA256:abc']));

        $response->assertStatus(202)->assertJsonPath('object', 'server_job')->assertJsonPath('attributes.type', 'import');
        $sent = $this->node->started[0];
        $this->assertSame('import', $sent['type']);
        $this->assertSame('hunter2-secret', $sent['payload']['password']);
        $this->assertSame('SHA256:abc', $sent['payload']['fingerprint']);
        $this->assertSame('/srv/mc', $sent['payload']['path']);
        $this->assertFalse($sent['payload']['overwrite']);
    }

    public function testTheLoginIsNeverKept(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->postJson($this->url($server, '/import'), $this->form(['private_key' => "-----BEGIN KEY-----\nsecret\n-----END KEY-----", 'passphrase' => 'phrase-secret']))->assertStatus(202);

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

        $this->actingAs($adder)->postJson($this->url($server, '/import'), $this->form(['overwrite' => true]))->assertStatus(400);
        $this->assertSame([], $this->node->started, 'the node was not asked');

        $this->postJson($this->url($server, '/import'), $this->form(['overwrite' => false]))->assertStatus(202);
        $this->assertCount(1, $this->node->started);
    }

    public function testWhatTheNodeRefusesIsShownInItsWords(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->refuse = 'An import is already running for this server.';

        $response = $this->actingAs($owner)->postJson($this->url($server, '/import'), $this->form());

        $response->assertStatus(400);
        $this->assertStringContainsString('already running', json_encode($response->json()));
    }

    public function testThePeopleWhoMayNotCreateFilesCanNotImport(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->postJson($this->url($server, '/import'), $this->form())->assertStatus(403);
        $this->assertSame([], $this->node->started);
    }

    // ---- downloads ------------------------------------------------------------------------------------------------------

    public function testAListOfDownloadsStartsAsOneJob(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $response = $this->actingAs($owner)->postJson($this->url($server, '/pull'), ['files' => [
            ['url' => 'https://cdn.example/a.jar', 'directory' => '/mods', 'filename' => 'a.jar'],
            ['url' => 'https://cdn.example/b.jar'],
        ]]);

        $response->assertStatus(202)->assertJsonPath('attributes.type', 'pull');
        $this->assertSame([
            ['url' => 'https://cdn.example/a.jar', 'directory' => '/mods', 'filename' => 'a.jar'],
            ['url' => 'https://cdn.example/b.jar', 'directory' => '/'],
        ], $this->node->started[0]['payload']['files']);
        $log = ActivityLog::query()->where('event', 'server:file.pull')->latest('id')->firstOrFail();
        $this->assertSame(2, $log->properties['count']);
    }

    public function testTheListOfDownloadsIsChecked(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $url = $this->url($server, '/pull');

        $this->actingAs($owner)->postJson($url, ['files' => []])->assertStatus(422);
        $this->postJson($url, [])->assertStatus(422);
        $this->postJson($url, ['files' => [['url' => 'not a url']]])->assertStatus(422);
        $this->postJson($url, ['files' => array_map(fn ($i) => ['url' => "https://cdn.example/$i.jar"], range(1, 501))])->assertStatus(422);
        $this->assertSame([], $this->node->started);
    }

    public function testDownloadsNeedTheRightToCreateFiles(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->postJson($this->url($server, '/pull'), ['files' => [['url' => 'https://cdn.example/a.jar']]])->assertStatus(403);
        $this->assertSame([], $this->node->started);
    }

    // ---- archives (the file manager follows these through its task endpoint) ---------------------------------------------

    public function testCompressStartsAJobAndAnswersWithItsId(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $response = $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/compress", ['root' => '/', 'files' => ['world', 'plugins']]);

        $response->assertStatus(202)->assertJsonPath('task', 'job-1');
        $this->assertSame(['type' => 'compress', 'payload' => ['root' => '/', 'files' => ['world', 'plugins']]], $this->node->started[0]);
        $this->assertTrue(ActivityLog::query()->where('event', 'server:file.compress')->exists());
    }

    public function testDecompressStartsAJob(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/decompress", ['root' => '/backups', 'file' => 'old.zip'])->assertStatus(202)->assertJsonPath('task', 'job-1');
        $this->assertSame(['type' => 'decompress', 'payload' => ['root' => '/backups', 'file' => 'old.zip']], $this->node->started[0]);
    }

    public function testTheTaskEndpointTellsHowTheJobIs(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $task = fn (string $id) => "/api/client/servers/{$server->uuid}/files/task/{$id}";
        $this->node->add(['id' => 'run', 'status' => 'running']);
        $this->node->add(['id' => 'scan', 'status' => 'scanning']);
        $this->node->add(['id' => 'bad', 'status' => 'failed', 'error' => 'the archive is in a format Wings does not understand']);
        $this->node->add(['id' => 'stop', 'status' => 'cancelled']);
        $this->node->add(['id' => 'cut', 'status' => 'interrupted', 'error' => 'The node was restarted']);
        $this->node->add(['id' => 'extracted', 'status' => 'finished']);

        $this->actingAs($owner)->getJson($task('run'))->assertOk()->assertJson(['status' => 'running']);
        $this->getJson($task('scan'))->assertJson(['status' => 'running']);
        $this->getJson($task('bad'))->assertJson(['status' => 'failed', 'error' => 'the archive is in a format Wings does not understand']);
        $this->getJson($task('stop'))->assertJson(['status' => 'failed', 'error' => 'Cancelled.']);
        $this->getJson($task('cut'))->assertJson(['status' => 'failed']);
        $this->getJson($task('extracted'))->assertJson(['status' => 'done', 'file' => null]);
        $this->getJson($task('missing'))->assertStatus(404)->assertJson(['status' => 'unknown']);
    }

    public function testAFinishedArchiveIsHandedBackAsAFile(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->add(['id' => 'made', 'status' => 'finished', 'result' => ['name' => 'archive-1.tar.gz', 'directory' => '/world', 'size' => 99]]);
        $this->folders->entries['/world'] = [
            ['name' => 'level.dat', 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 5, 'is_file' => true, 'is_symlink' => false, 'mimetype' => 'application/octet-stream', 'created_at' => '2026-10-16T10:00:00+00:00', 'modified_at' => '2026-10-16T10:00:00+00:00'],
            ['name' => 'archive-1.tar.gz', 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 99, 'is_file' => true, 'is_symlink' => false, 'mimetype' => 'application/gzip', 'created_at' => '2026-10-16T10:00:00+00:00', 'modified_at' => '2026-10-16T10:00:00+00:00'],
        ];

        $response = $this->actingAs($owner)->getJson("/api/client/servers/{$server->uuid}/files/task/made");

        $response->assertOk()->assertJson(['status' => 'done'])->assertJsonPath('file.attributes.name', 'archive-1.tar.gz');
    }
}

/** A node with background jobs, in memory. */
class FakeJobsNode extends DaemonJobRepository
{
    /** @var list<array{type: string, payload: array<string, mixed>}> */
    public array $started = [];

    /** @var list<string> */
    public array $cancelled = [];

    public ?string $refuse = null;

    /** @var array<string, array<string, mixed>> */
    private array $jobs = [];

    public function __construct()
    {
    }

    public function setServer($server): static
    {
        return $this;
    }

    /** @param array<string, mixed> $job */
    public function add(array $job): void
    {
        $this->jobs[$job['id']] = $job + ['type' => 'import', 'title' => 'A job', 'status' => 'running', 'failures' => [], 'warnings' => []];
    }

    public function list(): array
    {
        return array_values($this->jobs);
    }

    public function show(string $id): ?array
    {
        return $this->jobs[$id] ?? null;
    }

    public function start(string $type, array $payload): array
    {
        if ($this->refuse !== null) {
            throw new DisplayException($this->refuse);
        }
        $this->started[] = ['type' => $type, 'payload' => $payload];
        $job = ['id' => 'job-' . count($this->started), 'type' => $type, 'title' => ucfirst($type), 'status' => 'scanning'];
        $this->add($job);

        return $job;
    }

    public function cancel(string $id): void
    {
        $this->cancelled[] = $id;
    }
}

/** A node that lists folders. */
class FakeFolderNode extends DaemonFileRepository
{
    /** @var array<string, list<array<string, mixed>>> */
    public array $entries = [];

    public function __construct()
    {
    }

    public function setServer($server): static
    {
        return $this;
    }

    public function getDirectory(string $path): array
    {
        return $this->entries[$path] ?? [];
    }
}
