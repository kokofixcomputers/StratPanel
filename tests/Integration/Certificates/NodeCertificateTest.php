<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Pterodactyl\Models\Node;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Repositories\Wings\DaemonCertificateRepository;
use Pterodactyl\Repositories\Wings\DaemonConfigurationRepository;
use Pterodactyl\Services\Nodes\NodeCertificateException;
use Pterodactyl\Services\Nodes\NodeCertificateService;

class NodeCertificateTest extends CertificateTestCase
{
    private FakeNodeWings $wings;

    private FakeNodeConfiguration $config;

    public function setUp(): void
    {
        parent::setUp();

        $this->wings = new FakeNodeWings();
        $this->config = new FakeNodeConfiguration();
        $this->app->instance(DaemonCertificateRepository::class, $this->wings);
        $this->app->instance(DaemonConfigurationRepository::class, $this->config);
        Node::query()->where('fqdn', 'like', '%.node-cert.example')->delete();
    }

    public function tearDown(): void
    {
        Node::query()->where('fqdn', 'like', '%.node-cert.example')->delete();

        parent::tearDown();
    }

    private function node(string $fqdn = 'n1.node-cert.example', string $scheme = 'http'): Node
    {
        return Node::factory()->create([
            'fqdn' => $fqdn,
            'scheme' => $scheme,
            'location_id' => Location::query()->first()?->id ?? Location::factory()->create()->id,
        ]);
    }

    private function nodes(): NodeCertificateService
    {
        return $this->app->make(NodeCertificateService::class);
    }

    // ---- which certificate covers a node --------------------------------------------------------------------------------

    public function testExactAndWildcardNamesCoverANode(): void
    {
        $exact = $this->add(['n1.node-cert.example']);
        $wild = $this->add(['*.node-cert.example']);
        $other = $this->add(['elsewhere.example']);

        $this->assertTrue(NodeCertificateService::covers($exact, 'n1.node-cert.example'));
        $this->assertTrue(NodeCertificateService::covers($exact, 'N1.Node-Cert.Example.'));
        $this->assertFalse(NodeCertificateService::covers($exact, 'n2.node-cert.example'));
        $this->assertTrue(NodeCertificateService::covers($wild, 'anything.node-cert.example'));
        $this->assertFalse(NodeCertificateService::covers($wild, 'a.b.node-cert.example'), 'a wildcard is one label');
        $this->assertFalse(NodeCertificateService::covers($wild, 'node-cert.example'), 'and not the bare domain');
        $this->assertFalse(NodeCertificateService::covers($other, 'n1.node-cert.example'));
    }

    public function testTheCandidateIsTheCoveringOneThatLastsLongest(): void
    {
        $short = $this->add(['n1.node-cert.example'], 'short', ['days' => 10]);
        $long = $this->add(['*.node-cert.example'], 'long', ['days' => 90]);
        $this->add(['elsewhere.example'], 'other', ['days' => 365]);
        $node = $this->node();

        $this->assertSame($long->id, $this->nodes()->candidate($node)->id);

        $this->service()->update($long->fresh(), 'long', false, false);
        $this->assertSame($short->id, $this->nodes()->candidate($node)->id, 'one that is off is not used');

        $short->forceFill(['not_after' => now()->subDay()])->save();
        $this->assertNull($this->nodes()->candidate($node), 'neither is one that expired');
    }

    public function testAssignedFollowsTheChoice(): void
    {
        $one = $this->add(['*.node-cert.example'], 'one');
        $two = $this->add(['*.node-cert.example'], 'two', ['days' => 90]);
        $node = $this->node();

        $this->assertNull($this->nodes()->assigned($node));

        $this->nodes()->choose($node, null, true);
        $this->assertSame($two->id, $this->nodes()->assigned($node->fresh())->id);

        $this->nodes()->choose($node, $one->id, true);
        $this->assertSame($one->id, $this->nodes()->assigned($node->fresh())->id, 'a certain one wins over following');
        $this->assertFalse($node->fresh()->certificate_auto);
    }

    // ---- pushing --------------------------------------------------------------------------------------------------------

    public function testAnHttpsNodeIsGivenTheCertificateVerified(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'https');

        $this->nodes()->push($node, $certificate);

