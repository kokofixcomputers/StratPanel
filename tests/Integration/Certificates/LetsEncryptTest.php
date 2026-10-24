<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Models\AcmeChallenge;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Services\Acme\AcmeIssuer;
use Pterodactyl\Services\Acme\DomainCertificateService;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;
use Pterodactyl\Exceptions\DisplayException;

class LetsEncryptTest extends CertificateTestCase
{
    use CreatesTestModels;

    private FakeAcmeIssuer $issuer;

    private FakeTxtChecker $txt;

    public function setUp(): void
    {
        parent::setUp();

        $this->issuer = new FakeAcmeIssuer();
        $this->app->instance(AcmeIssuer::class, $this->issuer);
        $this->txt = new FakeTxtChecker();
        $this->app->instance(\Pterodactyl\Services\Acme\DnsTxtChecker::class, $this->txt);
        config(['acme.dns_wait_seconds' => 2, 'acme.dns_poll_seconds' => 0, 'acme.dns_settle_seconds' => 0]);
        config(['acme.enabled' => true, 'pterodactyl.domains.enabled' => true, 'pterodactyl.domains.target_ip' => '203.0.113.5']);
        \DB::table('server_domains')->where('domain', 'like', '%.le-test.example')->delete();
        AcmeChallenge::query()->delete();
    }

    public function tearDown(): void
    {
        $ids = \DB::table('users')->where('email', 'like', '%@cert-test.example')->pluck('id');
        $servers = \DB::table('servers')->whereIn('owner_id', $ids)->pluck('id');
        \DB::table('server_domains')->whereIn('server_id', $servers)->delete();
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        AcmeChallenge::query()->delete();

        parent::tearDown();
    }

    private function acme(): DomainCertificateService
    {
        return $this->app->make(DomainCertificateService::class);
    }

    private function certs(): \Pterodactyl\Services\Certificates\CertificateService
    {
        return $this->app->make(\Pterodactyl\Services\Certificates\CertificateService::class);
    }

    /** panel-edge is there and answers on port 80. */
    private function edgeIsThere(array $features = ['http']): void
    {
        $this->certs()->edgeSeen('127.0.0.1', 0, $features);
    }

    private function domain(string $name = 'app.le-test.example', array $attributes = [], ?\Pterodactyl\Models\User $owner = null): ServerDomain
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();
        $server = $this->createServerModel(['user_id' => ($owner ?? $this->makeUser())->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);

        return ServerDomain::query()->create(array_merge(['server_id' => $server->id, 'allocation_id' => $server->allocation_id, 'domain' => $name], $attributes));
    }

    private function pointsHere(ServerDomain $domain): void
    {
        Cache::put("domains:dns:resolved:{$domain->domain}", ['203.0.113.5'], 60);
    }

    // ---- the challenge --------------------------------------------------------------------------------------------------

    public function testTheChallengeIsAnsweredOverHttpWithoutAnyLogin(): void
    {
        AcmeChallenge::publish('abcdefghijklmnop_-1234', 'abcdefghijklmnop_-1234.thumbprint');

        $response = $this->get('/.well-known/acme-challenge/abcdefghijklmnop_-1234')->assertOk();

        $this->assertSame('abcdefghijklmnop_-1234.thumbprint', $response->getContent());
        $this->assertStringStartsWith('text/plain', $response->headers->get('Content-Type'));
    }

    public function testAnythingElseIsNotFound(): void
    {
        AcmeChallenge::publish('validtoken12345', 'answer');

        $this->get('/.well-known/acme-challenge/unknowntoken12345')->assertNotFound();
        // A token of another shape is not a challenge at all (the panel's own page answers), and never gives the answer.
        foreach (['short', str_repeat('a', 200), 'has.dots.in.it.12345', '..%2F..%2Fetc'] as $token) {
            $this->assertStringNotContainsString('answer', (string) $this->get('/.well-known/acme-challenge/' . $token)->getContent());
        }
    }

