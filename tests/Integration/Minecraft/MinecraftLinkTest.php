<?php

namespace Pterodactyl\Tests\Integration\Minecraft;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\User;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\MinecraftLinkCode;
use Pterodactyl\Services\Minecraft\MinecraftLinkService;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

/** Linking a Minecraft account: the router asks for a code, the person types it in, the account gets the head and can be invited by name. */
class MinecraftLinkTest extends ClientApiIntegrationTestCase
{
    private Egg $egg;

    private const UUID = '069a79f444e94726a5befca90e38aaf5';

    public function setUp(): void
    {
        parent::setUp();

        config(['pterodactyl.domains.router_token' => 'router-secret']);
        // A server needs an egg, and the seeded ones are not there in the test database.
        $this->egg = Egg::factory()->create([
            'nest_id' => Nest::factory()->create()->id, 'name' => 'Java', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java_21'],
            'config_stop' => '^C', 'config_startup' => '{}', 'config_logs' => '{}', 'config_files' => '{}',
        ]);
        MinecraftLinkCode::query()->delete();
        User::query()->update(['minecraft_uuid' => null, 'minecraft_username' => null]);
        DB::table('settings')->where('key', 'like', 'settings::minecraft_link:%')->delete();
        $this->service()->setEnabled(false);
    }

