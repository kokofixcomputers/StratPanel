<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Illuminate\Http\UploadedFile;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\Certificate;

class CertificatesAdminTest extends CertificateTestCase
{
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

    private function withRole(array $permissions)
    {
        $user = $this->makeUser();
        $user->roles()->attach(Role::query()->create(['name' => 'cert-' . bin2hex(random_bytes(3)), 'permissions' => $permissions, 'color' => '#000000'])->id);

        return $user->fresh();
    }

    // ---- who ------------------------------------------------------------------------------------------------------------

    public function testNobodyWithoutTheRightGetsIn(): void
    {
        $this->actingAs($this->makeUser())->get('/admin/settings/certificates')->assertStatus(403);
        $this->post('/admin/settings/certificates', ['name' => 'x'])->assertStatus(403);
    }

    public function testSeeingIsNotChanging(): void
    {
        $certificate = $this->add(['a.example.com']);
        $this->actingAs($this->withRole(['settings.certificates.view']));

        $this->page('/admin/settings/certificates')->assertOk()->assertSee($certificate->name);
        $this->page('/admin/settings/certificates/' . $certificate->id)->assertOk();
        $this->post('/admin/settings/certificates', ['name' => 'x'])->assertStatus(403);
        $this->patch('/admin/settings/certificates/' . $certificate->id, ['name' => 'x'])->assertStatus(403);
        $this->delete('/admin/settings/certificates/' . $certificate->id)->assertStatus(403);
        $this->assertSame(1, Certificate::query()->count());
    }

    // ---- the pages ------------------------------------------------------------------------------------------------------

    public function testTheListShowsWhatMatters(): void
    {
        $this->add(['panel.example.com', 'www.example.com'], 'Main');
        $soon = $this->add(['soon.example.com'], 'Soon', ['days' => 5]);
        $this->actingAs($this->root());

        $this->page('/admin/settings/certificates')->assertOk()->assertSee('Main')->assertSee('panel.example.com')->assertSee('Default')
            ->assertSee('days left')->assertSee($soon->name);
    }

    public function testNeitherPageEverShowsTheKey(): void
    {
        $made = $this->makeCertificate(['secret.example.com']);
        $certificate = $this->service()->create('Secret', $made['certPem'], $made['keyPem']);
        $this->actingAs($this->root());

        foreach (['/admin/settings/certificates', '/admin/settings/certificates/' . $certificate->id] as $uri) {
            $html = $this->page($uri)->assertOk()->getContent();
            // The form's placeholder says what to paste, none of the key itself is in the page.
            $body = array_values(array_filter(explode("\n", $made['keyPem']), fn ($line) => $line !== '' && !str_starts_with($line, '-----')));
            foreach (array_slice($body, 2, 5) as $line) {
                $this->assertStringNotContainsString($line, $html);
            }
        }
    }

    public function testTheListSaysWhetherTheEdgeIsSetUp(): void
    {
        $this->actingAs($this->root());

        config(['certificates.token' => '']);
        $this->page('/admin/settings/certificates')->assertSee('not set up on this machine')->assertSee('panel-edge/install.sh');

        config(['certificates.token' => 'edge-secret']);
        $this->page('/admin/settings/certificates')->assertSee('has not asked for certificates yet');

        $this->service()->edgeSeen('127.0.0.1', 2);
        $this->page('/admin/settings/certificates')->assertSee('Connected')->assertSee('was given 2 certificates');
    }

    // ---- adding ---------------------------------------------------------------------------------------------------------

    public function testACertificateIsAddedByPasting(): void
    {
        $made = $this->makeCertificate(['pasted.example.com']);
        $this->actingAs($this->root());

        $this->post('/admin/settings/certificates', ['name' => 'Pasted', 'certificate' => $made['certPem'], 'private_key' => $made['keyPem']])
            ->assertRedirect('/admin/settings/certificates');

        $certificate = Certificate::query()->firstOrFail();
        $this->assertSame('Pasted', $certificate->name);
        $this->assertSame(['pasted.example.com'], $certificate->domains);
        $this->assertTrue($certificate->is_default && $certificate->enabled);
    }

    public function testACertificateIsAddedFromFiles(): void
    {
        $chain = $this->makeChain(['filed.example.com']);
        $this->actingAs($this->root());

        $this->post('/admin/settings/certificates', [
            'name' => 'Filed',
            'certificate_file' => UploadedFile::fake()->createWithContent('fullchain.pem', $chain['leaf']['certPem'] . "\n" . $chain['ca']['certPem']),
            'private_key_file' => UploadedFile::fake()->createWithContent('privkey.pem', $chain['leaf']['keyPem']),
        ])->assertRedirect('/admin/settings/certificates');

        $this->assertSame(['filed.example.com'], Certificate::query()->firstOrFail()->domains);
        $this->assertSame(2, substr_count(Certificate::query()->firstOrFail()->certificate, 'BEGIN CERTIFICATE'));
    }

    public function testAKeyWithAPassphraseIsAddedWithIt(): void
    {
        $made = $this->makeCertificate(['pass.example.com']);
        openssl_pkey_export($made['key'], $protected, 'open sesame');
        $this->actingAs($this->root());

        $this->post('/admin/settings/certificates', ['name' => 'Pass', 'certificate' => $made['certPem'], 'private_key' => $protected, 'passphrase' => 'open sesame']);

        $this->assertSame(1, Certificate::query()->count());
        $this->assertStringNotContainsString('ENCRYPTED', Certificate::query()->firstOrFail()->private_key);
    }