    public function testAChallengeThatExpiredOrWasRemovedIsGone(): void
    {
        AcmeChallenge::publish('expiringtoken1234', 'answer');
        AcmeChallenge::query()->update(['expires_at' => now()->subMinute()]);
        $this->get('/.well-known/acme-challenge/expiringtoken1234')->assertNotFound();

        AcmeChallenge::publish('removedtoken12345', 'answer');
        AcmeChallenge::forget('removedtoken12345');
        $this->get('/.well-known/acme-challenge/removedtoken12345')->assertNotFound();
    }

    public function testPublishingTidiesUpAndReplaces(): void
    {
        AcmeChallenge::publish('oldtoken1234567', 'old');
        AcmeChallenge::query()->update(['expires_at' => now()->subHour()]);

        AcmeChallenge::publish('newtoken1234567', 'one');
        AcmeChallenge::publish('newtoken1234567', 'two');

        $this->assertSame(1, AcmeChallenge::query()->count());
        $this->assertSame('two', AcmeChallenge::answer('newtoken1234567'));
    }

    // ---- when the button works ------------------------------------------------------------------------------------------

    public function testTheButtonNeedsLetsEncryptToBeOnAndPortEightyToBeAnswered(): void
    {
        $domain = $this->domain();

        config(['acme.enabled' => false]);
        $this->assertFalse($this->acme()->describe($domain)['can_request']);
        $this->assertStringContainsString('not turned on', $this->acme()->describe($domain)['reason']);

        config(['acme.enabled' => true]);
        $this->assertStringContainsString('port 80', $this->acme()->describe($domain)['reason']);

        $this->edgeIsThere();
        $this->assertTrue($this->acme()->describe($domain)['can_request']);
        $this->assertNull($this->acme()->describe($domain)['reason']);
    }

    public function testAnEdgeThatDoesNotAnswerOnPortEightyOrIsGoneDoesNotCount(): void
    {
        $this->edgeIsThere(['something-else']);
        $this->assertFalse($this->acme()->httpReady());

        $this->edgeIsThere(['http']);
        $this->assertTrue($this->acme()->httpReady());

        \Carbon\Carbon::setTestNow(now()->addMinutes(11));
        try {
            $this->assertFalse($this->acme()->httpReady(), 'not seen for a while');
        } finally {
            \Carbon\Carbon::setTestNow();
        }
    }

    // ---- asking ---------------------------------------------------------------------------------------------------------

    private function refused(callable $call, string $contains): void
    {
        try {
            $call();
        } catch (DisplayException $exception) {
            $this->assertStringContainsString($contains, $exception->getMessage());

            return;
        }
        $this->fail('Expected a refusal about: ' . $contains);
    }

    public function testNothingIsAskedWhenItCanNotWork(): void
    {
        $domain = $this->domain();

        config(['acme.enabled' => false]);
        $this->refused(fn () => $this->acme()->request($domain), 'not turned on');

        config(['acme.enabled' => true]);
        $this->refused(fn () => $this->acme()->request($domain), 'port 80');

        $this->edgeIsThere();
        $this->refused(fn () => $this->acme()->request($domain), 'does not point at this panel');

        $this->assertSame([], $this->issuer->asked);
        $this->assertSame('none', $domain->fresh()->certificate_status);
    }

    public function testWildcardsAndIpAddressesAreRefused(): void
    {
        $this->edgeIsThere();
        $ip = $this->domain('198.51.100.7');
        $this->refused(fn () => $this->acme()->request($ip), 'not a wildcard or an IP');

        $wild = $this->domain('*.le-test.example');
        $this->refused(fn () => $this->acme()->request($wild), 'not a wildcard or an IP');
    }

