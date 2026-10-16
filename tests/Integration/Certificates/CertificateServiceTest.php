<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Pterodactyl\Models\Certificate;
use Pterodactyl\Services\Certificates\CertificateException;

class CertificateServiceTest extends CertificateTestCase
{
    private function fails(callable $call, string $contains): void
    {
        try {
            $call();
        } catch (CertificateException $exception) {
            $this->assertStringContainsStringIgnoringCase($contains, $exception->getMessage());

            return;
        }
        $this->fail('Expected a CertificateException about: ' . $contains);
    }

    // ---- reading --------------------------------------------------------------------------------------------------------

    public function testACertificateAndItsKeyAreRead(): void
    {
        $made = $this->makeCertificate(['panel.example.com', 'www.example.com']);

        $data = $this->service()->inspect($made['certPem'], $made['keyPem']);

        $this->assertSame(['panel.example.com', 'www.example.com'], $data['domains']);
        $this->assertSame('Test Org', $data['issuer']);
        $this->assertSame(64, strlen($data['fingerprint']));
        $this->assertTrue($data['not_after']->isFuture());
        $this->assertTrue($data['not_before']->isPast() || $data['not_before']->diffInMinutes(now()) < 2);
        $this->assertStringContainsString('BEGIN CERTIFICATE', $data['certificate']);
        $this->assertStringContainsString('PRIVATE KEY', $data['private_key']);
    }

    public function testAnEllipticCurveKeyWorksToo(): void
    {
        $made = $this->makeCertificate(['ec.example.com'], ['ec' => true]);

        $this->assertSame(['ec.example.com'], $this->service()->inspect($made['certPem'], $made['keyPem'])['domains']);
    }

    public function testWildcardsAndCaseAreKept(): void
    {
        $made = $this->makeCertificate(['*.Example.com', 'Example.com']);

        $this->assertSame(['*.example.com', 'example.com'], $this->service()->inspect($made['certPem'], $made['keyPem'])['domains']);
    }

    public function testACertificateWithOnlyACommonNameIsForThatName(): void
    {
        $made = $this->makeCertificate([], ['cn' => 'old.example.com']);

        $this->assertSame(['old.example.com'], $this->service()->inspect($made['certPem'], $made['keyPem'])['domains']);
    }

    public function testPastedTextWithNoiseAndWindowsLineEndingsIsFine(): void
    {
        $made = $this->makeCertificate(['a.example.com']);
        $noisy = "Bag Attributes\n  friendlyName: x\n" . str_replace("\n", "\r\n", $made['certPem']) . "\n\n   \n";
        $key = "  \n" . str_replace("\n", "\r\n", $made['keyPem']) . "\n";

        $data = $this->service()->inspect($noisy, $key);

        $this->assertStringNotContainsString("\r", $data['certificate']);
        $this->assertSame(['a.example.com'], $data['domains']);
    }

    public function testAChainWithItsIntermediateIsKeptWhole(): void
    {
        $chain = $this->makeChain(['chained.example.com']);

        $data = $this->service()->inspect($chain['leaf']['certPem'] . "\n" . $chain['ca']['certPem'], $chain['leaf']['keyPem']);

        $this->assertSame(2, substr_count($data['certificate'], 'BEGIN CERTIFICATE'));
        $this->assertSame(['chained.example.com'], $data['domains']);
    }

    public function testTheOwnCertificateHasToComeFirst(): void
    {
        $chain = $this->makeChain(['chained.example.com']);

        $this->fails(fn () => $this->service()->inspect($chain['ca']['certPem'] . "\n" . $chain['leaf']['certPem'], $chain['leaf']['keyPem']), 'did not sign');
    }

    public function testACertificateThatDidNotSignTheFirstIsRefused(): void
    {
        $leaf = $this->makeChain(['a.example.com'])['leaf'];
        $stranger = $this->makeCertificate(['x.example.com']);

        $this->fails(fn () => $this->service()->inspect($leaf['certPem'] . "\n" . $stranger['certPem'], $leaf['keyPem']), 'did not sign');
    }

    // ---- refusing -------------------------------------------------------------------------------------------------------

