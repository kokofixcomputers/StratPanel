<?php

namespace Pterodactyl\Tests\Integration\Backups;

use Carbon\CarbonImmutable;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Models\BackupDestination;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Repositories\Wings\DaemonBackupRepository;
use Pterodactyl\Services\Backups\External\BackupCopyService;
use Pterodactyl\Services\Backups\External\BackupRetentionService;
use Pterodactyl\Services\Backups\External\FolderStore;
use Pterodactyl\Services\Backups\External\Stores;
use Pterodactyl\Services\Backups\External\WebDavStore;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

/** Copies of backups outside the node: where they go, how long they stay, and how they come back. */
class ExternalBackupsTest extends ClientApiIntegrationTestCase
{
    private string $dir;

    public function setUp(): void
    {
        parent::setUp();

        $this->dir = sys_get_temp_dir() . '/ext-backups-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        // The admin pages print how long they took.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }
    }

    public function tearDown(): void
    {
        Stores::reset();
        BackupDestination::query()->delete();
        $this->rm($this->dir);

        parent::tearDown();
    }

    private function rm(string $path): void
    {
        if (is_dir($path)) {
            foreach (scandir($path) as $entry) {
                if ($entry !== '.' && $entry !== '..') {
                    $this->rm($path . '/' . $entry);
                }
            }
            rmdir($path);
        } elseif (is_file($path)) {
            unlink($path);
        }
    }

    private function destination(array $attributes = []): BackupDestination
    {
        return BackupDestination::query()->create($attributes + [
            'name' => 'Folder ' . bin2hex(random_bytes(3)), 'type' => 'folder', 'config' => ['path' => $this->dir],
            'enabled' => true, 'auto_copy' => true, 'delete_local' => false,
        ]);
    }

    private ?Egg $egg = null;

    /** @return array{0: User, 1: \Pterodactyl\Models\Server} the owner of a server of its own (the eggs of the panel are not in the test database) */
    private function account(): array
    {
        $this->egg ??= Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        $user = User::factory()->create();

        return [$user, $this->createServerModel(['owner_id' => $user->id, 'egg_id' => $this->egg->id, 'nest_id' => $this->egg->nest_id])];
    }

    private function backup($server, array $attributes = []): Backup
    {
        return Backup::factory()->create($attributes + ['server_id' => $server->id, 'bytes' => 100, 'ignored_files' => []]);
    }

    private function stored(Backup $backup, BackupDestination $destination, string $contents = 'data'): BackupCopy
    {
        $copy = BackupCopy::query()->create(['backup_id' => $backup->id, 'destination_id' => $destination->id, 'status' => 'stored', 'bytes' => $backup->bytes, 'stored_at' => now()]);
        (new FolderStore($destination->config['path']))->put($copy->fresh()->path(), Utils::streamFor($contents));

        return $copy;
    }

    /** The service reads from this instead of a node. */
    private function readingFrom(string $contents): void
    {
        $this->app->bind(BackupCopyService::class, function ($app) use ($contents) {
            return new class($app->make(Stores::class), $app->make(\Pterodactyl\Services\Backups\DownloadLinkService::class), $app->make(DaemonBackupRepository::class), $app->make(BackupRetentionService::class), $contents) extends BackupCopyService {
                public function __construct($stores, $links, $daemon, $retention, private string $contents)
                {
                    parent::__construct($stores, $links, $daemon, $retention);
                }

                public function source(Backup $backup, ?BackupCopy $not = null): StreamInterface
                {
                    return Utils::streamFor($this->contents);
                }
            };
        });
    }

    // ---- the admin page -------------------------------------------------------------------------------------------

    public function testAdminsAddAFolderAndItsSecretsStayHidden(): void
    {
        $admin = User::factory()->create(['root_admin' => true]);
        $this->actingAs($admin);

        $response = $this->postJson('/api/client/admin/settings/backups', [
            'name' => 'Webdav', 'type' => 'webdav', 'config' => ['url' => 'https://dav.example.com/backups', 'username' => 'me', 'password' => 'hunter2'],
            'keep_last' => 5, 'keep_days' => 30, 'max_gb' => 50, 'delete_local' => true,
        ])->assertStatus(201)->assertJsonPath('config.has_password', true)->assertJsonPath('keep_last', 5)->assertJsonPath('delete_local', true);
        $this->assertStringNotContainsString('hunter2', $response->getContent());
        $id = $response->json('id');

        $this->getJson('/api/client/admin/settings/backups')->assertOk()->assertJsonCount(1, 'destinations');
        $this->assertStringNotContainsString('hunter2', $this->getJson('/api/client/admin/settings/backups')->getContent());

        // A blank password keeps the saved one.
        $this->patchJson('/api/client/admin/settings/backups/' . $id, [
            'name' => 'Webdav 2', 'type' => 'webdav', 'config' => ['url' => 'https://dav.example.com/backups', 'username' => 'me', 'password' => ''],
        ])->assertOk()->assertJsonPath('name', 'Webdav 2');
        $this->assertSame('hunter2', BackupDestination::query()->find($id)->config['password']);

        $this->patchJson('/api/client/admin/settings/backups/' . $id, ['name' => 'x', 'type' => 'folder', 'config' => ['path' => '/tmp']])->assertStatus(400);
        $this->deleteJson('/api/client/admin/settings/backups/' . $id)->assertNoContent();
    }