    public function testACertificateIsGotAndLinked(): void
    {
        $this->edgeIsThere();
        $domain = $this->domain();
        $this->pointsHere($domain);

        $this->acme()->request($domain);

        $domain->refresh();
        $this->assertSame(['app.le-test.example'], $this->issuer->asked);
        $this->assertSame('issued', $domain->certificate_status, 'the queue runs at once in the tests');
        $this->assertTrue($domain->web, 'asking for a certificate serves the domain over the web');
        $certificate = Certificate::query()->findOrFail($domain->certificate_id);
        $this->assertSame('letsencrypt', $certificate->source);
        $this->assertSame('app.le-test.example', $certificate->acme_domain);
        $this->assertSame(['app.le-test.example'], $certificate->domains);
        $this->assertStringContainsString("Let's Encrypt", $certificate->name);
        $this->assertTrue($certificate->enabled);
    }

    public function testAFailureIsKeptWithItsReasonAndCanBeTriedAgain(): void
    {
        $this->edgeIsThere();
        $domain = $this->domain();
        $this->pointsHere($domain);
        $this->issuer->fail = 'Timeout during connect (likely firewall problem)';

        $this->acme()->request($domain);

        $this->assertSame('failed', $domain->fresh()->certificate_status);
        $this->assertStringContainsString('Timeout during connect', $domain->fresh()->certificate_message);
        $this->assertSame(0, Certificate::query()->count());
        $this->assertTrue($this->acme()->describe($domain->fresh())['can_request'], 'it can be tried again');

        $this->issuer->fail = null;
        $this->acme()->request($domain->fresh());
        $this->assertSame('issued', $domain->fresh()->certificate_status);
        $this->assertNull($domain->fresh()->certificate_message);
    }

    public function testADomainThatAnUploadedCertificateCoversNeedsNone(): void
    {
        $this->edgeIsThere();
        $wild = $this->add(['*.le-test.example'], 'Wildcard');
        $domain = $this->domain();

        $this->acme()->request($domain);

        $this->assertSame([], $this->issuer->asked, 'Let\'s Encrypt was not bothered');
        $this->assertSame($wild->id, $domain->fresh()->certificate_id);
        $this->assertSame('issued', $domain->fresh()->certificate_status);
        $description = $this->acme()->describe($domain->fresh());
        $this->assertSame('Wildcard', $description['covered_by']);
        $this->assertFalse($description['can_request']);
    }

    public function testACoveringCertificateIsRecognisedWithoutAsking(): void
    {
        $this->add(['*.le-test.example'], 'Wildcard');

        $this->assertSame('issued', $this->acme()->describe($this->domain())['status']);
        $this->assertSame('Wildcard', $this->acme()->describe($this->domain('other.le-test.example'))['covered_by']);
    }

    public function testASecondRequestWhileOneIsRunningIsRefused(): void
    {
        $this->edgeIsThere();
        $domain = $this->domain('busy.le-test.example', ['certificate_status' => 'pending']);

        $this->refused(fn () => $this->acme()->request($domain), 'being requested');
    }

    // ---- renewing -------------------------------------------------------------------------------------------------------

    private function issued(string $name, int $days): array
    {
        $this->edgeIsThere();
        $domain = $this->domain($name, ['web' => true]);
        $this->pointsHere($domain);
        $this->acme()->request($domain);
        $certificate = Certificate::query()->findOrFail($domain->fresh()->certificate_id);
        $certificate->forceFill(['not_after' => now()->addDays($days)])->save();

        return [$domain->fresh(), $certificate->fresh()];
    }

    public function testCertificatesThatEndSoonAreRenewed(): void
    {
        [, $soon] = $this->issued('soon.le-test.example', 10);
        [, $later] = $this->issued('later.le-test.example', 60);
        $before = $soon->fingerprint;
        $this->issuer->asked = [];

        $result = $this->acme()->renewDue();

        $this->assertSame(['renewed' => 1, 'failed' => 0], $result);
        $this->assertSame(['soon.le-test.example'], $this->issuer->asked);
        $this->assertNotSame($before, $soon->fresh()->fingerprint);
        $this->assertTrue($soon->fresh()->not_after->gt(now()->addDays(60)));
        $this->assertNotNull($soon->fresh()->renewed_at);
        $this->assertSame($later->fingerprint, $later->fresh()->fingerprint);
    }

