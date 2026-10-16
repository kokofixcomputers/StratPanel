<?php

namespace Pterodactyl\Tests\Integration\Trash;

use Pterodactyl\Models\Task;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\ServerTrashItem;
use Illuminate\Support\Facades\Hash;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

class TrashTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private const DOMAIN = 'trash-test.example';

    private FakeDaemonFiles $node;

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        $this->node = new FakeDaemonFiles();
        $this->app->instance(DaemonFileRepository::class, $this->node);
        config(['trash.enabled' => true, 'trash.retention_days' => 30]);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        $ids = User::query()->where('email', 'like', '%@' . self::DOMAIN)->pluck('id');
        $servers = \DB::table('servers')->whereIn('owner_id', $ids)->pluck('id');
        \DB::table('server_trash')->whereIn('server_id', $servers)->delete();
        \DB::table('schedules')->whereIn('server_id', $servers)->delete();
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();
    }

    private function user(): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(['username' => $name, 'email' => $name . '@' . self::DOMAIN, 'password' => Hash::make('correct-horse-battery')]);
    }

    private function server(?User $owner = null): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(['user_id' => ($owner ?? $this->user())->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);
    }

    /** @param  list<string>  $permissions */
    private function subuser(Server $server, array $permissions): User
    {
        $user = $this->user();
        Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => $permissions]);

        return $user;
    }

    private function url(Server $server, string $path = ''): string
    {
        return "/api/client/servers/{$server->uuid}$path";
    }

    private function removeFiles(Server $server, string $root, array $files, array $extra = [])
    {
        return $this->postJson($this->url($server, '/files/delete'), array_merge(['root' => $root, 'files' => $files], $extra));
    }

    /** What is on the disk apart from the (empty) folder of the trash bin itself. */
    private function userPaths(Server $server): array
    {
        return array_values(array_diff($this->node->paths($server), ['.stratosphere-trash']));
    }

    private function trashIds(Server $server): array
    {
        return ServerTrashItem::query()->where('server_id', $server->id)->pluck('uuid')->all();
    }

    // ---- the switch -----------------------------------------------------------------------------------------------------

    public function testItIsOffUntilAnAdminTurnsItOn(): void
    {
        $this->assertFalse(config('trash.enabled') && false);
        $fresh = require base_path('config/trash.php');
        $this->assertFalse($fresh['enabled']);
        $this->assertSame(30, $fresh['retention_days']);
    }

    public function testWithTheTrashBinOffDeletingDeletes(): void
    {
        config(['trash.enabled' => false]);
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/notes.txt');

        $this->actingAs($owner)->removeFiles($server, '/', ['notes.txt'])->assertNoContent();

        $this->assertFalse($this->node->has($server, 'notes.txt'));
        $this->assertSame([], $this->trashIds($server));
        $this->assertSame([], $this->userPaths($server));
    }

    // ---- putting things in ----------------------------------------------------------------------------------------------

    public function testDeletingMovesFilesToTheTrashBin(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/world/level.dat', 1234);

        $this->actingAs($owner)->removeFiles($server, '/world', ['level.dat'])->assertNoContent();

        $this->assertFalse($this->node->has($server, 'world/level.dat'));
        $item = ServerTrashItem::query()->where('server_id', $server->id)->firstOrFail();
        $this->assertSame('file', $item->type);
        $this->assertSame('level.dat', $item->name);
        $this->assertSame('/world', $item->path);
        $this->assertSame(1234, $item->size);
        $this->assertSame($owner->id, $item->deleted_by);
        $this->assertTrue($this->node->has($server, ".stratosphere-trash/{$item->uuid}/level.dat"));
        $this->assertEqualsWithDelta(now()->addDays(30)->timestamp, $item->expires_at->timestamp, 5);
    }

    public function testFoldersAndSeveralThingsAtOnce(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/mods', 0, true);
        $this->node->seed($server, '/mods/a.jar', 5);
        $this->node->seed($server, '/mods/b.jar', 5);
        $this->node->seed($server, '/eula.txt', 7);

        $this->actingAs($owner)->removeFiles($server, '/', ['mods', 'eula.txt'])->assertNoContent();

        $items = ServerTrashItem::query()->where('server_id', $server->id)->get()->keyBy('name');
        $this->assertSame('directory', $items['mods']->type);
        $this->assertNull($items['mods']->size);
        $this->assertSame('file', $items['eula.txt']->type);
        $this->assertTrue($this->node->has($server, ".stratosphere-trash/{$items['mods']->uuid}/mods/a.jar"));
        $this->assertFalse($this->node->has($server, 'mods'));
    }

    public function testTheRetentionIsWhatTheAdminSet(): void
    {
        config(['trash.retention_days' => 7]);
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');

        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();

        $this->assertEqualsWithDelta(now()->addDays(7)->timestamp, ServerTrashItem::query()->firstOrFail()->expires_at->timestamp, 5);
    }

    public function testANameThatIsNotThereIsNotAnError(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->removeFiles($server, '/', ['nothing.txt'])->assertNoContent();

        $this->assertSame([], $this->trashIds($server));
    }

    public function testANodeThatIsDownLeavesEverythingAsItWas(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->node->down = true;

        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertStatus(504);

        $this->assertSame([], $this->trashIds($server));
        $this->node->down = false;
        $this->assertTrue($this->node->has($server, 'a.txt'));
    }

    public function testOnlyPeopleWhoMayDeleteDelete(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $reader = $this->subuser($server, [Permission::ACTION_FILE_READ]);

        $this->actingAs($reader)->removeFiles($server, '/', ['a.txt'])->assertStatus(403);

        $this->assertTrue($this->node->has($server, 'a.txt'));
    }

    public function testTheTrashBinOfAnotherServerIsNotUsed(): void
    {
        $one = $this->server($owner = $this->user());
        $two = $this->server($owner);
        $this->node->seed($one, '/a.txt');
        $this->node->seed($two, '/a.txt');

        $this->actingAs($owner)->removeFiles($one, '/', ['a.txt'])->assertNoContent();

        $this->assertTrue($this->node->has($two, 'a.txt'));
        $this->assertSame([], $this->trashIds($two));
    }

    // ---- skipping it ----------------------------------------------------------------------------------------------------

    public function testSomebodyWhoMayEmptyTheTrashBinMaySkipIt(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/.tmp-upload');

        $this->actingAs($owner)->removeFiles($server, '/', ['.tmp-upload'], ['skip_trash' => true])->assertNoContent();

        $this->assertFalse($this->node->has($server, '.tmp-upload'));
        $this->assertSame([], $this->trashIds($server));
    }

    public function testSomebodyWhoMayNotEmptyItCanNotSkipIt(): void
    {
        $server = $this->server();
        $helper = $this->subuser($server, [Permission::ACTION_FILE_READ, Permission::ACTION_FILE_DELETE]);
        $this->node->seed($server, '/a.txt');

        $this->actingAs($helper)->removeFiles($server, '/', ['a.txt'], ['skip_trash' => true])->assertNoContent();

        $this->assertCount(1, $this->trashIds($server), 'it was kept in spite of the request');
    }

    // ---- looking --------------------------------------------------------------------------------------------------------

    public function testTheTrashBinIsListed(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt', 99);
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();

        $response = $this->getJson($this->url($server, '/trash'))->assertOk()
            ->assertJsonPath('enabled', true)->assertJsonPath('retention_days', 30)
            ->assertJsonPath('data.0.name', 'a.txt')->assertJsonPath('data.0.type', 'file')
            ->assertJsonPath('data.0.path', '/')->assertJsonPath('data.0.size', 99)
            ->assertJsonPath('data.0.deleted_by', $owner->username);
        $this->assertNotEmpty($response->json('data.0.id'));
        $this->assertNotEmpty($response->json('data.0.expires_at'));
    }

    public function testTheListIsStillThereWhenTheTrashBinIsTurnedOff(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();

        config(['trash.enabled' => false]);

        $this->getJson($this->url($server, '/trash'))->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(1, 'data');
    }

    public function testOnlyThoseWhoMaySeeItSeeIt(): void
    {
        $server = $this->server();
        $nobody = $this->subuser($server, [Permission::ACTION_FILE_READ, Permission::ACTION_FILE_DELETE]);
        $viewer = $this->subuser($server, [Permission::ACTION_TRASH_READ]);

        $this->actingAs($nobody)->getJson($this->url($server, '/trash'))->assertStatus(403);
        $this->actingAs($viewer)->getJson($this->url($server, '/trash'))->assertOk();
        $this->actingAs($this->user())->getJson($this->url($server, '/trash'))->assertNotFound();
    }

    public function testTheServerSaysWhetherTheTrashBinIsOn(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->getJson($this->url($server))->assertOk()
            ->assertJsonPath('attributes.trash.enabled', true)->assertJsonPath('attributes.trash.retention_days', 30);

        config(['trash.enabled' => false]);
        $this->getJson($this->url($server))->assertJsonPath('attributes.trash.enabled', false);
    }

    public function testTheSubuserPermissionsAreOfferedWithTheirDescriptions(): void
    {
        $server = $this->server($owner = $this->user());

        $response = $this->actingAs($owner)->getJson('/api/client/permissions')->assertOk();

        $trash = $response->json('attributes.permissions.trash');
        $this->assertSame(['read', 'restore', 'delete'], array_keys($trash['keys']));
        $this->assertNotEmpty($trash['description']);
        $this->assertNotNull($server);
    }

    // ---- the folder of the trash bin ------------------------------------------------------------------------------------

    public function testTheFolderIsNotInTheFileManager(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->node->seed($server, '/b.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();

        $names = collect($this->getJson($this->url($server, '/files/list?directory=/'))->assertOk()->json('data'))->pluck('attributes.name')->all();

        $this->assertSame(['b.txt'], $names);
    }

    public function testNothingCanTouchTheFolderThroughTheFileManager(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        $id = $this->trashIds($server)[0];
        $before = $this->node->paths($server);

        $this->getJson($this->url($server, '/files/list?directory=/.stratosphere-trash'))->assertNotFound();
        $this->getJson($this->url($server, '/files/list?directory=/./.stratosphere-trash/' . $id))->assertNotFound();
        $this->getJson($this->url($server, '/files/list?directory=/x/../.stratosphere-trash'))->assertNotFound();
        $this->getJson($this->url($server, "/files/contents?file=/.stratosphere-trash/$id/a.txt"))->assertNotFound();
        $this->putJson($this->url($server, '/files/rename'), ['root' => '/.stratosphere-trash/' . $id, 'files' => [['from' => 'a.txt', 'to' => '../../stolen.txt']]])->assertNotFound();
        $this->putJson($this->url($server, '/files/rename'), ['root' => '/', 'files' => [['from' => '.stratosphere-trash', 'to' => 'mine']]])->assertNotFound();
        $this->removeFiles($server, '/', ['.stratosphere-trash'])->assertNotFound();
        $this->removeFiles($server, '/.stratosphere-trash', [$id])->assertNotFound();
        $this->postJson($this->url($server, '/files/create-folder'), ['root' => '/', 'name' => '.stratosphere-trash'])->assertNotFound();
        $this->postJson($this->url($server, '/files/compress'), ['root' => '/', 'files' => ['.stratosphere-trash']])->assertNotFound();

        $this->assertSame($before, $this->node->paths($server));
    }

    public function testOrdinaryFilesWithSimilarNamesAreFine(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/.stratosphere-trash-not', 1);
        $this->node->seed($server, '/world/.stratosphere-trash', 1);

        $this->actingAs($owner)->removeFiles($server, '/world', ['.stratosphere-trash'])->assertNoContent();
        $this->actingAs($owner)->removeFiles($server, '/', ['.stratosphere-trash-not'])->assertNoContent();
    }

    // ---- getting things back --------------------------------------------------------------------------------------------

    public function testAFileComesBackWhereItWas(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/world/level.dat', 50);
        $this->actingAs($owner)->removeFiles($server, '/world', ['level.dat'])->assertNoContent();
        $id = $this->trashIds($server)[0];

        $this->postJson($this->url($server, "/trash/$id/restore"))->assertOk()->assertJsonPath('restored_to', '/world/level.dat');

        $this->assertTrue($this->node->has($server, 'world/level.dat'));
        $this->assertSame([], $this->trashIds($server));
        $this->assertSame(['world', 'world/level.dat'], array_values(array_filter($this->node->paths($server), fn ($p) => !str_starts_with($p, '.stratosphere'))));
        $this->assertFalse($this->node->has($server, ".stratosphere-trash/$id"), 'its folder in the trash bin is gone');
    }

    public function testAFolderComesBackWithEverythingInIt(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/mods/a.jar');
        $this->node->seed($server, '/mods/sub/b.jar');
        $this->actingAs($owner)->removeFiles($server, '/', ['mods'])->assertNoContent();

        $this->postJson($this->url($server, '/trash/' . $this->trashIds($server)[0] . '/restore'))->assertOk();

        $this->assertTrue($this->node->has($server, 'mods/a.jar'));
        $this->assertTrue($this->node->has($server, 'mods/sub/b.jar'));
    }

    public function testNothingIsOverwrittenWhenSomethingIsThereNow(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt', 1);
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        $this->node->seed($server, '/a.txt', 2);
        $this->node->seed($server, '/a (restored).txt', 3);

        $this->postJson($this->url($server, '/trash/' . $this->trashIds($server)[0] . '/restore'))->assertOk()->assertJsonPath('restored_to', '/a (restored 2).txt');

        $this->assertTrue($this->node->has($server, 'a (restored 2).txt'));
        $this->assertSame(2, $this->node->disks[$server->uuid]['a.txt']['size'], 'the file that is there was not touched');
    }

    public function testTheFolderItWasInIsMadeAgain(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/deep/er/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/deep/er', ['a.txt'])->assertNoContent();
        $this->actingAs($owner)->removeFiles($server, '/', ['deep'])->assertNoContent();

        $item = ServerTrashItem::query()->where('name', 'a.txt')->firstOrFail();
        $this->postJson($this->url($server, "/trash/{$item->uuid}/restore"))->assertOk();

        $this->assertTrue($this->node->has($server, 'deep/er/a.txt'));
    }

    public function testRecoveringNeedsTheRightToRecoverAndToCreateFiles(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        $id = $this->trashIds($server)[0];

        $onlyRead = $this->subuser($server, [Permission::ACTION_TRASH_READ]);
        $noCreate = $this->subuser($server, [Permission::ACTION_TRASH_READ, Permission::ACTION_TRASH_RESTORE]);
        $enough = $this->subuser($server, [Permission::ACTION_TRASH_READ, Permission::ACTION_TRASH_RESTORE, Permission::ACTION_FILE_CREATE]);

        $this->actingAs($onlyRead)->postJson($this->url($server, "/trash/$id/restore"))->assertStatus(403);
        $this->actingAs($noCreate)->postJson($this->url($server, "/trash/$id/restore"))->assertStatus(403);
        $this->assertSame([$id], $this->trashIds($server));

        $this->actingAs($enough)->postJson($this->url($server, "/trash/$id/restore"))->assertOk();
        $this->assertTrue($this->node->has($server, 'a.txt'));
    }

    public function testOtherServersItemsAreNotFound(): void
    {
        $owner = $this->user();
        $one = $this->server($owner);
        $two = $this->server($owner);
        $this->node->seed($one, '/a.txt');
        $this->actingAs($owner)->removeFiles($one, '/', ['a.txt'])->assertNoContent();
        $id = $this->trashIds($one)[0];

        $this->postJson($this->url($two, "/trash/$id/restore"))->assertNotFound();
        $this->deleteJson($this->url($two, "/trash/$id"))->assertNotFound();
        $this->assertSame([$id], $this->trashIds($one));
    }

    public function testNothingThatIsNotThereIsFound(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $this->actingAs($owner)->postJson($this->url($server, '/trash/' . \Illuminate\Support\Str::uuid() . '/restore'))->assertNotFound();
        $this->postJson($this->url($server, '/trash/not-an-id/restore'))->assertNotFound();
    }

    // ---- deleting for good ----------------------------------------------------------------------------------------------

    public function testAnItemIsDeletedForGood(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        $id = $this->trashIds($server)[0];

        $this->deleteJson($this->url($server, "/trash/$id"))->assertNoContent();

        $this->assertSame([], $this->trashIds($server));
        $this->assertSame([], $this->userPaths($server));
    }

    public function testTheTrashBinIsEmptied(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        foreach (['a', 'b', 'c'] as $name) {
            $this->node->seed($server, "/$name.txt");
        }
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt', 'b.txt', 'c.txt'])->assertNoContent();
        $this->assertCount(3, $this->trashIds($server));

        $this->deleteJson($this->url($server, '/trash'))->assertNoContent();

        $this->assertSame([], $this->trashIds($server));
        $this->assertSame([], $this->userPaths($server));
    }

    public function testDeletingForGoodNeedsItsOwnPermission(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        $id = $this->trashIds($server)[0];
        $helper = $this->subuser($server, [Permission::ACTION_TRASH_READ, Permission::ACTION_TRASH_RESTORE, Permission::ACTION_FILE_DELETE]);

        $this->actingAs($helper)->deleteJson($this->url($server, "/trash/$id"))->assertStatus(403);
        $this->deleteJson($this->url($server, '/trash'))->assertStatus(403);
        $this->assertSame([$id], $this->trashIds($server));
    }

    // ---- expiring -------------------------------------------------------------------------------------------------------

    public function testWhatHasExpiredIsDeletedAndTheRestStays(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/old.txt');
        $this->node->seed($server, '/new.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['old.txt', 'new.txt'])->assertNoContent();
        ServerTrashItem::query()->where('name', 'old.txt')->update(['expires_at' => now()->subMinute()]);

        $this->artisan('p:trash:purge')->assertExitCode(0);

        $this->assertSame(['new.txt'], ServerTrashItem::query()->pluck('name')->all());
        $paths = $this->node->paths($server);
        $this->assertCount(3, $paths, 'the trash folder, and the folder and file of the one that stays');
        $this->assertTrue($this->node->has($server, '.stratosphere-trash/' . ServerTrashItem::query()->firstOrFail()->uuid . '/new.txt'));
    }

    public function testANodeThatIsDownKeepsTheItemForNextTime(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        ServerTrashItem::query()->update(['expires_at' => now()->subMinute()]);

        $this->node->down = true;
        $this->artisan('p:trash:purge')->assertExitCode(0);
        $this->assertSame(1, ServerTrashItem::query()->count());

        $this->node->down = false;
        $this->artisan('p:trash:purge')->assertExitCode(0);
        $this->assertSame(0, ServerTrashItem::query()->count());
        $this->assertSame([], $this->userPaths($server));
    }

    public function testItIsPurgedEvenWhenTheTrashBinWasTurnedOff(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();
        ServerTrashItem::query()->update(['expires_at' => now()->subMinute()]);
        config(['trash.enabled' => false]);

        $this->artisan('p:trash:purge')->assertExitCode(0);

        $this->assertSame(0, ServerTrashItem::query()->count());
    }

    public function testThePurgeIsScheduled(): void
    {
        $events = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->map(fn ($e) => $e->command);

        $this->assertTrue($events->contains(fn ($c) => str_contains((string) $c, 'p:trash:purge')));
    }

    // ---- schedules ------------------------------------------------------------------------------------------------------

    private function schedule(Server $server): Schedule
    {
        $schedule = Schedule::query()->create([
            'server_id' => $server->id, 'name' => 'Nightly', 'cron_day_of_week' => '*', 'cron_month' => '*', 'cron_day_of_month' => '*',
            'cron_hour' => '3', 'cron_minute' => '0', 'is_active' => true, 'is_processing' => false, 'only_when_online' => false,
            'next_run_at' => now()->subDay(),
        ]);
        Task::query()->create(['schedule_id' => $schedule->id, 'sequence_id' => 1, 'action' => 'command', 'payload' => 'say hi', 'time_offset' => 0, 'is_queued' => false, 'continue_on_failure' => false]);

        return $schedule;
    }

    public function testADeletedScheduleIsInTheTrashBinAndHiddenEverywhereElse(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);

        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();

        $this->getJson($this->url($server, '/schedules'))->assertOk()->assertJsonCount(0, 'data');
        $this->assertNull(Schedule::query()->find($schedule->id));
        $this->assertNotNull(Schedule::withTrashed()->find($schedule->id));
        $this->getJson($this->url($server, '/trash'))->assertJsonPath('data.0.type', 'schedule')->assertJsonPath('data.0.name', 'Nightly');
    }

    public function testADeletedScheduleIsGoneWithTheTrashBinOff(): void
    {
        config(['trash.enabled' => false]);
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);

        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();

        $this->assertNull(Schedule::withTrashed()->find($schedule->id));
        $this->assertSame([], $this->trashIds($server));
    }

    public function testAScheduleComesBackAndDoesNotRunAtOnce(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);
        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();

        $this->postJson($this->url($server, '/trash/' . $this->trashIds($server)[0] . '/restore'))->assertOk()->assertJsonPath('restored_to', 'Nightly');

        $schedule = Schedule::query()->findOrFail($schedule->id);
        $this->assertTrue($schedule->next_run_at->isFuture());
        $this->assertCount(1, $schedule->tasks);
        $this->assertSame([], $this->trashIds($server));
    }

    public function testAScheduleNeedsTheRightToCreateSchedulesToComeBack(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);
        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();
        $id = $this->trashIds($server)[0];

        $filesOnly = $this->subuser($server, [Permission::ACTION_TRASH_READ, Permission::ACTION_TRASH_RESTORE, Permission::ACTION_FILE_CREATE]);
        $this->actingAs($filesOnly)->postJson($this->url($server, "/trash/$id/restore"))->assertStatus(403);
        $this->assertNull(Schedule::query()->find($schedule->id));
    }

    public function testAnExpiredScheduleIsDeletedForGoodWithItsTasks(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);
        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();
        ServerTrashItem::query()->update(['expires_at' => now()->subMinute()]);

        $this->artisan('p:trash:purge')->assertExitCode(0);

        $this->assertNull(Schedule::withTrashed()->find($schedule->id));
        $this->assertSame(0, Task::query()->where('schedule_id', $schedule->id)->count());
    }

    public function testADeletedScheduleDoesNotRun(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $schedule = $this->schedule($server);
        $this->actingAs($owner)->deleteJson($this->url($server, '/schedules/' . $schedule->id))->assertNoContent();

        $due = Schedule::query()->where('is_active', true)->where('next_run_at', '<=', now())->where('id', $schedule->id)->count();

        $this->assertSame(0, $due);
    }

    // ---- the log --------------------------------------------------------------------------------------------------------

    public function testWhatHappensInTheTrashBinIsLogged(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->node->seed($server, '/b.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt', 'b.txt'])->assertNoContent();
        $ids = $this->trashIds($server);

        $this->postJson($this->url($server, "/trash/{$ids[0]}/restore"))->assertOk();
        $this->deleteJson($this->url($server, "/trash/{$ids[1]}"))->assertNoContent();

        $events = ActivityLog::query()->where('event', 'like', 'server:trash.%')->orWhere('event', 'server:file.delete')->pluck('event')->all();
        $this->assertContains('server:trash.restore', $events);
        $this->assertContains('server:trash.delete', $events);
        $this->assertContains('server:file.delete', $events);
    }

    public function testDeletingAServerTakesItsTrashBinWithIt(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $this->node->seed($server, '/a.txt');
        $this->actingAs($owner)->removeFiles($server, '/', ['a.txt'])->assertNoContent();

        \DB::table('servers')->where('id', $server->id)->delete();

        $this->assertSame(0, ServerTrashItem::query()->where('server_id', $server->id)->count());
    }
}