    public function testTheSettingsAreValidatedAndTried(): void
    {
        $this->actingAs(User::factory()->create(['root_admin' => true]));

        $this->postJson('/api/client/admin/settings/backups', ['name' => 'F', 'type' => 'folder', 'config' => ['path' => 'relative']])->assertStatus(422);
        $this->postJson('/api/client/admin/settings/backups', ['name' => 'S3', 'type' => 's3', 'config' => ['bucket' => 'b', 'key' => 'k']])->assertStatus(400);
        $this->postJson('/api/client/admin/settings/backups', ['name' => 'F', 'type' => 'nope', 'config' => []])->assertStatus(422);

        $this->postJson('/api/client/admin/settings/backups/test', ['type' => 'folder', 'config' => ['path' => $this->dir]])->assertOk()->assertJsonPath('ok', true);
        $this->assertSame([], array_values(array_diff(scandir($this->dir), ['.', '..'])));
        $this->postJson('/api/client/admin/settings/backups/test', ['type' => 'folder', 'config' => ['path' => '/proc/nope/x']])->assertOk()->assertJsonPath('ok', false);
    }

    public function testOnlyAdminsWhoMayManageBackups(): void
    {
        $this->actingAs(User::factory()->create(['root_admin' => false]));
        $this->getJson('/api/client/admin/settings/backups')->assertStatus(403);

        $role = Role::query()->create(['name' => 'ext-backups-' . bin2hex(random_bytes(3)), 'permissions' => ['settings.backups.view'], 'color' => '#3b82f6']);
        $user = User::factory()->create(['root_admin' => false]);
        $user->roles()->attach($role->id);
        $this->actingAs($user);
        $this->getJson('/api/client/admin/settings/backups')->assertOk();
        $this->postJson('/api/client/admin/settings/backups', ['name' => 'F', 'type' => 'folder', 'config' => ['path' => $this->dir]])->assertStatus(403);
        $role->delete();
    }

    // ---- copying ----------------------------------------------------------------------------------------------------

    public function testACompleteBackupIsCopiedToTheDestinationsThatTakeEveryBackup(): void
    {
        [, $server] = $this->account();
        $auto = $this->destination();
        $manual = $this->destination(['auto_copy' => false]);
        $off = $this->destination(['enabled' => false]);
        $this->readingFrom('the archive');

        $backup = $this->backup($server);
        app(BackupCopyService::class)->queueNew($backup);

        $this->assertSame([$auto->id], $backup->copies()->pluck('destination_id')->all());
        $copy = $backup->copies()->first();
        $this->assertSame(BackupCopy::STORED, $copy->status, (string) $copy->error);
        $this->assertSame('the archive', file_get_contents($this->dir . '/' . $server->uuid . '/' . $backup->uuid . '.tar.gz'));
        $this->assertNotNull($copy->stored_at);
    }

    public function testACopyThatFailsSaysWhy(): void
    {
        [, $server] = $this->account();
        $this->destination(['config' => ['path' => '/proc/nope']]);
        $this->readingFrom('x');

        $backup = $this->backup($server);
        app(BackupCopyService::class)->queueNew($backup);

        $copy = $backup->copies()->first();
        $this->assertSame(BackupCopy::FAILED, $copy->status);
        $this->assertNotEmpty($copy->error);
    }

    public function testTheNodeCanLetGoOfTheFileOnceItIsStored(): void
    {
        [, $server] = $this->account();
        $this->destination(['delete_local' => true]);
        $this->readingFrom('x');
        $daemon = $this->mock(DaemonBackupRepository::class);
        $daemon->expects('setServer->delete')->once()->andReturn(new Response());

        $backup = $this->backup($server);
        app(BackupCopyService::class)->queueNew($backup);

        $this->assertTrue($backup->fresh()->local_removed);
    }