    public function testARenewalKeepsWhatTheAdminSetOnTheCertificate(): void
    {
        [, $certificate] = $this->issued('keep.le-test.example', 10);
        $this->certs()->update($certificate, 'My name', true, true);

        $this->acme()->renewDue();

        $this->assertSame('My name', $certificate->fresh()->name);
        $this->assertTrue($certificate->fresh()->is_default);
        $this->assertSame(1, Certificate::query()->where('acme_domain', 'keep.le-test.example')->count());
    }

    public function testAFailedRenewalIsKeptAndTriedAgain(): void
    {
        [, $certificate] = $this->issued('fail.le-test.example', 10);
        $this->issuer->fail = 'rate limit';

        $this->assertSame(['renewed' => 0, 'failed' => 1], $this->acme()->renewDue());
        $this->assertSame('rate limit', $certificate->fresh()->renew_error);

        $this->issuer->fail = null;
        $this->assertSame(1, $this->acme()->renewDue()['renewed']);
        $this->assertNull($certificate->fresh()->renew_error);
    }

    public function testADomainThatIsNotServedAnyMoreIsLeftToEnd(): void
    {
        [$domain] = $this->issued('gone.le-test.example', 10);
        $domain->delete();
        $this->issuer->asked = [];

        $this->assertSame(['renewed' => 0, 'failed' => 0], $this->acme()->renewDue());
        $this->assertSame([], $this->issuer->asked);
    }

    public function testNothingIsRenewedWhenLetsEncryptIsTurnedOffAndUploadedOnesAreNeverTouched(): void
    {
        [, $certificate] = $this->issued('off.le-test.example', 10);
        $manual = $this->add(['manual.le-test.example'], 'manual', ['days' => 5]);
        $this->issuer->asked = [];

        config(['acme.enabled' => false]);
        $this->assertSame(0, $this->acme()->renewDue()['renewed']);

        config(['acme.enabled' => true]);
        $this->acme()->renewDue();
        $this->assertNotContains('manual.le-test.example', $this->issuer->asked);
        $this->assertNotNull($manual->fresh());
    }

    public function testTheTwiceDailyCommandRenews(): void
    {
        $this->issued('cmd.le-test.example', 10);

        $this->artisan('p:certificates:renew')->assertExitCode(0);

        $events = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->map(fn ($e) => $e->command);
        $this->assertTrue($events->contains(fn ($c) => str_contains((string) $c, 'p:certificates:renew')));
    }

    // ---- what the edge is told ------------------------------------------------------------------------------------------

    public function testOnlyDomainsServedOverTheWebAreGivenToTheEdge(): void
    {
        $web = $this->domain('web.le-test.example', ['web' => true]);
        $this->domain('mc.le-test.example', ['web' => false]);

        $sites = $this->certs()->sites();

        $this->assertSame(['web.le-test.example'], array_column($sites, 'domain'));
        $this->assertMatchesRegularExpression('/^[^:]+:\d+$/', $sites[0]['target']);
        $this->assertNull($sites[0]['status']);
        $this->assertNotNull($web);
    }

    public function testASuspendedServerIsSaidToBeBlocked(): void
    {
        $domain = $this->domain('susp.le-test.example', ['web' => true]);
        $domain->server->forceFill(['status' => Server::STATUS_SUSPENDED])->save();

        $this->assertSame('suspended', $this->certs()->sites()[0]['status']);
    }