    /** @return array{User, \Pterodactyl\Models\Server} a person who may invite subusers to a server */
    private function account(): array
    {
        $user = User::factory()->create();
        $server = $this->createServerModel(['egg_id' => $this->egg->id]);
        Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_USER_CREATE]]);

        return [$user, $server];
    }

    private function service(): MinecraftLinkService
    {
        return $this->app->make(MinecraftLinkService::class);
    }

    private function router(string $uuid = self::UUID, string $name = 'Notch')
    {
        return $this->postJson('/api/router/link', ['uuid' => $uuid, 'username' => $name], ['Authorization' => 'Bearer router-secret']);
    }

    public function testItIsOffUntilAnAdminTurnsItOn()
    {
        $this->router()->assertOk()->assertJsonPath('status', 'disabled');
        $this->assertSame(0, MinecraftLinkCode::query()->count());

        $this->getJson('/api/router/domains', ['Authorization' => 'Bearer router-secret'])->assertOk()->assertJsonPath('link.enabled', false);
        $this->service()->setEnabled(true);
        $this->getJson('/api/router/domains', ['Authorization' => 'Bearer router-secret'])->assertOk()->assertJsonPath('link.enabled', true);
    }

    public function testOnlyTheRouterCanAskForACode()
    {
        $this->service()->setEnabled(true);

        $this->postJson('/api/router/link', ['uuid' => self::UUID, 'username' => 'Notch'])->assertStatus(401);
        $this->postJson('/api/router/link', ['uuid' => self::UUID, 'username' => 'Notch'], ['Authorization' => 'Bearer nope'])->assertStatus(401);
        $this->router('not-a-uuid')->assertStatus(422);
        $this->router(self::UUID, 'a name with spaces')->assertStatus(422);
    }

    public function testAPlayerGetsACodeThatStaysTheSameUntilItRunsOut()
    {
        $this->service()->setEnabled(true);

        $first = $this->router()->assertOk()->assertJsonPath('status', 'code')->assertJsonPath('minutes', 15);
        $this->assertMatchesRegularExpression('/^\d{6}$/', $first->json('code'));
        $this->assertSame($first->json('code'), $this->router()->json('code'));
        $this->assertSame(1, MinecraftLinkCode::query()->count());

        MinecraftLinkCode::query()->update(['expires_at' => now()->subMinute()]);
        $this->router()->assertOk()->assertJsonPath('status', 'code');
        $this->assertSame(1, MinecraftLinkCode::query()->count());
        $this->assertTrue(MinecraftLinkCode::query()->first()->expires_at->isFuture());
    }

    public function testTypingTheCodeLinksTheAccountAndGivesTheHeadAsAvatar()
    {
        $this->service()->setEnabled(true);
        $user = User::factory()->create();
        $code = $this->router()->json('code');

        $this->actingAs($user)->getJson('/api/client/account/minecraft')->assertOk()->assertJsonPath('linked', false);
        $this->actingAs($user)->postJson('/api/client/account/minecraft', ['code' => substr($code, 0, 3) . ' ' . substr($code, 3)])
            ->assertOk()->assertJsonPath('linked', true)->assertJsonPath('username', 'Notch')->assertJsonPath('uuid', self::UUID)
            ->assertJsonPath('avatar', 'https://mc-heads.net/avatar/' . self::UUID . '/128');

        $this->assertSame(self::UUID, $user->refresh()->minecraft_uuid);
        // The code was used up, and the router now says who the account is linked to.
        $this->assertSame(0, MinecraftLinkCode::query()->count());
        $this->router()->assertJsonPath('status', 'linked')->assertJsonPath('account', $user->username);
        $this->assertActivityLogged('user:account.minecraft-linked');
    }

    public function testAWrongOrExpiredCodeDoesNothing()
    {
        $this->service()->setEnabled(true);
        $user = User::factory()->create();
        $code = $this->router()->json('code');

        $this->actingAs($user)->postJson('/api/client/account/minecraft', ['code' => $code === '123456' ? '654321' : '123456'])->assertStatus(400);
        MinecraftLinkCode::query()->update(['expires_at' => now()->subSecond()]);
        $this->actingAs($user)->postJson('/api/client/account/minecraft', ['code' => $code])->assertStatus(400);
        $this->assertNull($user->refresh()->minecraft_uuid);
    }

    public function testAMinecraftAccountLinksToOnePanelAccountOnly()
    {
        $this->service()->setEnabled(true);
        [$first, $second] = [User::factory()->create(), User::factory()->create()];
        $this->actingAs($first)->postJson('/api/client/account/minecraft', ['code' => $this->router()->json('code')])->assertOk();

        // The second person cannot link what is linked, whatever code they have: there is none for it while it is linked.
        $this->router()->assertJsonPath('status', 'linked');
        MinecraftLinkCode::query()->create(['code' => '111111', 'minecraft_uuid' => self::UUID, 'minecraft_username' => 'Notch', 'expires_at' => now()->addMinutes(5)]);
        $this->actingAs($second)->postJson('/api/client/account/minecraft', ['code' => '111111'])->assertStatus(400);
        $this->assertNull($second->refresh()->minecraft_uuid);
    }

    public function testLinkingNeedsItToBeOn()
    {
        $user = User::factory()->create();
        MinecraftLinkCode::query()->create(['code' => '222222', 'minecraft_uuid' => self::UUID, 'minecraft_username' => 'Notch', 'expires_at' => now()->addMinutes(5)]);

        $this->actingAs($user)->postJson('/api/client/account/minecraft', ['code' => '222222'])->assertStatus(400);
    }

    public function testItCanBeUnlinkedAndARenamedAccountIsNoticed()
    {
        $this->service()->setEnabled(true);
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/client/account/minecraft', ['code' => $this->router()->json('code')])->assertOk();

        $this->router(self::UUID, 'Notch2')->assertJsonPath('status', 'linked');
        $this->assertSame('Notch2', $user->refresh()->minecraft_username);

        $this->actingAs($user)->deleteJson('/api/client/account/minecraft')->assertOk()->assertJsonPath('linked', false);
        $this->assertNull($user->refresh()->minecraft_uuid);
    }

    public function testASubuserCanBeInvitedByMinecraftName()
    {
        $this->service()->setEnabled(true);
        [$owner, $server] = $this->account();
        $friend = User::factory()->create();
        $this->actingAs($friend)->postJson('/api/client/account/minecraft', ['code' => $this->router()->json('code')])->assertOk();

        $this->actingAs($owner)->getJson('/api/client/minecraft/lookup?username=Notch')->assertOk()->assertJsonPath('found', true)->assertJsonPath('username', 'Notch')
            ->assertJsonPath('avatar', 'https://mc-heads.net/avatar/' . self::UUID . '/128');
        $this->actingAs($owner)->getJson('/api/client/minecraft/lookup?username=Nobody')->assertOk()->assertJsonPath('found', false);

        $response = $this->actingAs($owner)->postJson($this->link($server) . '/users', ['minecraft' => 'Notch', 'permissions' => [Permission::ACTION_USER_CREATE]]);
        $response->assertOk()->assertJsonPath('attributes.uuid', $friend->uuid)->assertJsonPath('attributes.minecraft.username', 'Notch')
            ->assertJsonPath('attributes.image', 'https://mc-heads.net/avatar/' . self::UUID . '/128');
    }

    public function testInvitingAnUnlinkedMinecraftNameIsRefused()
    {
        $this->service()->setEnabled(true);
        [$owner, $server] = $this->account();

        $this->actingAs($owner)->postJson($this->link($server) . '/users', ['minecraft' => 'Nobody', 'permissions' => [Permission::ACTION_USER_CREATE]])
            ->assertStatus(422)->assertJsonPath('errors.0.meta.source_field', 'minecraft');
        $this->actingAs($owner)->postJson($this->link($server) . '/users', ['permissions' => [Permission::ACTION_USER_CREATE]])->assertStatus(422);
    }

    public function testTheUsersListNamesTheOwner()
    {
        [$viewer, $server] = $this->account();
        Subuser::query()->where('user_id', $viewer->id)->update(['permissions' => [Permission::ACTION_USER_READ]]);

        $response = $this->actingAs($viewer)->getJson($this->link($server) . '/users')->assertOk();
        $response->assertJsonPath('owner.attributes.uuid', $server->user->uuid)->assertJsonPath('owner.attributes.email', $server->user->email);
        $this->assertCount(1, $response->json('data'));
    }
}