    public function testBackfillCopiesWhatWasMadeBefore(): void
    {
        [, $server] = $this->account();
        $this->readingFrom('x');
        $old = $this->backup($server);
        $failed = $this->backup($server, ['is_successful' => false]);
        $destination = $this->destination();

        $this->assertSame(1, app(BackupCopyService::class)->backfill($destination));
        $this->assertSame(1, $old->copies()->count());
        $this->assertSame(0, $failed->copies()->count());
    }

    // ---- how much is kept -------------------------------------------------------------------------------------------

    private function aged(int $server, int $days, array $attributes = []): Backup
    {
        $at = CarbonImmutable::now()->subDays($days);

        return Backup::factory()->create($attributes + ['server_id' => $server, 'ignored_files' => [], 'bytes' => 1024 ** 3, 'created_at' => $at, 'completed_at' => $at]);
    }

    public function testTheNewestAreKept(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination(['keep_last' => 2]);
        $backups = [$this->aged($server->id, 3), $this->aged($server->id, 2), $this->aged($server->id, 1)];
        foreach ($backups as $backup) {
            $this->stored($backup, $destination);
        }

        $this->assertSame(1, app(BackupRetentionService::class)->prune($destination));
        $this->assertSame([false, true, true], array_map(fn ($b) => $b->copies()->exists(), $backups));
        $this->assertFileDoesNotExist($this->dir . '/' . $server->uuid . '/' . $backups[0]->uuid . '.tar.gz');
        $this->assertFileExists($this->dir . '/' . $server->uuid . '/' . $backups[2]->uuid . '.tar.gz');
        // The backup is still on the node, so it stays.
        $this->assertNotNull(Backup::query()->find($backups[0]->id));
    }

    public function testOldOnesGoAndLockedOnesStay(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination(['keep_days' => 10]);
        $old = $this->aged($server->id, 20);
        $oldLocked = $this->aged($server->id, 30, ['is_locked' => true]);
        $fresh = $this->aged($server->id, 1);
        foreach ([$old, $oldLocked, $fresh] as $backup) {
            $this->stored($backup, $destination);
        }

        $this->assertSame(1, app(BackupRetentionService::class)->prune($destination));
        $this->assertFalse($old->copies()->exists());
        $this->assertTrue($oldLocked->copies()->exists());
        $this->assertTrue($fresh->copies()->exists());
    }

    public function testTheSizeIsKeptUnderTheLimit(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination(['max_gb' => 2]);
        $backups = [$this->aged($server->id, 4), $this->aged($server->id, 3), $this->aged($server->id, 2), $this->aged($server->id, 1)];
        foreach ($backups as $backup) {
            $this->stored($backup, $destination);
        }

        // 1 GB each, 2 GB fit: the two newest.
        $this->assertSame(2, app(BackupRetentionService::class)->prune($destination));
        $this->assertSame([false, false, true, true], array_map(fn ($b) => $b->copies()->exists(), $backups));
    }

    public function testEachServerHasItsOwnLimit(): void
    {
        [, $server] = $this->account();
        [, $other] = $this->account();
        $destination = $this->destination(['keep_last' => 1]);
        foreach ([$server, $other] as $s) {
            $this->stored($this->aged($s->id, 1), $destination);
        }

        $this->assertSame(0, app(BackupRetentionService::class)->prune($destination));
        $this->assertSame(2, $destination->copies()->count());
    }

    public function testABackupOnlyTheCopiesHaveIsGoneWhenTheLastCopyIs(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination(['keep_last' => 1]);
        $old = $this->aged($server->id, 5, ['local_removed' => true]);
        $new = $this->aged($server->id, 1, ['local_removed' => true]);
        $this->stored($old, $destination);
        $this->stored($new, $destination);

        app(BackupRetentionService::class)->prune($destination);

        $this->assertNull(Backup::query()->find($old->id));
        $this->assertNotNull(Backup::query()->find($new->id));
    }

    public function testNoLimitsDeleteNothing(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination();
        $this->stored($this->aged($server->id, 400), $destination);

        $this->assertSame(0, app(BackupRetentionService::class)->prune($destination));
    }

    // ---- getting it back --------------------------------------------------------------------------------------------