    public function testTheKeyOfAnotherCertificateIsRefused(): void
    {
        $one = $this->makeCertificate(['a.example.com']);
        $two = $this->makeCertificate(['b.example.com']);

        $this->fails(fn () => $this->service()->inspect($one['certPem'], $two['keyPem']), 'does not belong');
    }

    public function testGarbageIsRefusedWithAReason(): void
    {
        $made = $this->makeCertificate(['a.example.com']);

        $this->fails(fn () => $this->service()->inspect('hello', $made['keyPem']), 'no certificate was found');
        $this->fails(fn () => $this->service()->inspect('', $made['keyPem']), 'no certificate was found');
        $this->fails(fn () => $this->service()->inspect("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----", $made['keyPem']), 'could not be read');
        $this->fails(fn () => $this->service()->inspect($made['certPem'], 'hello'), 'no private key was found');
        $this->fails(fn () => $this->service()->inspect($made['certPem'], "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"), 'could not be read');
        // A certificate is not a key, and a key is not a certificate.
        $this->fails(fn () => $this->service()->inspect($made['keyPem'], $made['keyPem']), 'no certificate was found');
        $this->fails(fn () => $this->service()->inspect($made['certPem'], $made['certPem']), 'no private key was found');
    }

    public function testAnExpiredCertificateIsRefused(): void
    {
        $made = $this->makeCertificate(['old.example.com'], ['days' => 1]);

        // Two days later it has ended.
        \Carbon\Carbon::setTestNow(now()->addDays(2));
        try {
            $this->fails(fn () => $this->service()->inspect($made['certPem'], $made['keyPem']), 'expired');
        } finally {
            \Carbon\Carbon::setTestNow();
        }
    }

    public function testTooLongAChainIsRefused(): void
    {
        $made = $this->makeCertificate(['a.example.com']);

        $this->fails(fn () => $this->service()->inspect(str_repeat($made['certPem'] . "\n", 11), $made['keyPem']), 'more than 10');
    }

    // ---- keys with a passphrase -----------------------------------------------------------------------------------------

    public function testAKeyWithAPassphraseIsOpenedAndStoredWithoutOne(): void
    {
        $made = $this->makeCertificate(['secure.example.com']);
        openssl_pkey_export($made['key'], $protected, 'correct horse');
        $this->assertStringContainsString('ENCRYPTED', $protected);

        $data = $this->service()->inspect($made['certPem'], $protected, 'correct horse');

        $this->assertStringNotContainsString('ENCRYPTED', $data['private_key']);
        $this->assertNotFalse(openssl_pkey_get_private($data['private_key']));
    }

    public function testAKeyWithAPassphraseNeedsTheRightOne(): void
    {
        $made = $this->makeCertificate(['secure.example.com']);
        openssl_pkey_export($made['key'], $protected, 'correct horse');

        $this->fails(fn () => $this->service()->inspect($made['certPem'], $protected), 'enter the passphrase');
        $this->fails(fn () => $this->service()->inspect($made['certPem'], $protected, ''), 'enter the passphrase');
        $this->fails(fn () => $this->service()->inspect($made['certPem'], $protected, 'wrong'), 'passphrase right');
    }

    // ---- keeping them ---------------------------------------------------------------------------------------------------

    public function testTheKeyIsEncryptedAtRestAndNeverInArrays(): void
    {
        $certificate = $this->add(['stored.example.com']);

        $raw = \DB::table('certificates')->where('id', $certificate->id)->value('private_key');
        $this->assertStringNotContainsString('PRIVATE KEY', $raw);
        $this->assertStringContainsString('PRIVATE KEY', $certificate->fresh()->private_key);
        $this->assertArrayNotHasKey('private_key', $certificate->toArray());
        $this->assertStringNotContainsString('PRIVATE KEY', $certificate->toJson());
    }

    public function testTheSameCertificateIsNotAddedTwice(): void
    {
        $made = $this->makeCertificate(['dup.example.com']);
        $this->service()->create('one', $made['certPem'], $made['keyPem']);

        $this->fails(fn () => $this->service()->create('two', $made['certPem'], $made['keyPem']), 'added already');
        $this->assertSame(1, Certificate::query()->count());
    }