    public function testTheTagChangesWhenADomainIsSwitchedOnOrOff(): void
    {
        config(['certificates.token' => 'edge-secret']);
        $domain = $this->domain('tag.le-test.example', ['web' => false]);
        $tag = fn () => $this->withHeader('Authorization', 'Bearer edge-secret')->getJson('/api/router/certificates')->headers->get('ETag');

        $first = $tag();
        $domain->forceFill(['web' => true])->save();
        $second = $tag();
        $domain->forceFill(['web' => false])->save();

        $this->assertNotSame($first, $second);
        $this->assertSame($first, $tag());
    }

    public function testTheEdgeSaysWhatItCanDoAndThePanelRemembersIt(): void
    {
        config(['certificates.token' => 'edge-secret']);

        $this->withHeaders(['Authorization' => 'Bearer edge-secret', 'X-Edge-Features' => 'http, other'])->getJson('/api/router/certificates')->assertOk();

        $this->assertSame(['http', 'other'], $this->certs()->lastEdge()['features']);
        $this->assertTrue($this->acme()->httpReady());
    }

    // ---- the client API -------------------------------------------------------------------------------------------------

    private function url(ServerDomain $domain, string $path = ''): string
    {
        return "/api/client/servers/{$domain->server->uuid}/domains/{$domain->id}$path";
    }

    public function testTheDomainsTellWhatTheirCertificateIs(): void
    {
        $owner = $this->makeUser();
        $domain = $this->domain('list.le-test.example', ['web' => false], $owner);
        $this->add(['*.le-test.example'], 'Wildcard');

        $this->actingAs($owner)->getJson("/api/client/servers/{$domain->server->uuid}/domains")->assertOk()
            ->assertJsonPath('data.0.https.status', 'issued')
            ->assertJsonPath('data.0.https.covered_by', 'Wildcard')
            ->assertJsonPath('data.0.https.web', false);
    }

    public function testTheOwnerGetsACertificate(): void
    {
        $owner = $this->makeUser();
        $domain = $this->domain('own.le-test.example', [], $owner);
        $this->pointsHere($domain);
        $this->edgeIsThere();

        $this->actingAs($owner)->postJson($this->url($domain, '/certificate'))->assertStatus(202)->assertJsonPath('attributes.https.status', 'issued');
        $this->assertSame(['own.le-test.example'], $this->issuer->asked);
    }

    public function testTheClientIsToldWhyItDoesNotWork(): void
    {
        $owner = $this->makeUser();
        $domain = $this->domain('why.le-test.example', [], $owner);
        $this->edgeIsThere();

        $response = $this->actingAs($owner)->postJson($this->url($domain, '/certificate'));

        $response->assertStatus(400);
        $this->assertStringContainsString('does not point at this panel', $response->json('errors.0.detail'));
    }

    public function testOnlyPeopleWhoMayChangeAllocationsDoIt(): void
    {
        $owner = $this->makeUser();
        $domain = $this->domain('perm.le-test.example', ['web' => false], $owner);
        $this->pointsHere($domain);
        $this->edgeIsThere();
        $reader = $this->makeUser();
        Subuser::query()->create(['user_id' => $reader->id, 'server_id' => $domain->server_id, 'permissions' => [Permission::ACTION_ALLOCATION_READ]]);

        $this->actingAs($reader)->postJson($this->url($domain, '/certificate'))->assertStatus(403);
        $this->assertSame([], $this->issuer->asked);
    }

    public function testDomainsOfOtherServersAreNotFound(): void
    {
        $owner = $this->makeUser();
        $mine = $this->domain('mine.le-test.example', [], $owner);
        $other = $this->domain('theirs.le-test.example', ['web' => false]);

        $this->actingAs($owner)->postJson("/api/client/servers/{$mine->server->uuid}/domains/{$other->id}/certificate")->assertNotFound();
    }

    // ---- the dns challenge ----------------------------------------------------------------------------------------------