    public function testWhatIsWrongIsSaidAndNothingIsAdded(): void
    {
        $one = $this->makeCertificate(['a.example.com']);
        $two = $this->makeCertificate(['b.example.com']);
        $this->actingAs($this->root());

        $this->post('/admin/settings/certificates', ['name' => 'Mismatch', 'certificate' => $one['certPem'], 'private_key' => $two['keyPem']])->assertRedirect();
        $this->post('/admin/settings/certificates', ['name' => 'No key', 'certificate' => $one['certPem']])->assertRedirect();
        $this->post('/admin/settings/certificates', ['name' => 'No cert', 'private_key' => $one['keyPem']])->assertRedirect();
        $this->post('/admin/settings/certificates', ['name' => 'Junk', 'certificate' => 'hello', 'private_key' => 'world'])->assertRedirect();
        $this->post('/admin/settings/certificates', ['name' => '', 'certificate' => $one['certPem'], 'private_key' => $one['keyPem']])->assertStatus(422);

        $this->assertSame(0, Certificate::query()->count());
    }

    public function testTheKeyIsNotGivenBackInTheFormAfterAMistake(): void
    {
        $one = $this->makeCertificate(['a.example.com']);
        $two = $this->makeCertificate(['b.example.com']);
        $this->actingAs($this->root());

        $this->post('/admin/settings/certificates', ['name' => 'Mismatch', 'certificate' => $one['certPem'], 'private_key' => $two['keyPem'], 'passphrase' => 'secret']);
        $html = $this->page('/admin/settings/certificates')->getContent();

        $body = array_values(array_filter(explode("\n", $two['keyPem']), fn ($line) => $line !== '' && !str_starts_with($line, '-----')));
        $this->assertStringNotContainsString($body[3], $html);
        $this->assertStringNotContainsString('value="secret"', $html);
    }

    // ---- changing -------------------------------------------------------------------------------------------------------

    public function testSettingsAreChanged(): void
    {
        $certificate = $this->add(['a.example.com'], 'Old name');
        $other = $this->add(['b.example.com'], 'Other');
        $this->actingAs($this->root());

        $this->patch('/admin/settings/certificates/' . $other->id, ['name' => 'Renamed', 'enabled' => '1', 'is_default' => '1'])
            ->assertRedirect('/admin/settings/certificates/' . $other->id);

        $this->assertSame('Renamed', $other->fresh()->name);
        $this->assertTrue($other->fresh()->is_default);
        $this->assertFalse($certificate->fresh()->is_default);
    }

    public function testACertificateIsSwitchedOff(): void
    {
        $certificate = $this->add(['a.example.com']);
        $this->actingAs($this->root());

        $this->patch('/admin/settings/certificates/' . $certificate->id, ['name' => $certificate->name]);

        $this->assertFalse($certificate->fresh()->enabled);
        $this->assertFalse($certificate->fresh()->is_default);
    }

    public function testACertificateIsRenewed(): void
    {
        $certificate = $this->add(['renew.example.com'], 'Renewed');
        $made = $this->makeCertificate(['renew.example.com'], ['days' => 90]);
        $this->actingAs($this->root());

        $this->patch('/admin/settings/certificates/' . $certificate->id, [
            'name' => 'Renewed', 'enabled' => '1', 'is_default' => '1', 'certificate' => $made['certPem'], 'private_key' => $made['keyPem'],
        ])->assertRedirect();

        $this->assertNotSame($certificate->fingerprint, $certificate->fresh()->fingerprint);
        $this->assertTrue($certificate->fresh()->not_after->gt(now()->addDays(60)));
        $this->assertSame(1, Certificate::query()->count());
    }

    public function testARenewalWithAnythingWrongChangesNothing(): void
    {
        $certificate = $this->add(['renew.example.com'], 'Renewed');
        $before = $certificate->fingerprint;
        $made = $this->makeCertificate(['renew.example.com']);
        $this->actingAs($this->root());

        // Only the certificate, without its key.
        $this->patch('/admin/settings/certificates/' . $certificate->id, ['name' => 'Changed', 'enabled' => '1', 'certificate' => $made['certPem']])->assertRedirect();

        $this->assertSame($before, $certificate->fresh()->fingerprint);
        $this->assertSame('Renewed', $certificate->fresh()->name, 'nothing of the form was applied');
    }

    public function testACertificateIsDeleted(): void
    {
        $first = $this->add(['a.example.com']);
        $second = $this->add(['b.example.com']);
        $this->actingAs($this->root());

        $this->delete('/admin/settings/certificates/' . $first->id)->assertRedirect('/admin/settings/certificates');

        $this->assertNull(Certificate::query()->find($first->id));
        $this->assertTrue($second->fresh()->is_default);
    }

    public function testRolesGetSeparateSeeAndChangePermissions(): void
    {
        $this->actingAs($this->withRole(['settings.certificates.update']));
        $made = $this->makeCertificate(['a.example.com']);

        // Changing comes with seeing.
        $this->page('/admin/settings/certificates')->assertOk();
        $this->post('/admin/settings/certificates', ['name' => 'Mine', 'certificate' => $made['certPem'], 'private_key' => $made['keyPem']])->assertRedirect();
        $this->assertSame(1, Certificate::query()->count());
    }

    public function testTheTabOnlyShowsToThoseWhoMaySeeIt(): void
    {
        $this->actingAs($this->withRole(['settings.branding.view']));
        $html = $this->page('/admin/settings/branding')->assertOk()->getContent();
        $this->assertStringNotContainsString(route('admin.settings.certificates'), $html);

        $this->signOut();
        $this->actingAs($this->root());
        $this->assertStringContainsString(route('admin.settings.certificates'), $this->page('/admin/settings/branding')->getContent());
    }

    private function signOut(): void
    {
        $this->app['auth']->forgetGuards();
        $this->app['auth']->shouldUse('web');
        $this->flushSession();
    }
}
