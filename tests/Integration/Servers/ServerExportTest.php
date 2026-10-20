<?php

namespace Pterodactyl\Tests\Integration\Servers;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Task;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Services\Servers\ServerExportService;
use Pterodactyl\Services\Servers\ServerImportService;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

class ServerExportTest extends RoleTestCase
{
    use CreatesTestModels;

    private function server(): Server
    {
        $egg = Egg::query()->firstOrFail();

        return $this->createServerModel([
            'user_id' => $this->makeUser()->id,
            'egg_id' => $egg->id,
            'nest_id' => $egg->nest_id,
            'name' => 'Survival',
            'memory' => 2048,
        ]);
    }

    private function schedule(Server $server): Schedule
    {
        $schedule = Schedule::query()->create([
            'server_id' => $server->id, 'name' => 'Nightly restart', 'cron_minute' => '0', 'cron_hour' => '4',
            'cron_day_of_month' => '*', 'cron_month' => '*', 'cron_day_of_week' => '*', 'is_active' => true, 'only_when_online' => true,
        ]);
        Task::query()->create(['schedule_id' => $schedule->id, 'sequence_id' => 1, 'action' => 'command', 'payload' => 'say restarting', 'time_offset' => 0, 'continue_on_failure' => false]);
        Task::query()->create(['schedule_id' => $schedule->id, 'sequence_id' => 2, 'action' => 'power', 'payload' => 'restart', 'time_offset' => 30, 'continue_on_failure' => true]);

        return $schedule;
    }

    public function testTheExportHoldsTheSettingsTheEggAndTheSchedules(): void
    {
        $server = $this->server();
        $this->schedule($server);

        $document = app(ServerExportService::class)->handle($server);

        $this->assertSame('stratosphere-server', $document['format']);
        $this->assertSame('Survival', $document['server']['name']);
        $this->assertSame(2048, $document['server']['limits']['memory']);
        $this->assertSame($server->user->email, $document['server']['owner_email']);
        $this->assertSame(Egg::query()->firstOrFail()->uuid, $document['egg']['uuid']);
        $this->assertSame('Nightly restart', $document['schedules'][0]['name']);
        $this->assertSame(['command', 'power'], array_column($document['schedules'][0]['tasks'], 'action'));
        $this->assertSame($server->node->fqdn, $document['files']['sftp_host']);
    }

    public function testAnExportedFileMakesTheSchedulesOnAnotherServer(): void
    {
        $source = $this->server();
        $this->schedule($source);
        $document = json_encode(app(ServerExportService::class)->handle($source->refresh()), JSON_THROW_ON_ERROR);
        $target = $this->server();

        $this->assertSame(1, app(ServerImportService::class)->restoreSchedules($target, $document));

        $schedule = Schedule::query()->where('server_id', $target->id)->firstOrFail();
        $this->assertSame('Nightly restart', $schedule->name);
        $this->assertTrue($schedule->only_when_online);
        $this->assertNotNull($schedule->next_run_at);
        $this->assertSame(['say restarting', 'restart'], $schedule->tasks->sortBy('sequence_id')->pluck('payload')->all());
        $this->assertSame(30, $schedule->tasks->firstWhere('sequence_id', 2)->time_offset);
    }

    public function testNothingIsMadeFromGarbage(): void
    {
        $target = $this->server();
        $service = app(ServerImportService::class);

        $this->assertSame(0, $service->restoreSchedules($target, null));
        $this->assertSame(0, $service->restoreSchedules($target, 'not json'));
        $this->assertSame(0, $service->restoreSchedules($target, '{"format":"other","schedules":[{"name":"x"}]}'));
        $this->assertSame(0, Schedule::query()->where('server_id', $target->id)->count());
    }

    public function testATaskWithAnUnknownActionIsLeftOut(): void
    {
        $target = $this->server();
        $json = json_encode(['format' => 'stratosphere-server', 'schedules' => [[
            'name' => 'Odd', 'cron' => ['minute' => '*/5', 'hour' => '*', 'day_of_month' => '*', 'month' => '*', 'day_of_week' => '*'],
            'tasks' => [['action' => 'rm -rf', 'payload' => 'x'], ['action' => 'command', 'payload' => 'list']],
        ]]]);

        $this->assertSame(1, app(ServerImportService::class)->restoreSchedules($target, $json));
        $this->assertSame(['list'], Schedule::query()->where('server_id', $target->id)->firstOrFail()->tasks->pluck('payload')->all());
    }

    public function testAPlainUserCannotDownloadTheExport(): void
    {
        $server = $this->server();

        $this->actingAs($this->makeUser())->get('/admin/servers/view/' . $server->id . '/export')->assertForbidden();
    }

    public function testAnAdminDownloadsTheExport(): void
    {
        $server = $this->server();

        $response = $this->actingAs($this->rootAdmin())->get('/admin/servers/view/' . $server->id . '/export')->assertOk();
        $this->assertStringContainsString('attachment; filename="survival.stratserver.json"', $response->headers->get('Content-Disposition'));
        $this->assertSame('Survival', $response->json('server.name'));
    }

    public function testTheOwnerGetsTheExportFromTheClientApi(): void
    {
        $server = $this->server();

        $this->actingAs($server->user)->getJson('/api/client/servers/' . $server->uuid . '/settings/export')
            ->assertOk()
            ->assertJsonPath('format', 'stratosphere-server')
            ->assertJsonPath('server.name', 'Survival');
    }

    public function testASubuserCannotExport(): void
    {
        $server = $this->server();
        $subuser = $this->makeUser();
        \Pterodactyl\Models\Subuser::query()->create(['user_id' => $subuser->id, 'server_id' => $server->id, 'permissions' => ['settings.rename']]);

        $this->actingAs($subuser)->getJson('/api/client/servers/' . $server->uuid . '/settings/export')->assertStatus(400);
    }

    public function testTheCreatePageLoadsTheImportScripts(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->page('/admin/servers/new')->assertOk()->assertSee('Import a Server')->assertSee('stratserver-file.js', false);
    }
}