    public function testTheDnsWayNeedsNeitherPort80NorADomainThatPointsHere(): void
    {
        // No edge on port 80 and no A record that reaches the panel: the private network case.
        $domain = $this->domain('private.le-test.example');

        $this->acme()->requestDns($domain);

        $domain->refresh();
        $this->assertSame(['private.le-test.example (dns)'], $this->issuer->asked);
        $this->assertSame('issued', $domain->certificate_status);
        $certificate = Certificate::query()->findOrFail($domain->certificate_id);
        $this->assertSame('letsencrypt', $certificate->source);
        $this->assertSame('dns', $certificate->acme_method);
        $this->assertNull($domain->dns_name, 'the record to add is not shown any more');
        $this->assertSame([['name' => '_acme-challenge.private.le-test.example', 'value' => 'txt-value-for-private.le-test.example']], $this->txt->looked);
    }

    public function testTheRecordToAddIsShownWhileWaiting(): void
    {
        $domain = $this->domain('wait.le-test.example');
        $shown = null;
        $this->txt->onLook = function () use ($domain, &$shown) {
            $shown ??= $this->acme()->describe($domain->fresh());
        };

        $this->acme()->requestDns($domain);

        $this->assertSame('pending', $shown['status']);
        $this->assertSame(['name' => '_acme-challenge.wait.le-test.example', 'value' => 'txt-value-for-wait.le-test.example'], $shown['dns']);
        $this->assertFalse($shown['can_request_dns'], 'not twice at once');
    }

    public function testARecordThatNeverShowsUpFailsWithAReasonAndCanBeTriedAgain(): void
    {
        $domain = $this->domain('never.le-test.example');
        $this->txt->visible = false;

        $this->acme()->requestDns($domain);

        $domain->refresh();
        $this->assertSame('failed', $domain->certificate_status);
        $this->assertStringContainsString('did not show up', (string) $domain->certificate_message);
        $this->assertSame(0, Certificate::query()->where('acme_domain', 'never.le-test.example')->count());
        $this->assertNull($domain->dns_name);
        $this->assertTrue($this->acme()->describe($domain)['can_request_dns']);

        $this->txt->visible = true;
        $this->acme()->requestDns($domain);
        $this->assertSame('issued', $domain->fresh()->certificate_status);
    }

    public function testAFailureAtLetsEncryptIsShown(): void
    {
        $domain = $this->domain('rejected.le-test.example');
        $this->issuer->fail = 'Challenge validation failed: wrong TXT value';

        $this->acme()->requestDns($domain);

        $this->assertSame('failed', $domain->fresh()->certificate_status);
        $this->assertStringContainsString('wrong TXT value', (string) $domain->fresh()->certificate_message);
    }

    public function testTheDnsWayIsRefusedWhenLetsEncryptIsOff(): void
    {
        config(['acme.enabled' => false]);

        $this->expectException(DisplayException::class);
        $this->acme()->requestDns($this->domain('off.le-test.example'));
    }

    public function testWildcardsAndAddressesAreRefused(): void
    {
        $this->expectException(DisplayException::class);
        $this->acme()->requestDns($this->domain('*.le-test.example'));
    }

    public function testACertificateFromTheDnsWayIsNotRenewedByItself(): void
    {
        [$domain, $certificate] = $this->issued('manual.le-test.example', 10);
        $certificate->forceFill(['acme_method' => 'dns'])->save();
        $this->issuer->asked = [];

        $this->assertSame(['renewed' => 0, 'failed' => 0], $this->acme()->renewDue());
        $this->assertSame([], $this->issuer->asked, 'it needs a TXT record, nobody is there to add it');
    }

    public function testRenewingByDnsReplacesTheCertificateInsteadOfAddingOne(): void
    {
        [$domain, $certificate] = $this->issued('again.le-test.example', 10);
        $certificate->forceFill(['acme_method' => 'dns'])->save();

        $described = $this->acme()->describe($domain->fresh());
        $this->assertTrue($described['can_request_dns']);
        $this->assertTrue($described['renew_by_dns']);

        $this->acme()->requestDns($domain->fresh());

        $this->assertSame(1, Certificate::query()->where('acme_domain', 'again.le-test.example')->count());
        $this->assertTrue($certificate->fresh()->not_after->gt(now()->addDays(60)), 'the certificate was replaced by a new one');
        $this->assertSame('issued', $domain->fresh()->certificate_status);
    }

