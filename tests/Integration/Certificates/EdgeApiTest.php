<?php

namespace Pterodactyl\Tests\Integration\Certificates;

class EdgeApiTest extends CertificateTestCase
{
    private const URL = '/api/router/certificates';

    private function asEdge(string $token = 'edge-secret')
    {
        return $this->withHeader('Authorization', 'Bearer ' . $token);
    }

    public function testTheKeysAreOnlyGivenForTheRightSecret(): void
    {
        $this->add(['a.example.com']);

        $this->getJson(self::URL)->assertStatus(401);
        $this->asEdge('wrong')->getJson(self::URL)->assertStatus(401);
        $this->asEdge('')->getJson(self::URL)->assertStatus(401);
        $this->asEdge('edge-secret')->getJson(self::URL)->assertOk();
    }

    public function testNothingIsGivenWhenNoSecretIsConfigured(): void
    {
        $this->add(['a.example.com']);
        config(['certificates.token' => '']);

        $this->asEdge('')->getJson(self::URL)->assertStatus(401);
        $this->asEdge('anything')->getJson(self::URL)->assertStatus(401);
        config(['certificates.token' => null]);
        $this->asEdge('')->getJson(self::URL)->assertStatus(401);
    }

    public function testTheSecretOfTheMinecraftRouterDoesNotOpenIt(): void
    {
        $this->add(['a.example.com']);
        config(['pterodactyl.domains.router_token' => 'router-secret']);

        $this->asEdge('router-secret')->getJson(self::URL)->assertStatus(401);
    }

    public function testTheCertificatesAreGivenWithTheirKeys(): void
    {
        $made = $this->makeCertificate(['a.example.com', '*.b.example.com']);
        $certificate = $this->service()->create('Mine', $made['certPem'], $made['keyPem']);

        $response = $this->asEdge()->getJson(self::URL)->assertOk();

        $response->assertJsonPath('certificates.0.name', 'Mine')
            ->assertJsonPath('certificates.0.domains', ['a.example.com', '*.b.example.com'])
            ->assertJsonPath('certificates.0.default', true)
            ->assertJsonPath('certificates.0.fingerprint', $certificate->fingerprint);
        $this->assertStringContainsString('BEGIN CERTIFICATE', $response->json('certificates.0.certificate'));
        $this->assertNotFalse(openssl_pkey_get_private($response->json('certificates.0.key')), 'the key is given decrypted, ready to use');
        $response->assertHeader('Cache-Control', 'no-store, private');
        $this->assertNotEmpty($response->headers->get('ETag'));
    }

    public function testCertificatesThatAreOffAreNotGiven(): void
    {
        $on = $this->add(['on.example.com']);
        $off = $this->add(['off.example.com']);
        $this->service()->update($off, 'off', false, false);

        $names = collect($this->asEdge()->getJson(self::URL)->json('certificates'))->pluck('name')->all();

        $this->assertSame([$on->name], $names);
    }

    public function testACertificateThatExpiredIsStillGivenSoVisitorsAreToldSo(): void
    {
        $certificate = $this->add(['late.example.com']);
        $certificate->forceFill(['not_after' => now()->subDay()])->save();

        $this->asEdge()->getJson(self::URL)->assertJsonCount(1, 'certificates');
    }

    public function testWithNothingAddedTheListIsEmpty(): void
    {
        $this->asEdge()->getJson(self::URL)->assertOk()->assertJsonPath('certificates', []);
    }

    public function testTheTagStaysTheSameUntilSomethingChanges(): void
    {
        $certificate = $this->add(['a.example.com']);
        $first = $this->asEdge()->getJson(self::URL)->headers->get('ETag');
        $again = $this->asEdge()->getJson(self::URL)->headers->get('ETag');
        $this->assertSame($first, $again);

        $this->add(['b.example.com']);
        $this->assertNotSame($first, $this->asEdge()->getJson(self::URL)->headers->get('ETag'));

        $second = $this->asEdge()->getJson(self::URL)->headers->get('ETag');
        $this->service()->update($certificate, $certificate->name, false, false);
        $this->assertNotSame($second, $this->asEdge()->getJson(self::URL)->headers->get('ETag'));
    }

    public function testNothingIsSentAgainWhenTheTagIsStillGood(): void
    {
        $this->add(['a.example.com']);
        $etag = $this->asEdge()->getJson(self::URL)->headers->get('ETag');

        $response = $this->asEdge()->withHeader('If-None-Match', $etag)->getJson(self::URL);

        $response->assertStatus(304);
        $this->assertSame('', $response->getContent());
        $this->asEdge()->withHeader('If-None-Match', '"old"')->getJson(self::URL)->assertOk()->assertJsonCount(1, 'certificates');
    }

    public function testTheAdminPageKnowsWhenTheEdgeAsked(): void
    {
        $this->add(['a.example.com']);
        $this->assertNull($this->service()->lastEdge());

        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])->asEdge()->getJson(self::URL)->assertOk();

        $seen = $this->service()->lastEdge();
        $this->assertSame('203.0.113.7', $seen['ip']);
        $this->assertSame(1, $seen['count']);
        $this->assertTrue($seen['at']->diffInSeconds(now()) < 5);
    }

    public function testAskingWithTheWrongSecretIsNotRecordedAsTheEdge(): void
    {
        $this->asEdge('wrong')->getJson(self::URL);

        $this->assertNull($this->service()->lastEdge());
    }
}
