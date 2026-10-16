<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use Mockery;
use ZipArchive;
use Mockery\MockInterface;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Permission;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Models\InstalledExtension;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

/** The sample extension from extensions/offline-motd, installed from a package like an admin would. */
class OfflineMotdTest extends ExtensionTestCase
{
    use CreatesTestModels;

    private MockInterface $daemon;

    public function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        ServerDomain::query()->delete();
        config(['pterodactyl.domains.router_token' => 'router-secret']);
        $this->daemon = Mockery::mock(DaemonServerRepository::class);
        $this->daemon->shouldReceive('setServer')->andReturnSelf();
        $this->app->instance(DaemonServerRepository::class, $this->daemon);
    }

    /** Packs the folder of the extension, the same files the build script packs. */
    private function pack(): string
    {
        $source = base_path('extensions/offline-motd');
        $path = $this->packages . '/offline-motd.stratext';
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->isFile() && $file->getFilename() !== 'README.md') {
                $zip->addFile($file->getPathname(), substr($file->getPathname(), strlen($source) + 1));
            }
        }
        $zip->close();

        return $path;
    }

    private function motd(array $settings = [], bool $enable = true): InstalledExtension
    {
        $record = $this->install($this->pack(), $enable);
        if ($settings !== []) {
            $record->forceFill(['settings' => $settings])->save();
            $this->manager()->restart();
        }

        return $record;
    }

    private function server(array $attributes = []): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();
        $server = $this->createServerModel(array_merge(['egg_id' => $egg->id, 'nest_id' => $egg->nest_id], $attributes));
        ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => 'play.example.com']);

        return $server;
    }

    private function state(string $state): void
    {
        Cache::flush();
        $this->daemon->shouldReceive('getDetails')->andReturn(['state' => $state]);
    }

    private function ask(): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('Authorization', 'Bearer router-secret')->getJson('/api/router/state?domain=play.example.com');
    }

    // ---- what the router is told ----------------------------------------------------------------------------------------

    public function testNothingChangesWhileTheExtensionIsOff(): void
    {
        $this->motd(['message' => 'Back soon!'], false);
        $this->server();
        $this->state('offline');

        $this->ask()->assertOk()->assertJsonPath('state', 'offline')->assertJsonMissingPath('notice');
    }

    public function testTheAdminsMessageIsSentForAServerThatIsOff(): void
    {
        $this->motd(['message' => 'Back soon, {server}!', 'label' => 'Sleeping']);
        $server = $this->server(['name' => 'Survival']);
        $this->state('offline');

        $this->ask()->assertOk()
            ->assertJsonPath('state', 'offline')
            ->assertJsonPath('notice.label', 'Sleeping')
            ->assertJsonPath('notice.message', 'Back soon, Survival!');
        $this->assertNotNull($server);
    }

    public function testRunningAndStartingServersGetNoMessage(): void
    {
        $this->motd(['message' => 'Back soon!']);
        $this->server();

        foreach (['running', 'starting', 'stopping'] as $state) {
            $this->state($state);
            $this->ask()->assertOk()->assertJsonMissingPath('notice');
        }
    }

    public function testNoMessageMeansNoNotice(): void
    {
        $this->motd(['message' => '']);
        $this->server();
        $this->state('offline');

        $this->ask()->assertOk()->assertJsonMissingPath('notice');
    }

    public function testSleepingServersAreLeftToTheRouterUnlessTheAdminWantsOtherwise(): void
    {
        $this->motd(['message' => 'Off for now']);
        $server = $this->server();
        ServerAutoSleep::query()->create(['server_id' => $server->id, 'enabled' => true, 'slept_at' => now()]);
        $this->state('offline');

        $this->ask()->assertOk()->assertJsonPath('sleeping', true)->assertJsonMissingPath('notice');

        $this->motd(['message' => 'Off for now', 'include_sleeping' => true]);
        $this->ask()->assertOk()->assertJsonPath('sleeping', true)->assertJsonPath('notice.message', 'Off for now');
    }

    public function testAMessageThatBreaksTheExtensionNeverBreaksTheRouter(): void
    {
        $this->motd(['message' => 'Hello']);
        $this->server();
        $this->state('offline');
        // Something else hooks in later and fails.
        \Pterodactyl\Extensions\Hooks::listen('router.state', fn () => throw new \RuntimeException('boom'), 'other');

        $this->ask()->assertOk()->assertJsonPath('notice.message', 'Hello');
    }

    public function testTooLongTextsAreCutByThePanelBeforeTheRouterSeesThem(): void
    {
        $this->motd(['message' => str_repeat('a', 5000), 'label' => str_repeat('b', 200)]);
        $this->server();
        $this->state('offline');

        $notice = $this->ask()->assertOk()->json('notice');
        $this->assertLessThanOrEqual(400, mb_strlen($notice['message']));
        $this->assertLessThanOrEqual(40, mb_strlen($notice['label']));
    }

    // ---- the message of a server ----------------------------------------------------------------------------------------

    private function url(Server $server): string
    {
        return "/api/client/extensions/offline-motd/servers/{$server->uuid}/message";
    }

    public function testTheOwnerSetsTheMessageOfTheirServer(): void
    {
        $this->motd(['message' => 'General']);
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);

        $this->actingAs($owner)->getJson($this->url($server))->assertOk()
            ->assertJsonPath('allowed', true)->assertJsonPath('message', null)->assertJsonPath('default', 'General');

        $this->actingAs($owner)->putJson($this->url($server), ['message' => '  Gone fishing  '])->assertOk()->assertJsonPath('message', 'Gone fishing');

        $this->state('offline');
        $this->ask()->assertJsonPath('notice.message', 'Gone fishing');
    }

    public function testClearingTheMessageFallsBackToTheAdminsMessage(): void
    {
        $this->motd(['message' => 'General']);
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);
        $this->actingAs($owner)->putJson($this->url($server), ['message' => 'Mine'])->assertOk();

        $this->actingAs($owner)->putJson($this->url($server), ['message' => ''])->assertOk()->assertJsonPath('message', null);

        $this->state('offline');
        $this->ask()->assertJsonPath('notice.message', 'General');
    }

    public function testMessagesBelongToTheirServer(): void
    {
        $this->motd();
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);
        $this->actingAs($owner)->putJson($this->url($server), ['message' => 'Mine'])->assertOk();

        $other = $this->createServerModel(['user_id' => $owner->id, 'egg_id' => $server->egg_id, 'nest_id' => $server->nest_id]);
        $this->actingAs($owner)->getJson($this->url($other))->assertOk()->assertJsonPath('message', null);
    }

    public function testTooLongMessagesAreRefused(): void
    {
        $this->motd();
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);

        $this->actingAs($owner)->putJson($this->url($server), ['message' => str_repeat('a', 301)])->assertStatus(422);
        $this->actingAs($owner)->putJson($this->url($server), ['message' => ['x']])->assertStatus(422);
    }

    public function testOnlyThoseWhoMayChangeTheServerChangeTheMessage(): void
    {
        $this->motd();
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);

        $stranger = User::factory()->create();
        $this->actingAs($stranger)->getJson($this->url($server))->assertNotFound();
        $this->actingAs($stranger)->putJson($this->url($server), ['message' => 'x'])->assertStatus(403);

        $helper = User::factory()->create();
        Subuser::query()->create(['user_id' => $helper->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_CONTROL_CONSOLE]]);
        $this->actingAs($helper)->putJson($this->url($server), ['message' => 'x'])->assertStatus(403);

        $trusted = User::factory()->create();
        Subuser::query()->create(['user_id' => $trusted->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_SETTINGS_RENAME, Permission::ACTION_CONTROL_CONSOLE]]);
        $this->actingAs($trusted)->putJson($this->url($server), ['message' => 'ok'])->assertOk();

        $admin = User::factory()->create(['root_admin' => true]);
        $this->actingAs($admin)->putJson($this->url($server), ['message' => 'by admin'])->assertOk();
    }

    public function testNobodyIsLoggedOut(): void
    {
        $this->motd();
        $server = $this->server();

        $this->getJson($this->url($server))->assertUnauthorized();
    }

    public function testTheAdminCanTakeAwayTheServersOwnMessages(): void
    {
        $this->motd(['message' => 'General', 'allow_server_messages' => false]);
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);
        $this->manager()->context('offline-motd')->store()->put('server.' . $server->id, 'Mine from before');

        $this->actingAs($owner)->getJson($this->url($server))->assertOk()->assertJsonPath('allowed', false);
        $this->actingAs($owner)->putJson($this->url($server), ['message' => 'new'])->assertStatus(403);

        $this->state('offline');
        $this->ask()->assertJsonPath('notice.message', 'General');
    }

    public function testTheRouteIsGoneWithTheExtensionAndItsDataStaysForNextTime(): void
    {
        $this->motd(['message' => 'General']);
        $owner = User::factory()->create();
        $server = $this->server(['user_id' => $owner->id]);
        $this->actingAs($owner)->putJson($this->url($server), ['message' => 'Mine'])->assertOk();

        $this->app->make(\Pterodactyl\Extensions\ExtensionInstaller::class)->remove('offline-motd', false);

        $this->assertSame(1, \DB::table('extension_data')->count());
    }
}