    public function testTheFirstCertificateIsTheDefault(): void
    {
        $first = $this->add(['one.example.com']);
        $second = $this->add(['two.example.com']);

        $this->assertTrue($first->fresh()->is_default);
        $this->assertFalse($second->fresh()->is_default);
    }

    public function testTheDefaultMovesWhenAnotherIsMadeTheDefault(): void
    {
        $first = $this->add(['one.example.com']);
        $second = $this->add(['two.example.com']);

        $this->service()->update($second, 'two', true, true);

        $this->assertFalse($first->fresh()->is_default);
        $this->assertTrue($second->fresh()->is_default);
        $this->assertSame(1, Certificate::query()->where('is_default', true)->count());
    }

    public function testADefaultIsAlwaysOneThatIsOn(): void
    {
        $first = $this->add(['one.example.com']);
        $second = $this->add(['two.example.com']);

        $this->service()->update($first, 'one', false, true);

        $this->assertFalse($first->fresh()->is_default);
        $this->assertTrue($second->fresh()->is_default, 'the one that is on takes over');

        // And one that is off can not be made the default.
        $this->service()->update($first->fresh(), 'one', false, true);
        $this->assertFalse($first->fresh()->is_default);
    }

    public function testDeletingTheDefaultPassesItOn(): void
    {
        $first = $this->add(['one.example.com']);
        $second = $this->add(['two.example.com']);

        $this->service()->delete($first);

        $this->assertTrue($second->fresh()->is_default);
        $this->service()->delete($second->fresh());
        $this->assertSame(0, Certificate::query()->count());
    }

    public function testRenewingKeepsTheNameAndTheSettings(): void
    {
        $old = $this->add(['renew.example.com'], 'My cert');
        $this->service()->update($old, 'My cert', true, true);
        $made = $this->makeCertificate(['renew.example.com'], ['days' => 90]);

        $new = $this->service()->replace($old->fresh(), $made['certPem'], $made['keyPem']);

        $this->assertSame('My cert', $new->name);
        $this->assertTrue($new->is_default);
        $this->assertNotSame($old->fingerprint, $new->fresh()->fingerprint);
        $this->assertTrue($new->not_after->gt(now()->addDays(60)));
        $this->assertSame(1, Certificate::query()->count());
    }

    public function testRenewingWithAnotherCertificateThatIsAddedIsRefused(): void
    {
        $one = $this->add(['one.example.com']);
        $two = $this->makeCertificate(['two.example.com']);
        $this->service()->create('two', $two['certPem'], $two['keyPem']);

        $this->fails(fn () => $this->service()->replace($one, $two['certPem'], $two['keyPem']), 'added already');
    }

    public function testACertificateWithoutItsIntermediatesIsSaidToLackThem(): void
    {
        $chain = $this->makeChain(['chain.example.com']);
        $alone = $this->service()->create('alone', $chain['leaf']['certPem'], $chain['leaf']['keyPem']);
        $this->assertTrue($this->service()->lacksIntermediates($alone));

        $full = $this->makeChain(['full.example.com']);
        $whole = $this->service()->create('whole', $full['leaf']['certPem'] . "\n" . $full['ca']['certPem'], $full['leaf']['keyPem']);
        $this->assertFalse($this->service()->lacksIntermediates($whole));

        // Self signed: there is no authority to have intermediates.
        $this->assertFalse($this->service()->lacksIntermediates($this->add(['self.example.com'])));
    }

    public function testExpiryHelpers(): void
    {
        $soon = $this->add(['soon.example.com'], null, ['days' => 5]);
        $later = $this->add(['later.example.com'], null, ['days' => 60]);

        $this->assertTrue($soon->isExpiring());
        $this->assertFalse($soon->isExpired());
        $this->assertContains($soon->daysLeft(), [4, 5]);
        $this->assertFalse($later->isExpiring());

        $soon->forceFill(['not_after' => now()->subDay()])->save();
        $this->assertTrue($soon->fresh()->isExpired());
        $this->assertFalse($soon->fresh()->isExpiring());
    }

    public function testActivityIsLoggedWithoutTheKey(): void
    {
        $this->add(['logged.example.com']);

        $log = \DB::table('activity_logs')->where('event', 'certificate:create')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertStringNotContainsString('PRIVATE', (string) $log->properties);
    }
}