    public function testACertificateThatIsFarFromEndingIsNotRequestedAgainByDns(): void
    {
        [$domain, $certificate] = $this->issued('fresh.le-test.example', 80);
        $certificate->forceFill(['acme_method' => 'dns'])->save();
        $this->issuer->asked = [];

        $this->assertFalse($this->acme()->describe($domain->fresh())['can_request_dns']);
        $this->acme()->requestDns($domain->fresh());
        $this->assertSame([], $this->issuer->asked);
    }

    public function testTheOwnerAsksForTheDnsWayOverTheApi(): void
    {
        $owner = $this->makeUser();
        $domain = $this->domain('api.le-test.example', [], $owner);

        $response = $this->actingAs($owner)->postJson($this->url($domain, '/certificate'), ['method' => 'dns']);

        $response->assertStatus(202)->assertJsonPath('attributes.https.status', 'issued');
        $this->assertSame('dns', Certificate::query()->where('acme_domain', 'api.le-test.example')->value('acme_method'));
        $this->postJson($this->url($domain, '/certificate'), ['method' => 'rm -rf'])->assertStatus(422);
    }

    // ---- the admin settings ---------------------------------------------------------------------------------------------

    private function admin()
    {
        return $this->makeUser(['root_admin' => true]);
    }

    private function stored(string $key): ?string
    {
        return \DB::table('settings')->where('key', 'settings::acme:' . $key)->value('value');
    }

    public function testTheAdminTurnsItOnByAgreeingToTheTerms(): void
    {
        config(['acme.enabled' => false]);
        $this->actingAs($this->admin());

        $this->patchJson('/api/client/admin/settings/certificates/letsencrypt', ['enabled' => '1'])->assertStatus(400);
        $this->assertNull($this->stored('enabled'), 'not without agreeing');

        $this->patchJson('/api/client/admin/settings/certificates/letsencrypt', ['enabled' => '1', 'agree' => '1', 'email' => 'admin@example.com', 'staging' => '1'])->assertOk();
        $this->assertSame('true', $this->stored('enabled'));
        $this->assertSame('admin@example.com', $this->stored('email'));
        $this->assertSame('true', $this->stored('staging'));
        \DB::table('settings')->where('key', 'like', 'settings::acme:%')->delete();
    }

    public function testTheAdminTurnsItOff(): void
    {
        $this->actingAs($this->admin());

        $this->patchJson('/api/client/admin/settings/certificates/letsencrypt', ['agree' => '1'])->assertOk();

        $this->assertSame('false', $this->stored('enabled'));
        \DB::table('settings')->where('key', 'like', 'settings::acme:%')->delete();
    }

    public function testAnEmailThatIsNotOneIsRefused(): void
    {
        $this->actingAs($this->admin());

        $this->patchJson('/api/client/admin/settings/certificates/letsencrypt', ['enabled' => '1', 'agree' => '1', 'email' => 'nonsense'])->assertStatus(422);
        $this->assertNull($this->stored('enabled'));
    }

    public function testThePageSaysWhetherPortEightyIsAnswered(): void
    {
        $this->actingAs($this->admin());

        $this->getJson('/api/client/admin/settings/certificates')->assertOk()->assertJsonPath('edge', null);

        $this->edgeIsThere();
        $this->getJson('/api/client/admin/settings/certificates')->assertJsonPath('edge.http', true);
    }

