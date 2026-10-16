<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Pterodactyl\Models\User;
use Pterodactyl\Models\Certificate;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

abstract class CertificateTestCase extends IntegrationTestCase
{
    use MakesCertificates;

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        config(['certificates.token' => 'edge-secret']);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        Certificate::query()->delete();
        Cache::forget('certificates:edge');
        User::query()->where('email', 'like', '%@cert-test.example')->delete();
        \DB::table('roles')->where('name', 'like', 'cert-%')->delete();
    }

    protected function makeUser(array $attributes = []): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(array_merge(['username' => $name, 'email' => $name . '@cert-test.example', 'password' => Hash::make('x-long-password')], $attributes));
    }

    protected function service(): \Pterodactyl\Services\Certificates\CertificateService
    {
        return $this->app->make(\Pterodactyl\Services\Certificates\CertificateService::class);
    }

    /** Adds a certificate for these names through the service. */
    protected function add(array $names, ?string $name = null, array $options = []): Certificate
    {
        $made = $this->makeCertificate($names, $options);

        return $this->service()->create($name ?? ($names[0] ?? 'cert') . '-' . bin2hex(random_bytes(2)), $made['certPem'], $made['keyPem']);
    }
}
