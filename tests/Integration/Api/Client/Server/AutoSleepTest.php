<?php

namespace Pterodactyl\Tests\Integration\Api\Client\Server;

use Mockery;
use Mockery\MockInterface;
use Carbon\CarbonImmutable;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Services\Servers\AutoSleep\AutoSleepService;
use Pterodactyl\Services\Servers\AutoSleep\MinecraftPing;
use Pterodactyl\Repositories\Wings\DaemonPowerRepository;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

class AutoSleepTest extends ClientApiIntegrationTestCase
{
    private MockInterface $daemon;

    private MockInterface $power;

    private MockInterface $ping;

    public function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        $this->daemon = Mockery::mock(DaemonServerRepository::class);
        $this->power = Mockery::mock(DaemonPowerRepository::class);
        $this->ping = Mockery::mock(MinecraftPing::class);
        foreach ([$this->daemon, $this->power] as $repository) {
            $repository->shouldReceive('setServer')->andReturnSelf();
        }
        $this->app->instance(DaemonServerRepository::class, $this->daemon);
        $this->app->instance(DaemonPowerRepository::class, $this->power);
        $this->app->instance(MinecraftPing::class, $this->ping);
    }

    /** This panel only seeds the Java egg, any egg will do for a server that is never started. */
    private function makeServer(array $attributes = []): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(array_merge(['egg_id' => $egg->id, 'nest_id' => $egg->nest_id], $attributes));
    }

    /** @return array{\Pterodactyl\Models\User, Server} an owner, or a subuser who has these permissions */
    private function account(array $permissions = []): array
    {
        $user = \Pterodactyl\Models\User::factory()->create();
        if (empty($permissions)) {
            return [$user, $this->makeServer(['user_id' => $user->id])];
        }

        $server = $this->makeServer();
        \Pterodactyl\Models\Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => $permissions]);

        return [$user, $server];
    }

    private function service(): AutoSleepService
    {
        return $this->app->make(AutoSleepService::class);
    }

    /** A server with auto sleep on. */
    private function sleepy(array $settings = [], array $server = []): Server
    {
        $model = $this->makeServer($server);
        ServerAutoSleep::query()->create(array_merge(['server_id' => $model->id, 'enabled' => true, 'idle_minutes' => 15], $settings));

        return $model->fresh();
    }

    private function row(Server $server): ServerAutoSleep
    {
        return ServerAutoSleep::query()->where('server_id', $server->id)->firstOrFail();
    }

    private function state(string $state): void
    {
        $this->daemon->shouldReceive('getDetails')->andReturn(['state' => $state]);
    }

    // ---- looking at a server --------------------------------------------------------------------------------------------

    public function testItIsOffUntilTheOwnerTurnsItOn(): void
    {
        $server = $this->makeServer();

        $this->assertSame(AutoSleepService::DISABLED, $this->service()->check($server));
        $this->assertFalse($this->service()->settings($server)->enabled);
        $this->assertFalse($this->service()->isSleeping($server));
        $this->power->shouldNotReceive('send');
    }

    public function testAServerThatTurnedItOffIsNotLookedAt(): void
    {
        $server = $this->sleepy(['enabled' => false]);
        $this->daemon->shouldNotReceive('getDetails');

        $this->assertSame(AutoSleepService::DISABLED, $this->service()->check($server));
    }

    public function testSomebodyBeingOnlineMeansNoSleep(): void
    {
        $server = $this->sleepy(['idle_since' => CarbonImmutable::now()->subHour()]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(2);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::BUSY, $this->service()->check($server));
        $this->assertNull($this->row($server)->idle_since);
    }

    public function testTheClockStartsWhenNobodyIsOnAndTheServerIsNotStoppedYet(): void
    {
        $server = $this->sleepy();
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(0);
        $this->power->shouldNotReceive('send');
        $now = CarbonImmutable::now();

        $this->assertSame(AutoSleepService::IDLE, $this->service()->check($server, $now));
        $this->assertSame($now->timestamp, $this->row($server)->idle_since->timestamp);
    }

    public function testItIsNotStoppedBeforeTheTimeIsUp(): void
    {
        $now = CarbonImmutable::now();
        $server = $this->sleepy(['idle_since' => $now->subMinutes(14)]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(0);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::IDLE, $this->service()->check($server, $now));
        $this->assertNull($this->row($server)->slept_at);
    }

    public function testItIsStoppedWhenNobodyWasOnForAsLongAsChosen(): void
    {
        $now = CarbonImmutable::now();
        $server = $this->sleepy(['idle_since' => $now->subMinutes(15)]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(0);
        $this->power->shouldReceive('send')->once()->with('stop');

        $this->assertSame(AutoSleepService::SLEPT, $this->service()->check($server, $now));
        $row = $this->row($server);
        $this->assertNull($row->idle_since);
        $this->assertSame($now->timestamp, $row->slept_at->timestamp);
        $this->assertTrue($this->service()->isSleeping($server));
    }

    public function testTheTimeThatWasChosenCounts(): void
    {
        $now = CarbonImmutable::now();
        $server = $this->sleepy(['idle_minutes' => 60, 'idle_since' => $now->subMinutes(30)]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(0);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::IDLE, $this->service()->check($server, $now));
    }

    public function testAServerThatIsNotRunningIsNotAskedAboutPlayersAndForgetsTheClock(): void
    {
        $server = $this->sleepy(['idle_since' => CarbonImmutable::now()->subHour()]);
        $this->state('offline');
        $this->ping->shouldNotReceive('players');
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::SKIPPED, $this->service()->check($server));
        $this->assertNull($this->row($server)->idle_since);
    }

    public function testAServerThatDoesNotAnswerIsNeverStopped(): void
    {
        $server = $this->sleepy(['idle_since' => CarbonImmutable::now()->subHour()]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(null);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::UNKNOWN, $this->service()->check($server));
        $this->assertNull($this->row($server)->idle_since);
    }

    public function testADaemonThatDoesNotAnswerChangesNothing(): void
    {
        $server = $this->sleepy(['idle_since' => CarbonImmutable::now()->subHour()]);
        $this->daemon->shouldReceive('getDetails')->andThrow(new \RuntimeException('down'));
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::UNKNOWN, $this->service()->check($server));
        $this->assertNotNull($this->row($server)->idle_since);
    }

    public function testSuspendedAndInstallingServersAreLeftAlone(): void
    {
        $this->daemon->shouldNotReceive('getDetails');
        $this->power->shouldNotReceive('send');

        $suspended = $this->sleepy([], ['status' => Server::STATUS_SUSPENDED]);
        $this->assertSame(AutoSleepService::SKIPPED, $this->service()->check($suspended));

        $installing = $this->sleepy([], ['status' => Server::STATUS_INSTALLING]);
        $this->assertSame(AutoSleepService::SKIPPED, $this->service()->check($installing));
    }

    public function testAServerThatIsStillStoppingIsNotTakenForOneThatWasStarted(): void
    {
        $now = CarbonImmutable::now();
        $server = $this->sleepy(['slept_at' => $now->subMinute()]);
        // Saving a big world takes a while, the daemon still says it runs.
        $this->state('running');
        $this->ping->shouldNotReceive('players');

        $this->assertSame(AutoSleepService::SKIPPED, $this->service()->check($server, $now));
        $this->assertNotNull($this->row($server)->slept_at);
    }

    public function testSleepingLooksLikeStoppingAndOffButNotLikeStartingOrRunning(): void
    {
        $now = CarbonImmutable::now()->subMinutes(10);
        $this->ping->shouldReceive('players')->andReturn(0);
        $this->power->shouldNotReceive('send');

        foreach (['stopping' => true, 'offline' => true, 'starting' => false] as $state => $stillSleeping) {
            $server = $this->sleepy(['slept_at' => $now]);
            $daemon = Mockery::mock(DaemonServerRepository::class);
            $daemon->shouldReceive('setServer')->andReturnSelf();
            $daemon->shouldReceive('getDetails')->andReturn(['state' => $state]);
            $this->app->instance(DaemonServerRepository::class, $daemon);

            $this->service()->check($server);

            $this->assertSame($stillSleeping, !is_null($this->row($server)->slept_at), $state);
        }
    }

    public function testAServerThatWasStartedBySomebodyIsNotAsleepAnyMore(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(10)]);
        $this->state('running');
        $this->ping->shouldReceive('players')->andReturn(1);

        $this->service()->check($server);

        $this->assertNull($this->row($server)->slept_at);
        $this->assertFalse($this->service()->isSleeping($server));
    }

    // ---- waking it up ---------------------------------------------------------------------------------------------------

    public function testAServerThatSleepsIsStartedWhenAPlayerTriesToJoin(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(30)]);
        $this->state('offline');
        $this->power->shouldReceive('send')->once()->with('start');

        $this->assertSame(AutoSleepService::WOKEN, $this->service()->wake($server));
        $this->assertNull($this->row($server)->slept_at);
    }

    public function testManyPlayersTryingStartItOnce(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(30)]);
        $this->state('offline');
        $this->power->shouldReceive('send')->once()->with('start');
        // The first one starts it and the sleep is over, the rest find a server that is not sleeping.
        $this->assertSame(AutoSleepService::WOKEN, $this->service()->wake($server));
        $this->assertSame(AutoSleepService::NOT_SLEEPING, $this->service()->wake($server));
    }

    public function testTheCooldownStopsASecondStartWhileTheSleepIsStillOn(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(30)]);
        Cache::put("autosleep:wake:{$server->id}", 1, 30);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::COOLDOWN, $this->service()->wake($server));
    }

    public function testAServerItsOwnerStoppedIsNotStartedByAPlayer(): void
    {
        // Auto sleep is on but it did not stop this server.
        $server = $this->sleepy(['slept_at' => null]);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::NOT_SLEEPING, $this->service()->wake($server));
    }

    public function testWakingCanBeTurnedOffAndStaysOffWhenAutoSleepIsOff(): void
    {
        $this->power->shouldNotReceive('send');

        $noWake = $this->sleepy(['slept_at' => CarbonImmutable::now(), 'wake_on_join' => false]);
        $this->assertSame(AutoSleepService::NOT_SLEEPING, $this->service()->wake($noWake));

        $off = $this->sleepy(['slept_at' => CarbonImmutable::now(), 'enabled' => false]);
        $this->assertSame(AutoSleepService::NOT_SLEEPING, $this->service()->wake($off));
        $this->assertSame(AutoSleepService::NOT_SLEEPING, $this->service()->wake($this->makeServer()));
    }

    public function testASuspendedServerIsNotStarted(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()], ['status' => Server::STATUS_SUSPENDED]);
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::BLOCKED, $this->service()->wake($server));
    }

    public function testAServerThatIsAwakeAlreadyIsNotStartedAgain(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(5)]);
        $this->state('starting');
        $this->power->shouldNotReceive('send');

        $this->assertSame(AutoSleepService::AWAKE, $this->service()->wake($server));
        $this->assertNull($this->row($server)->slept_at);
    }

    public function testADaemonThatFailsLeavesTheServerSleepingAndLetsTheNextPlayerTry(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(5)]);
        $this->state('offline');
        $this->power->shouldReceive('send')->once()->andThrow(new \RuntimeException('down'));

        $this->assertSame(AutoSleepService::BLOCKED, $this->service()->wake($server));
        $this->assertNotNull($this->row($server)->slept_at);
        $this->assertFalse(Cache::has("autosleep:wake:{$server->id}"));
    }

    // ---- turning it on and off ------------------------------------------------------------------------------------------

    public function testTurningItOffForgetsTheSleep(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now(), 'idle_since' => CarbonImmutable::now()]);

        $settings = $this->service()->update($server, false, 15, true);

        $this->assertFalse($settings->enabled);
        $this->assertNull($settings->slept_at);
        $this->assertNull($settings->idle_since);
    }

    // ---- the API of the panel -------------------------------------------------------------------------------------------

    public function testTheSettingsAreOffByDefault(): void
    {
        [$user, $server] = $this->account();

        $response = $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/settings/auto-sleep");

        $response->assertOk();
        $response->assertJsonPath('enabled', false);
        $response->assertJsonPath('idle_minutes', 15);
        $response->assertJsonPath('wake_on_join', true);
        $response->assertJsonPath('sleeping', false);
        $response->assertJsonPath('wake_available', false);
        $response->assertJsonPath('choices', ServerAutoSleep::IDLE_CHOICES);
        $this->assertDatabaseMissing('server_auto_sleep', ['server_id' => $server->id]);
    }

    public function testTheOwnerCanTurnItOnAndChooseHowLong(): void
    {
        [$user, $server] = $this->account();

        $response = $this->actingAs($user)->putJson("/api/client/servers/{$server->uuid}/settings/auto-sleep", [
            'enabled' => true,
            'idle_minutes' => 30,
            'wake_on_join' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('enabled', true);
        $response->assertJsonPath('idle_minutes', 30);
        $response->assertJsonPath('wake_on_join', false);
        $this->assertDatabaseHas('server_auto_sleep', ['server_id' => $server->id, 'enabled' => true, 'idle_minutes' => 30, 'wake_on_join' => false]);
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function badSettings(): array
    {
        return [
            'a time that is not offered' => [['enabled' => true, 'idle_minutes' => 7, 'wake_on_join' => true]],
            'no time' => [['enabled' => true, 'wake_on_join' => true]],
            'no choice about it' => [['idle_minutes' => 15, 'wake_on_join' => true]],
            'text for a number' => [['enabled' => true, 'idle_minutes' => 'soon', 'wake_on_join' => true]],
        ];
    }

    /** @dataProvider badSettings */
    public function testSettingsThatAreNotOfferedAreRefused(array $settings): void
    {
        [$user, $server] = $this->account();

        $this->actingAs($user)->putJson("/api/client/servers/{$server->uuid}/settings/auto-sleep", $settings)->assertUnprocessable();
        $this->assertDatabaseMissing('server_auto_sleep', ['server_id' => $server->id]);
    }

    public function testASubuserNeedsThePermissionToChangeItButCanSeeIt(): void
    {
        [$user, $server] = $this->account([Permission::ACTION_CONTROL_CONSOLE]);
        $settings = ['enabled' => true, 'idle_minutes' => 15, 'wake_on_join' => true];

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/settings/auto-sleep")->assertOk();
        $this->actingAs($user)->putJson("/api/client/servers/{$server->uuid}/settings/auto-sleep", $settings)->assertForbidden();

        [$allowed, $other] = $this->account([Permission::ACTION_SETTINGS_AUTO_SLEEP]);
        $this->actingAs($allowed)->putJson("/api/client/servers/{$other->uuid}/settings/auto-sleep", $settings)->assertOk();
    }

    public function testSomebodyElseCannotReachTheServer(): void
    {
        [, $server] = $this->account();
        $stranger = \Pterodactyl\Models\User::factory()->create();

        $this->actingAs($stranger)->getJson("/api/client/servers/{$server->uuid}/settings/auto-sleep")->assertNotFound();
        $this->actingAs($stranger)->putJson("/api/client/servers/{$server->uuid}/settings/auto-sleep", ['enabled' => true, 'idle_minutes' => 15, 'wake_on_join' => true])
            ->assertNotFound();
    }

    public function testWakingIsOnlyPossibleWithADomainAndTheRouter(): void
    {
        [$user, $server] = $this->account();
        $url = "/api/client/servers/{$server->uuid}/settings/auto-sleep";

        config(['pterodactyl.domains.router_token' => 'secret']);
        $this->actingAs($user)->getJson($url)->assertJsonPath('wake_available', false);

        ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => 'play.example.com']);
        $this->actingAs($user)->getJson($url)->assertJsonPath('wake_available', true);

        config(['pterodactyl.domains.router_token' => '']);
        $this->actingAs($user)->getJson($url)->assertJsonPath('wake_available', false);
    }

    public function testTheServerShowsWhetherItIsAsleep(): void
    {
        [$user, $server] = $this->account();
        $url = "/api/client/servers/{$server->uuid}";

        $this->actingAs($user)->getJson($url)->assertJsonPath('attributes.auto_sleep', ['enabled' => false, 'sleeping' => false]);

        ServerAutoSleep::query()->create(['server_id' => $server->id, 'enabled' => true, 'slept_at' => CarbonImmutable::now()]);
        $this->actingAs($user)->getJson($url)->assertJsonPath('attributes.auto_sleep', ['enabled' => true, 'sleeping' => true]);
    }

    // ---- the router -----------------------------------------------------------------------------------------------------

    private function router(string $method, string $uri, array $data = [])
    {
        config(['pterodactyl.domains.router_token' => 'router-secret']);

        return $this->withHeader('Authorization', 'Bearer router-secret')->json($method, $uri, $data);
    }

    private function domain(Server $server, string $domain = 'play.example.com'): void
    {
        ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => $domain]);
    }

    public function testOnlyTheRouterMayAskToWakeAServer(): void
    {
        config(['pterodactyl.domains.router_token' => 'router-secret']);
        $this->power->shouldNotReceive('send');

        $this->postJson('/api/router/wake', ['domain' => 'play.example.com'])->assertUnauthorized();
        $this->withHeader('Authorization', 'Bearer wrong')->postJson('/api/router/wake', ['domain' => 'play.example.com'])->assertUnauthorized();
    }

    public function testTheRouterWakesTheServerBehindADomain(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(20)]);
        $this->domain($server);
        $this->state('offline');
        $this->power->shouldReceive('send')->once()->with('start');

        $this->router('POST', '/api/router/wake', ['domain' => 'Play.Example.com'])->assertOk()->assertJsonPath('result', 'woken');
    }

    public function testAnUnknownDomainWakesNothing(): void
    {
        $this->power->shouldNotReceive('send');

        $this->router('POST', '/api/router/wake', ['domain' => 'nobody.example.com'])->assertOk()->assertJsonPath('result', 'not-sleeping');
        $this->router('POST', '/api/router/wake', [])->assertOk()->assertJsonPath('result', 'not-sleeping');
    }

    public function testTheRouterIsToldWhetherTheServerIsAsleepOrJustOff(): void
    {
        $asleep = $this->sleepy(['slept_at' => CarbonImmutable::now()->subMinutes(20)]);
        $this->domain($asleep, 'asleep.example.com');
        $off = $this->sleepy(['slept_at' => null]);
        $this->domain($off, 'off.example.com');
        $plain = $this->makeServer();
        $this->domain($plain, 'plain.example.com');
        $this->state('offline');

        $this->router('GET', '/api/router/state?domain=asleep.example.com')->assertJson(['state' => 'offline', 'sleeping' => true]);
        $this->router('GET', '/api/router/state?domain=off.example.com')->assertJson(['state' => 'offline', 'sleeping' => false]);
        $this->router('GET', '/api/router/state?domain=plain.example.com')->assertJson(['state' => 'offline', 'sleeping' => false]);
    }

    public function testAServerThatIsRunningIsNotAsleepWhateverTheRecordSays(): void
    {
        $server = $this->sleepy(['slept_at' => CarbonImmutable::now()]);
        $this->domain($server);
        $this->state('running');

        $this->router('GET', '/api/router/state?domain=play.example.com')->assertJson(['state' => 'running', 'sleeping' => false]);
    }

    // ---- the command that looks at the servers --------------------------------------------------------------------------

    public function testTheCommandLooksAtTheServersThatHaveItOnAndNoOthers(): void
    {
        $now = CarbonImmutable::now();
        $idle = $this->sleepy(['idle_since' => $now->subMinutes(20)]);
        $this->sleepy(['enabled' => false, 'idle_since' => $now->subMinutes(20)]);
        $this->makeServer();
        $this->state('running');
        $this->ping->shouldReceive('players')->once()->andReturn(0);
        $this->power->shouldReceive('send')->once()->with('stop');

        $this->artisan('p:server:auto-sleep')->assertExitCode(0);

        $this->assertNotNull($this->row($idle)->slept_at);
    }

    public function testOneServerThatFailsDoesNotStopTheRest(): void
    {
        $first = $this->sleepy(['idle_since' => CarbonImmutable::now()->subMinutes(20)]);
        $second = $this->sleepy(['idle_since' => CarbonImmutable::now()->subMinutes(20)]);
        $this->daemon->shouldReceive('getDetails')->twice()->andThrow(new DaemonConnectionException(new \GuzzleHttp\Exception\TransferException('down'), false));
        $this->power->shouldNotReceive('send');

        $this->artisan('p:server:auto-sleep')->assertExitCode(0);

        $this->assertNull($this->row($first)->slept_at);
        $this->assertNull($this->row($second)->slept_at);
    }
}
