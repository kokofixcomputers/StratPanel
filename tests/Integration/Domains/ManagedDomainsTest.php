<?php

namespace Pterodactyl\Tests\Integration\Domains;

use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\DnsZone;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Domains\ManagedDomainService;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

class ManagedDomainsTest extends ClientApiIntegrationTestCase
{
    private const ZONE_ID = 'aaaabbbbccccddddeeeeffff00001111';

    /** @var array<int, array{method: string, url: string, body: array}> */
    private array $calls = [];

    /** @var array<string, string> name => record id of what Cloudflare "already has" */
    private array $existing = [];

    private bool $fail = false;

    public function setUp(): void
    {
        parent::setUp();

        // The admin layout prints how long the request took.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        // The test helpers build servers on the BungeeCord egg, which this panel does not ship: borrow the first egg for it.
        if (!Egg::query()->where('author', 'support@pterodactyl.io')->where('name', 'Bungeecord')->exists()) {
            $egg = Egg::query()->firstOrFail()->replicate();
            $egg->forceFill(['uuid' => (string) Str::uuid(), 'author' => 'support@pterodactyl.io', 'name' => 'Bungeecord'])->save();
        }
        config(['pterodactyl.domains.target_ip' => '203.0.113.5', 'pterodactyl.domains.enabled' => true]);
        DnsZone::query()->delete();

        $this->calls = [];
        $this->existing = [];
        $this->fail = false;
        Http::fake(function ($request) {
            $url = $request->url();
            $method = $request->method();
            $this->calls[] = ['method' => $method, 'url' => $url, 'body' => $request->data()];
            $ok = fn ($result) => Http::response(['success' => true, 'errors' => [], 'result' => $result]);

            if ($this->fail && $method !== 'GET') {
                return Http::response(['success' => false, 'errors' => [['message' => 'Authentication error']]], 403);
            }
            if (str_contains($url, '/dns_records/') && $method === 'DELETE') {
                return $ok(['id' => basename($url)]);
            }
            if (str_contains($url, '/dns_records') && $method === 'POST') {
                return $ok(['id' => 'rec' . count($this->calls)]);
            }
            if (str_contains($url, '/dns_records')) {
                parse_str(parse_url($url, PHP_URL_QUERY) ?: '', $q);

                return $ok(isset($q['name'], $this->existing[$q['name']]) ? [['id' => $this->existing[$q['name']]]] : []);
            }
            if (str_contains($url, '/zones?') || str_ends_with($url, '/zones')) {
                parse_str(parse_url($url, PHP_URL_QUERY) ?: '', $q);

                return ($q['name'] ?? '') === 'example.com' ? $ok([['id' => self::ZONE_ID, 'name' => 'example.com']]) : $ok([]);
            }

            return Http::response([], 404);
        });
    }

    private function zone(array $extra = []): DnsZone
    {
        return DnsZone::query()->create(array_merge([
            'name' => 'Main',
            'type' => 'cloudflare',
            'domain' => 'example.com',
            'credentials' => ['api_token' => 'secret-token', 'zone_id' => self::ZONE_ID],
            'enabled' => true,
            'ttl' => 120,
        ], $extra));
    }

    private function calls(string $method, string $contains): array
    {
        return array_values(array_filter($this->calls, fn ($c) => $c['method'] === $method && str_contains($c['url'], $contains)));
    }

    public function testANameUnderADomainOfTheAdminMakesTheRecord(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();

        $response = $this->actingAs($user)->postJson("/api/client/servers/{$server->uuid}/domains", [
            'zone_id' => $zone->id,
            'label' => 'Play',
            'allocation_id' => $server->allocation_id,
        ])->assertStatus(201)
            ->assertJsonPath('attributes.domain', 'play.example.com')
            ->assertJsonPath('attributes.managed', 'example.com');

        $create = $this->calls('POST', '/dns_records')[0];
        $this->assertSame('A', $create['body']['type']);
        $this->assertSame('play.example.com', $create['body']['name']);
        $this->assertSame('203.0.113.5', $create['body']['content']);
        $this->assertFalse($create['body']['proxied']);

        $domain = ServerDomain::query()->where('domain', 'play.example.com')->firstOrFail();
        $this->assertSame($zone->id, $domain->dns_zone_id);
        $this->assertNotEmpty($domain->dns_record_id);
        // Sent with the token, which is never in an answer.
        $this->assertStringNotContainsString('secret-token', $response->getContent());
    }

    public function testTheNameComesBackAsAvailableOrNot(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->existing['taken.example.com'] = 'abc';
        $this->actingAs($user);

        $check = fn (string $label) => $this->getJson("/api/client/servers/{$server->uuid}/domains/check?zone_id={$zone->id}&label=$label");
        $check('free')->assertOk()->assertJsonPath('attributes.available', true)->assertJsonPath('attributes.domain', 'free.example.com');
        // A record somebody made by hand is not taken over.
        $check('taken')->assertJsonPath('attributes.available', false)->assertJsonPath('attributes.reason', 'That name is already taken.');
        $check('mail')->assertJsonPath('attributes.available', false)->assertJsonPath('attributes.reason', 'That name is kept for the panel.');
        $check('bad_name')->assertJsonPath('attributes.available', false);
        $check('-x')->assertJsonPath('attributes.available', false);
        $check(str_repeat('a', 64))->assertJsonPath('attributes.available', false);
    }