        $this->assertCount(1, $this->wings->pushes);
        $this->assertTrue($this->wings->pushes[0]['verify']);
        $this->assertStringContainsString('PRIVATE KEY', $this->wings->pushes[0]['key'], 'the node gets the key, decrypted');
        $node->refresh();
        $this->assertSame($certificate->fingerprint, $node->certificate_fingerprint);
        $this->assertNotNull($node->certificate_pushed_at);
        $this->assertNull($node->certificate_error);
    }

    public function testNothingIsSentOverHttpWithoutConfirmation(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');

        try {
            $this->nodes()->push($node, $certificate);
            $this->fail('expected a refusal');
        } catch (NodeCertificateException $exception) {
            $this->assertTrue($exception->needsConfirmation);
            $this->assertStringContainsString('without any protection', $exception->getMessage());
        }

        $this->assertSame([], $this->wings->pushes);
        $this->assertNotNull($node->fresh()->certificate_error);
    }

    public function testWithConfirmationItIsSentUnverifiedOverHttp(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');

        $this->nodes()->push($node, $certificate, true);

        $this->assertCount(1, $this->wings->pushes);
        $this->assertFalse($this->wings->pushes[0]['verify']);
    }

    public function testAnHttpsNodeThatCanNotBeVerifiedNeedsConfirmationToo(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'https');
        $this->wings->failVerified = true;

        try {
            $this->nodes()->push($node, $certificate);
            $this->fail('expected a refusal');
        } catch (NodeCertificateException $exception) {
            $this->assertTrue($exception->needsConfirmation);
            $this->assertStringContainsString('could not be reached over https with a trusted certificate', $exception->getMessage());
        }
        $this->assertSame([], $this->wings->pushes);

        // Confirmed: the verified try fails again, the unverified one works.
        $this->nodes()->push($node, $certificate, true);
        $this->assertFalse($this->wings->pushes[0]['verify']);
    }

    public function testANodeThatDoesNotAnswerIsSaidSo(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');
        $this->wings->failUnverified = true;

        try {
            $this->nodes()->push($node, $certificate, true);
            $this->fail('expected an error');
        } catch (NodeCertificateException $exception) {
            $this->assertFalse($exception->needsConfirmation);
            $this->assertStringContainsString('did not take', $exception->getMessage());
        }
        $this->assertNotNull($node->fresh()->certificate_error);
        $this->assertNull($node->fresh()->certificate_fingerprint);
    }

    public function testAnExpiredCertificateIsNotPushed(): void
    {
        $certificate = $this->add(['n1.node-cert.example']);
        $certificate->forceFill(['not_after' => now()->subDay()])->save();

        $this->expectException(NodeCertificateException::class);
        $this->nodes()->push($this->node('n1.node-cert.example', 'https'), $certificate->fresh());
    }

    // ---- switching to https ---------------------------------------------------------------------------------------------

    public function testHttpsIsSwitchedOnWhenItWorks(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');

        $result = $this->nodes()->enableHttps($node, $certificate, true);

        $this->assertTrue($result['switched']);
        $this->assertSame('https', $node->fresh()->scheme);
        $this->assertSame([['id' => $node->id, 'scheme' => 'https']], $this->config->updates, 'the node is told');
    }

    public function testHttpsIsNotSwitchedOnWhenThePanelCanNotUseIt(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');
        $this->wings->httpsWorks = false;

        $result = $this->nodes()->enableHttps($node, $certificate, true);

        $this->assertFalse($result['switched']);
        $this->assertStringContainsString('Nothing was switched', $result['message']);
        $this->assertSame('http', $node->fresh()->scheme);
        $this->assertSame([], $this->config->updates);
        $this->assertCount(1, $this->wings->pushes, 'the certificate was given, it is ready');
    }

    public function testACertificateThatDoesNotCoverTheNodeIsRefusedForHttps(): void
    {
        $certificate = $this->add(['elsewhere.example']);

        $this->expectException(NodeCertificateException::class);
        $this->nodes()->enableHttps($this->node('n1.node-cert.example'), $certificate, true);
    }

    public function testAnHttpsNodeIsNotSwitchedAgain(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'https');

        $result = $this->nodes()->enableHttps($node, $certificate);

        $this->assertFalse($result['switched']);
        $this->assertSame([], $this->config->updates);
    }

    public function testASwitchWhoseConfigurationUpdateFailsIsStillSwitched(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');
        $this->config->fail = true;

        $result = $this->nodes()->enableHttps($node, $certificate, true);

        $this->assertTrue($result['switched']);
        $this->assertStringContainsString('could not be told', $result['message']);
    }

    // ---- keeping nodes up to date ---------------------------------------------------------------------------------------

    public function testRenewedCertificatesAreGivenToTheNodesThatFollowThem(): void
    {
        $certificate = $this->add(['*.node-cert.example'], 'wild');
        $following = $this->node('a.node-cert.example', 'https');
        $following->forceFill(['certificate_auto' => true])->save();
        $chosen = $this->node('b.node-cert.example', 'https');
        $chosen->forceFill(['certificate_id' => $certificate->id])->save();
        $unrelated = $this->node('c.node-cert.example', 'https');

        $result = $this->nodes()->syncAll();

        $this->assertSame(['pushed' => 2, 'failed' => 0], $result);
        $this->assertEqualsCanonicalizing([$following->id, $chosen->id], array_column($this->wings->pushes, 'node'));
        $this->assertNotContains($unrelated->id, array_column($this->wings->pushes, 'node'));

        // Nothing changed: nothing is sent again.
        $this->wings->pushes = [];
        $this->assertSame(['pushed' => 0, 'failed' => 0], $this->nodes()->syncAll());
        $this->assertSame([], $this->wings->pushes);

        // A renewal is.
        $made = $this->makeCertificate(['*.node-cert.example'], ['days' => 90]);
        $this->service()->replace($certificate->fresh(), $made['certPem'], $made['keyPem']);
        $this->assertSame(2, $this->nodes()->syncAll()['pushed']);
    }

    public function testTheBackgroundNeverGivesAKeyToAnUncheckedNode(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $http = $this->node('a.node-cert.example', 'http');
        $http->forceFill(['certificate_id' => $certificate->id])->save();
        $broken = $this->node('b.node-cert.example', 'https');
        $broken->forceFill(['certificate_id' => $certificate->id])->save();
        $this->wings->failVerified = true;

        $result = $this->nodes()->syncAll();

        $this->assertSame(['pushed' => 0, 'failed' => 1], $result);
        $this->assertSame([], $this->wings->pushes);
        $this->assertNotNull($broken->fresh()->certificate_error);
    }

    public function testAFailureIsTriedAgainNextTime(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('a.node-cert.example', 'https');
        $node->forceFill(['certificate_id' => $certificate->id])->save();

        $this->wings->failVerified = true;
        $this->nodes()->syncAll();
        $this->assertNotNull($node->fresh()->certificate_error);

        $this->wings->failVerified = false;
        $this->assertSame(1, $this->nodes()->syncAll()['pushed']);
        $this->assertNull($node->fresh()->certificate_error);
    }

    public function testTheHourlyCommandDoesIt(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('a.node-cert.example', 'https');
        $node->forceFill(['certificate_id' => $certificate->id])->save();

        $this->artisan('p:node:sync-certificates')->assertExitCode(0);

        $this->assertCount(1, $this->wings->pushes);
        $events = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())->map(fn ($e) => $e->command);
        $this->assertTrue($events->contains(fn ($c) => str_contains((string) $c, 'p:node:sync-certificates')));
    }

    public function testDeletingACertificateLeavesTheNodeWithoutChoice(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('a.node-cert.example', 'https');
        $node->forceFill(['certificate_id' => $certificate->id])->save();

        $this->service()->delete($certificate);

        $this->assertNull($node->fresh()->certificate_id);
        $this->assertNull($this->nodes()->assigned($node->fresh()));
    }

    public function testWhatTheNodeHasIsTold(): void
    {
        $node = $this->node();
        $this->wings->live = ['present' => true, 'certificate' => ['fingerprint' => 'abc']];
        $this->assertTrue($this->nodes()->live($node)['present']);

        $this->wings->liveError = 'refused';
        $live = $this->nodes()->live($node);
        $this->assertFalse($live['present']);
        $this->assertNotEmpty($live['error']);
    }

    // ---- the page -------------------------------------------------------------------------------------------------------

    private function root()
    {
        return $this->makeUser(['root_admin' => true]);
    }

    private function page(string $uri)
    {
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        return $this->get($uri);
    }

    public function testThePageShowsWhatTheNodeHasAndOffersTheChoice(): void
    {
        $certificate = $this->add(['*.node-cert.example'], 'Wild');
        $node = $this->node('n1.node-cert.example', 'http');
        $this->wings->live = ['present' => true, 'certificate' => [
            'fingerprint' => str_repeat('a', 64), 'names' => ['n1.node-cert.example'], 'source' => 'self-signed',
            'not_after' => now()->addDays(20)->toIso8601String(), 'not_before' => now()->toIso8601String(),
        ]];
        $this->actingAs($this->root());

        $this->page('/admin/nodes/view/' . $node->id . '/certificate')->assertOk()->assertSee('<div id="app"></div>', false);
        $json = $this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->assertOk()->json();
        $this->assertTrue($json['live']['present']);
        $this->assertSame('self-signed', $json['live']['certificate']['source']);
        $this->assertSame(['Wild'], array_column($json['certificates'], 'name'));
        $this->assertTrue($json['certificates'][0]['covers']);
        $this->assertSame('Wild', $json['candidate']['name']);
    }

    public function testThePageWorksAfterACertificateWasGivenToTheNode(): void
    {
        $certificate = $this->add(['*.node-cert.example'], 'Wild');
        $node = $this->node('n1.node-cert.example', 'https');
        $this->nodes()->choose($node, $certificate->id, false);
        $this->nodes()->push($node, $certificate);
        $this->actingAs($this->root());

        $this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->assertOk()->assertJsonPath('assigned.name', 'Wild');
        $this->assertNotNull($this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->json('node.pushed_at'));

        $node->forceFill(['certificate_error' => 'it broke'])->save();
        $this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->assertOk()->assertJsonPath('node.error', 'it broke');
    }

    public function testThePageSaysWhenTheNodeCanNotBeAsked(): void
    {
        $node = $this->node();
        $this->wings->liveError = 'connection refused';
        $this->actingAs($this->root());

        $this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->assertOk()->assertJsonPath('live.present', false)->assertJsonStructure(['live' => ['error']]);
    }

    public function testTheChoiceIsSaved(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node();
        $this->actingAs($this->root());

        $this->patchJson('/api/client/admin/nodes/' . $node->id . '/certificate', ['certificate' => (string) $certificate->id])->assertOk();
        $this->assertSame($certificate->id, $node->fresh()->certificate_id);

        $this->patchJson('/api/client/admin/nodes/' . $node->id . '/certificate', ['certificate' => 'auto'])->assertOk();
        $this->assertNull($node->fresh()->certificate_id);
        $this->assertTrue($node->fresh()->certificate_auto);

        $this->patchJson('/api/client/admin/nodes/' . $node->id . '/certificate', ['certificate' => ''])->assertOk();
        $this->assertFalse($node->fresh()->certificate_auto);
    }

    public function testPushingFromThePageAsksForConfirmationOverHttp(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');
        $this->nodes()->choose($node, $certificate->id, false);
        $this->actingAs($this->root());

        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/push')->assertStatus(400)->assertJsonPath('needs_confirmation', true);
        $this->assertSame([], $this->wings->pushes);

        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/push', ['confirm' => '1'])->assertOk();
        $this->assertCount(1, $this->wings->pushes);
    }

    public function testEnablingHttpsFromThePage(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'http');
        $this->nodes()->choose($node, $certificate->id, false);
        $this->actingAs($this->root());

        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/enable', ['confirm' => '1'])->assertOk();

        $this->assertSame('https', $node->fresh()->scheme);
    }

    public function testNothingIsDoneWithoutAChosenCertificate(): void
    {
        $node = $this->node();
        $this->actingAs($this->root());

        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/push', ['confirm' => '1'])->assertStatus(400);
        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/enable', ['confirm' => '1'])->assertStatus(400);

        $this->assertSame([], $this->wings->pushes);
        $this->assertSame('http', $node->fresh()->scheme);
    }

    public function testGivingAKeyToANodeIsItsOwnPermission(): void
    {
        $certificate = $this->add(['*.node-cert.example']);
        $node = $this->node('n1.node-cert.example', 'https');
        $this->nodes()->choose($node, $certificate->id, false);

        $viewer = $this->makeUser();
        $viewer->roles()->attach(Role::query()->create(['name' => 'cert-viewer', 'permissions' => ['nodes.view'], 'color' => '#000000'])->id);
        $this->actingAs($viewer->fresh());

        $this->page('/admin/nodes/view/' . $node->id . '/certificate')->assertOk();
        $this->getJson('/api/client/admin/nodes/' . $node->id . '/certificate')->assertOk();
        $this->patchJson('/api/client/admin/nodes/' . $node->id . '/certificate', ['certificate' => 'auto'])->assertStatus(403);
        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/push')->assertStatus(403);
        $this->postJson('/api/client/admin/nodes/' . $node->id . '/certificate/enable')->assertStatus(403);
        $this->assertSame([], $this->wings->pushes);
    }

    public function testAddingACertificateGivesItToTheNodesThatFollowIt(): void
    {
        $node = $this->node('a.node-cert.example', 'https');
        $node->forceFill(['certificate_auto' => true])->save();
        $made = $this->makeCertificate(['*.node-cert.example']);
        $this->actingAs($this->root());

        $this->postJson('/api/client/admin/settings/certificates', ['name' => 'New wildcard', 'certificate' => $made['certPem'], 'private_key' => $made['keyPem']])->assertStatus(201);

        $this->assertCount(1, $this->wings->pushes);
        $this->assertSame($node->id, $this->wings->pushes[0]['node']);
    }
}