    public function testACopyIsDownloadedThroughASignedLink(): void
    {
        [$user, $server] = $this->account();
        $destination = $this->destination();
        $backup = $this->backup($server, ['local_removed' => true]);
        $this->stored($backup, $destination, 'archive bytes');

        // The node does not have the file, so the copy is what a download gives.
        $url = $this->actingAs($user)->getJson($this->link($backup, 'download'))->assertOk()->json('attributes.url');
        $this->assertStringContainsString('/backup-copies/', $url);

        $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/x-gzip');
        $this->assertSame('archive bytes', $this->get($url)->streamedContent());
        $this->get(preg_replace('/signature=[^&]+/', 'signature=nope', $url))->assertStatus(403);
    }

    public function testADownloadCanAskForACopy(): void
    {
        [$user, $server] = $this->account();
        $destination = $this->destination();
        $backup = $this->backup($server);
        $this->stored($backup, $destination);

        $this->actingAs($user);
        $this->getJson($this->link($backup, 'download') . '?copy=' . $destination->id)->assertOk();
        $this->getJson($this->link($backup, 'download') . '?copy=' . ($destination->id + 999))->assertStatus(400);
    }

    public function testRestoringReadsFromTheCopyWhenTheNodeHasNoFile(): void
    {
        [$user, $server] = $this->account();
        $destination = $this->destination();
        $backup = $this->backup($server, ['local_removed' => true]);
        $this->stored($backup, $destination);

        $daemon = $this->mock(DaemonBackupRepository::class);
        $daemon->expects('setServer->restore')->with(
            \Mockery::type(Backup::class),
            \Mockery::on(fn ($url) => str_contains($url, '/backup-copies/')),
            true,
            's3',
        )->andReturn(new Response());

        $this->actingAs($user)->postJson($this->link($backup, 'restore'), ['truncate' => true])->assertNoContent();
    }

    public function testTheBackupListSaysWhereTheCopiesAre(): void
    {
        [$user, $server] = $this->account();
        $destination = $this->destination(['name' => 'Offsite']);
        $backup = $this->backup($server);
        $this->stored($backup, $destination);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/backups")->assertOk()
            ->assertJsonPath('data.0.attributes.local', true)
            ->assertJsonPath('data.0.attributes.copies.0.name', 'Offsite')
            ->assertJsonPath('data.0.attributes.copies.0.status', 'stored');
    }

    public function testDeletingABackupDeletesItsCopies(): void
    {
        [$user, $server] = $this->account();
        $destination = $this->destination();
        $backup = $this->backup($server, ['local_removed' => true]);
        $this->stored($backup, $destination);
        $file = $this->dir . '/' . $server->uuid . '/' . $backup->uuid . '.tar.gz';
        $this->assertFileExists($file);

        $this->actingAs($user)->deleteJson($this->link($backup))->assertNoContent();

        $this->assertFileDoesNotExist($file);
        $this->assertSame(0, BackupCopy::query()->where('backup_id', $backup->id)->count());
    }

    public function testADestinationThatHoldsTheOnlyCopyIsNotDeleted(): void
    {
        [, $server] = $this->account();
        $destination = $this->destination();
        $this->stored($this->backup($server, ['local_removed' => true]), $destination);
        $this->actingAs(User::factory()->create(['root_admin' => true]));

        $this->deleteJson('/api/client/admin/settings/backups/' . $destination->id)->assertStatus(400);
        $this->assertNotNull(BackupDestination::query()->find($destination->id));
    }

    // ---- WebDAV ---------------------------------------------------------------------------------------------------

    public function testWebDavMakesTheFoldersAndSendsTheFile(): void
    {
        $history = [];
        $mock = new MockHandler([new Response(405), new Response(201)]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        $store = new WebDavStore('https://dav.example.com/remote.php/dav/files/me/', 'me', 'pw', new Client(['handler' => $stack, 'http_errors' => false, 'auth' => ['me', 'pw']]));

        $store->put('server uuid/backup.tar.gz', Utils::streamFor('abc'));

        $this->assertSame(['MKCOL', 'PUT'], array_slice(array_map(fn ($h) => $h['request']->getMethod(), $history), 0, 2));
        $this->assertSame('https://dav.example.com/remote.php/dav/files/me/server%20uuid/backup.tar.gz', (string) end($history)['request']->getUri());
    }

    public function testWebDavSaysWhyItFailed(): void
    {
        $store = new WebDavStore('https://dav.example.com', '', '', new Client(['handler' => HandlerStack::create(new MockHandler([new Response(401)])), 'http_errors' => false]));

        $this->expectExceptionMessageMatches('/401.*password/');
        $store->delete('x/y.tar.gz');
    }
}