    public function testATakenOrReservedNameIsRefusedAndNothingIsMade(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->existing['taken.example.com'] = 'abc';
        $this->actingAs($user);

        foreach (['taken', 'www', 'a.b', 'UPPER_case', ''] as $label) {
            $this->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => $label, 'allocation_id' => $server->allocation_id])
                ->assertStatus(in_array($label, ['taken', 'www'], true) ? 400 : 422);
        }
        $this->assertSame(0, ServerDomain::query()->count());
        $this->assertSame([], $this->calls('POST', '/dns_records'));
    }

    public function testAnotherServersNameCannotBeTaken(): void
    {
        [$user, $server] = $this->generateTestAccount();
        [$other, $otherServer] = $this->generateTestAccount();
        $zone = $this->zone();

        $body = ['zone_id' => $zone->id, 'label' => 'shared', 'allocation_id' => $server->allocation_id];
        $this->actingAs($user)->postJson("/api/client/servers/{$server->uuid}/domains", $body)->assertStatus(201);
        $this->actingAs($other)->postJson("/api/client/servers/{$otherServer->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'shared', 'allocation_id' => $otherServer->allocation_id])->assertStatus(400);
    }

    public function testAProviderThatSaysNoLeavesNoName(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->fail = true;

        $this->actingAs($user)->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])
            ->assertStatus(400);
        $this->assertSame(0, ServerDomain::query()->count());
    }

    public function testASwitchedOffDomainIsNotOffered(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone(['enabled' => false]);
        $this->actingAs($user);

        $this->getJson("/api/client/servers/{$server->uuid}/domains")->assertOk()->assertJsonPath('meta.zones', []);
        $this->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])->assertStatus(422);
    }

    public function testBothWaysAreIndependent(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->actingAs($user);

        $list = $this->getJson("/api/client/servers/{$server->uuid}/domains")->assertOk();
        $list->assertJsonPath('meta.enabled', true)->assertJsonPath('meta.zones.0.domain', 'example.com');
        $this->assertArrayNotHasKey('credentials', $list->json('meta.zones.0'));

        // Their own domain switched off: the names under the admin's domain still work.
        config(['pterodactyl.domains.enabled' => false]);
        $this->postJson("/api/client/servers/{$server->uuid}/domains", ['domain' => 'play.theirs.net', 'allocation_id' => $server->allocation_id])->assertStatus(400);
        $this->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])->assertStatus(201);

        // And the other way round, an own domain is made without asking the provider.
        config(['pterodactyl.domains.enabled' => true]);
        $before = count($this->calls);
        $this->postJson("/api/client/servers/{$server->uuid}/domains", ['domain' => 'play.theirs.net', 'allocation_id' => $server->allocation_id])->assertStatus(201)->assertJsonPath('attributes.managed', null);
        $this->assertCount($before, $this->calls);
    }

    public function testRemovingANameRemovesItsRecordButNotAnOwnDomain(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->actingAs($user);

        $id = $this->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])->json('attributes.id');
        $recordId = ServerDomain::query()->findOrFail($id)->dns_record_id;
        $own = $this->postJson("/api/client/servers/{$server->uuid}/domains", ['domain' => 'play.theirs.net', 'allocation_id' => $server->allocation_id])->json('attributes.id');

        $this->deleteJson("/api/client/servers/{$server->uuid}/domains/$own")->assertNoContent();
        $this->assertSame([], $this->calls('DELETE', '/dns_records/'));

        $this->deleteJson("/api/client/servers/{$server->uuid}/domains/$id")->assertNoContent();
        $deletes = $this->calls('DELETE', '/dns_records/');
        $this->assertCount(1, $deletes);
        $this->assertStringEndsWith($recordId, $deletes[0]['url']);
        $this->assertSame(0, ServerDomain::query()->count());
    }

    public function testRemovingStillWorksWhenTheProviderIsDown(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->actingAs($user);
        $id = $this->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $zone->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])->json('attributes.id');

        $this->fail = true;
        $this->deleteJson("/api/client/servers/{$server->uuid}/domains/$id")->assertNoContent();
        $this->assertSame(0, ServerDomain::query()->count());
    }

    public function testDeletingADomainOfTheAdminRemovesTheNamesUnderIt(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $this->app->make(ManagedDomainService::class)->create($server, $server->allocation, $zone, 'play');

        $root = User::factory()->create(['root_admin' => true]);
        $this->actingAs($root)->delete("/admin/settings/domains/zones/{$zone->id}")->assertRedirect('/admin/settings/domains');

        $this->assertSame(0, ServerDomain::query()->count());
        $this->assertCount(1, $this->calls('DELETE', '/dns_records/'));
        $this->assertSame(0, DnsZone::query()->count());
    }

    public function testDeletingAServerRemovesItsNamesAtTheProvider(): void
    {
        [, $server] = $this->generateTestAccount();
        $zone = $this->zone();
        $service = $this->app->make(ManagedDomainService::class);
        $service->create($server, $server->allocation, $zone, 'play');
        ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => 'own.theirs.net', 'web' => true]);

        $daemon = \Mockery::mock(\Pterodactyl\Repositories\Wings\DaemonServerRepository::class);
        $daemon->shouldReceive('setServer')->andReturnSelf();
        $daemon->shouldReceive('delete')->once();
        $this->app->instance(\Pterodactyl\Repositories\Wings\DaemonServerRepository::class, $daemon);

        $this->app->make(\Pterodactyl\Services\Servers\ServerDeletionService::class)->handle($server);

        // Only the name the panel made has a record to take away.
        $this->assertCount(1, $this->calls('DELETE', '/dns_records/'));
        $this->assertSame(0, ServerDomain::query()->count());
    }

    public function testAnAdminAddsADomainAndTheAccessIsChecked(): void
    {
        $root = User::factory()->create(['root_admin' => true]);
        $this->actingAs($root);

        $this->get('/admin/settings/domains')->assertOk()->assertSee('Names under your domains');
        $this->get('/admin/settings/domains/new?type=cloudflare')->assertOk()->assertSee('API token');

        $this->post('/admin/settings/domains/zones', [
            'type' => 'cloudflare', 'name' => 'Main', 'domain' => 'Example.com.', 'ttl' => 120, 'enabled' => '1',
            'credentials' => ['api_token' => 'secret-token', 'zone_id' => ''],
        ])->assertRedirect();

        $zone = DnsZone::query()->where('domain', 'example.com')->firstOrFail();
        // The zone was found by the name, and the key is kept encrypted.
        $this->assertSame(self::ZONE_ID, $zone->credentials['zone_id']);
        $this->assertTrue($zone->enabled);
        $this->assertStringNotContainsString('secret-token', (string) \DB::table('dns_zones')->value('credentials'));
        $this->get("/admin/settings/domains/zones/{$zone->id}")->assertOk()->assertDontSee('secret-token');
    }

    public function testADomainTheTokenCannotSeeIsSwitchedOff(): void
    {
        $root = User::factory()->create(['root_admin' => true]);
        $this->actingAs($root)->post('/admin/settings/domains/zones', [
            'type' => 'cloudflare', 'name' => 'Other', 'domain' => 'unknown.org', 'ttl' => 120, 'enabled' => '1',
            'credentials' => ['api_token' => 'secret-token'],
        ])->assertRedirect();

        $this->assertFalse(DnsZone::query()->where('domain', 'unknown.org')->firstOrFail()->enabled);
    }

    public function testSeveralDomainsEachWithTheirOwnKey(): void
    {
        [$user, $server] = $this->generateTestAccount();
        $one = $this->zone();
        $two = $this->zone(['domain' => 'example.org', 'credentials' => ['api_token' => 'other-token', 'zone_id' => self::ZONE_ID]]);

        $this->actingAs($user)->postJson("/api/client/servers/{$server->uuid}/domains", ['zone_id' => $two->id, 'label' => 'play', 'allocation_id' => $server->allocation_id])
            ->assertStatus(201)->assertJsonPath('attributes.domain', 'play.example.org');

        $post = $this->calls('POST', '/dns_records')[0];
        $this->assertSame('play.example.org', $post['body']['name']);
        $this->assertSame($two->id, ServerDomain::query()->where('domain', 'play.example.org')->value('dns_zone_id'));
        $this->assertNotSame($one->id, $two->id);
    }

    public function testOnlyThoseWhoMayChangeDomainsCanChangeThem(): void
    {
        $user = User::factory()->create(['root_admin' => false]);
        $user->roles()->attach(Role::query()->create(['name' => 'dom-' . bin2hex(random_bytes(3)), 'permissions' => ['settings.domains.view'], 'color' => '#000000'])->id);
        $this->actingAs($user->fresh());

        $this->get('/admin/settings/domains')->assertOk();
        $this->post('/admin/settings/domains/zones', ['type' => 'cloudflare', 'name' => 'x', 'domain' => 'x.com', 'ttl' => 120, 'credentials' => ['api_token' => 't']])->assertForbidden();
        $this->patch('/admin/settings/domains', ['custom_enabled' => '0'])->assertForbidden();
        \DB::table('roles')->where('name', 'like', 'dom-%')->delete();
    }

    public function testTheServiceNormalizesAndKnowsReservedNames(): void
    {
        $service = $this->app->make(ManagedDomainService::class);
        $zone = $this->zone();

        $this->assertSame('play', $service->normalize('  PLAY '));
        $this->assertNull($service->problem($zone, 'play-2'));
        $this->assertNotNull($service->problem($zone, 'admin'));
        $this->assertNotNull($service->problem($zone, 'a.b'));
        $this->assertNotNull($service->problem($zone, 'x-'));
    }
}
