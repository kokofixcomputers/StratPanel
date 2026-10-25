<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Models\DnsZone;
use Pterodactyl\Services\Acme\AcmeIssuer;
use Pterodactyl\Services\Acme\DnsTxtChecker;
use Pterodactyl\Services\Acme\DomainCertificateService;

/** A certificate for a domain of the admin (and its wildcard), proven with TXT records the panel adds at the DNS provider. */
class ZoneCertificateTest extends CertificateTestCase
{
    private const ZONE_ID = 'aaaabbbbccccddddeeeeffff00001111';

    private FakeAcmeIssuer $issuer;

    /** @var list<array{method: string, url: string, body: array<string, mixed>}> */
    private array $calls = [];

    public function setUp(): void
    {
        parent::setUp();

        $this->issuer = new FakeAcmeIssuer();
        $this->app->instance(AcmeIssuer::class, $this->issuer);
        $this->app->instance(DnsTxtChecker::class, new FakeTxtChecker());
        config(['acme.enabled' => true, 'acme.dns_wait_seconds' => 2, 'acme.dns_poll_seconds' => 0, 'acme.dns_settle_seconds' => 0]);
        DnsZone::query()->where('domain', 'like', '%.zone-test.example')->delete();
        $this->calls = [];
        Http::fake(function ($request) {
            $this->calls[] = ['method' => $request->method(), 'url' => $request->url(), 'body' => $request->data()];
            $ok = fn ($result) => Http::response(['success' => true, 'errors' => [], 'result' => $result]);

            if ($request->method() === 'DELETE') {
                return $ok(['id' => basename($request->url())]);
            }
            if ($request->method() === 'POST') {
                return $ok(['id' => 'rec' . count($this->calls)]);
            }

            return $ok([]);
        });
    }

    public function tearDown(): void
    {
        DnsZone::query()->where('domain', 'like', '%.zone-test.example')->delete();

        parent::tearDown();
    }

    private function zone(string $domain = 'one.zone-test.example'): DnsZone
    {
        return DnsZone::query()->create(['name' => 'Main', 'type' => 'cloudflare', 'domain' => $domain, 'credentials' => ['api_token' => 't', 'zone_id' => self::ZONE_ID], 'enabled' => true, 'ttl' => 120]);
    }

    private function root()
    {
        return $this->makeUser(['root_admin' => true]);
    }

    public function testTheDomainAndItsWildcardGetOneCertificateAndTheRecordsAreRemoved(): void
    {
        $zone = $this->zone();
        $this->actingAs($this->root());

        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertOk();

        // The queue runs at once in the tests.
        $this->assertSame(['one.zone-test.example + *.one.zone-test.example (dns)'], $this->issuer->asked);
        $certificate = Certificate::query()->firstOrFail();
        $this->assertSame('letsencrypt', $certificate->source);
        $this->assertSame('zone', $certificate->acme_method);
        $this->assertSame('one.zone-test.example', $certificate->acme_domain);
        $this->assertEqualsCanonicalizing(['one.zone-test.example', '*.one.zone-test.example'], $certificate->domains);

        $posts = array_values(array_filter($this->calls, fn ($c) => $c['method'] === 'POST'));
        $this->assertCount(2, $posts);
        $this->assertSame('TXT', $posts[0]['body']['type']);
        $this->assertSame('_acme-challenge.one.zone-test.example', $posts[0]['body']['name']);
        $this->assertCount(2, array_filter($this->calls, fn ($c) => $c['method'] === 'DELETE'), 'what was added is taken away again');

        $this->getJson("/api/client/admin/settings/domains/zones/{$zone->id}")->assertOk()->assertJsonPath('certificate.status', 'issued')->assertJsonPath('certificate.certificate.id', $certificate->id);
    }

    public function testAskingAgainReplacesTheCertificate(): void
    {
        $zone = $this->zone();
        $this->actingAs($this->root());

        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertOk();
        $before = Certificate::query()->firstOrFail()->fingerprint;
        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertOk();

        $this->assertSame(1, Certificate::query()->count());
        $this->assertNotSame($before, Certificate::query()->firstOrFail()->fingerprint);
    }

    public function testAFailureIsKeptWithItsReasonAndTheRecordsAreStillRemoved(): void
    {
        $zone = $this->zone();
        $this->issuer->fail = 'Too many certificates already issued';
        $this->actingAs($this->root());

        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertOk();

        $state = $this->getJson("/api/client/admin/settings/domains/zones/{$zone->id}")->json('certificate');
        $this->assertSame('failed', $state['status']);
        $this->assertStringContainsString('Too many certificates', $state['message']);
        $this->assertSame(0, Certificate::query()->count());
    }

    public function testNothingIsDoneWithLetsEncryptOffOrAnotherRequestRunning(): void
    {
        $zone = $this->zone();
        $this->actingAs($this->root());

        config(['acme.enabled' => false]);
        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertStatus(400);

        config(['acme.enabled' => true]);
        Cache::put('acme:zone:' . $zone->id, ['status' => 'pending', 'message' => null], 60);
        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertStatus(400);
        $this->assertSame([], $this->issuer->asked);
    }

    public function testTheCertificatesOfDomainsRenewByThemselvesAndRenewNowWorksToo(): void
    {
        $zone = $this->zone();
        $this->actingAs($this->root());
        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertOk();
        $certificate = Certificate::query()->firstOrFail();
        $certificate->forceFill(['not_after' => now()->addDays(5)])->save();
        $before = $certificate->fingerprint;
        $this->issuer->asked = [];

        $result = $this->app->make(DomainCertificateService::class)->renewDue();

        $this->assertSame(['renewed' => 1, 'failed' => 0], $result);
        $this->assertSame(['one.zone-test.example + *.one.zone-test.example (dns)'], $this->issuer->asked, 'by the zone, not over http');
        $this->assertNotSame($before, $certificate->fresh()->fingerprint);

        $fingerprint = $certificate->fresh()->fingerprint;
        $this->postJson('/api/client/admin/settings/certificates/' . $certificate->id . '/renew')->assertOk();
        $this->assertNotSame($fingerprint, $certificate->fresh()->fingerprint);
    }

    public function testRolesNeedToChangeDomains(): void
    {
        $zone = $this->zone();
        $viewer = $this->makeUser();
        $viewer->roles()->attach(\Pterodactyl\Models\Role::query()->create(['name' => 'zone-viewer', 'permissions' => ['settings.domains.view'], 'color' => '#000000'])->id);
        $this->actingAs($viewer->fresh());

        $this->getJson("/api/client/admin/settings/domains/zones/{$zone->id}")->assertOk();
        $this->postJson("/api/client/admin/settings/domains/zones/{$zone->id}/certificate")->assertStatus(403);
    }
}