    public function testTheListMarksCertificatesFromLetsEncrypt(): void
    {
        [, $certificate] = $this->issued('marked.le-test.example', 60);
        $certificate->forceFill(['renew_error' => 'rate limit'])->save();
        $this->actingAs($this->admin());

        $row = $this->getJson('/api/client/admin/settings/certificates')->assertOk()->json('certificates.0');
        $this->assertSame('letsencrypt', $row['source']);
        $this->assertSame('rate limit', $row['renew_error']);
    }

    public function testTheAdminGetsACertificateForADomainThatWasAdded(): void
    {
        $this->edgeIsThere();
        $domain = $this->domain('added.le-test.example');
        $this->pointsHere($domain);
        $this->actingAs($this->admin());

        $row = collect($this->getJson('/api/client/admin/settings/certificates')->assertOk()->json('domains'))->firstWhere('domain', 'added.le-test.example');
        $this->assertTrue($row['can_request']);
        $this->assertNull($row['covered_by']);

        $json = $this->postJson('/api/client/admin/settings/certificates/letsencrypt/issue', ['domain_id' => $domain->id, 'method' => 'http'])->assertOk()->json();

        $this->assertSame(['added.le-test.example'], $this->issuer->asked);
        $this->assertSame('issued', collect($json['domains'])->firstWhere('domain', 'added.le-test.example')['status']);
        $this->assertSame('letsencrypt', collect($json['certificates'])->first()['source']);
    }

    public function testTheAdminIsToldWhyACertificateCanNotBeGot(): void
    {
        $domain = $this->domain('never.le-test.example');
        $this->actingAs($this->admin());

        // The domain does not point at the panel, and panel-edge does not answer on port 80.
        $this->postJson('/api/client/admin/settings/certificates/letsencrypt/issue', ['domain_id' => $domain->id, 'method' => 'http'])->assertStatus(400);
        $this->postJson('/api/client/admin/settings/certificates/letsencrypt/issue', ['domain_id' => 999999, 'method' => 'http'])->assertStatus(422);
        $this->postJson('/api/client/admin/settings/certificates/letsencrypt/issue', ['domain_id' => $domain->id, 'method' => 'ftp'])->assertStatus(422);
        $this->assertSame([], $this->issuer->asked);
    }

    public function testTheAdminRenewsACertificateAtOnceNotWhenItIsDue(): void
    {
        [, $certificate] = $this->issued('now.le-test.example', 60);
        $before = $certificate->fingerprint;
        $this->issuer->asked = [];
        $this->actingAs($this->admin());

        $this->postJson('/api/client/admin/settings/certificates/' . $certificate->id . '/renew')->assertOk();

        $this->assertSame(['now.le-test.example'], $this->issuer->asked);
        $this->assertNotSame($before, $certificate->fresh()->fingerprint);
        $this->assertSame(1, Certificate::query()->count(), 'replaced, not added');
    }

    public function testAnUploadedCertificateIsNotRenewedFromLetsEncrypt(): void
    {
        $made = $this->makeCertificate(['own.le-test.example']);
        $certificate = $this->certs()->create('Own', $made['certPem'], $made['keyPem']);
        $this->actingAs($this->admin());

        $this->postJson('/api/client/admin/settings/certificates/' . $certificate->id . '/renew')->assertStatus(400);
        $this->assertSame([], $this->issuer->asked);
    }

    public function testRenewingNeedsTheUpdatePermission(): void
    {
        [, $certificate] = $this->issued('perm.le-test.example', 60);
        $viewer = $this->makeUser();
        $viewer->roles()->attach(\Pterodactyl\Models\Role::query()->create(['name' => 'le-viewer', 'permissions' => ['settings.certificates.view'], 'color' => '#000000'])->id);
        $this->actingAs($viewer->fresh());

        $this->postJson('/api/client/admin/settings/certificates/' . $certificate->id . '/renew')->assertStatus(403);
        $this->postJson('/api/client/admin/settings/certificates/letsencrypt/issue', ['domain_id' => 1, 'method' => 'http'])->assertStatus(403);
    }
}
