<?php

namespace Pterodactyl\Services\Certificates;

use Carbon\CarbonImmutable;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Facades\Activity;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

/**
 * Certificates for serving the panel over https: checking what an admin uploaded, keeping it, and giving it to panel-edge (the program
 * that serves the https requests). The private key is stored encrypted, and only ever leaves the panel to panel-edge.
 */
class CertificateService
{
    private const EDGE_CACHE = 'certificates:edge';

    /**
     * Reads a certificate (the PEM of the certificate, then those of the intermediates) and its private key, and checks that they are
     * usable and belong together.
     *
     * @return array{certificate: string, private_key: string, domains: list<string>, issuer: string|null, not_before: CarbonImmutable, not_after: CarbonImmutable, fingerprint: string}
     *
     * @throws CertificateException
     */
    public function inspect(string $certificatePem, string $keyPem, ?string $passphrase = null): array
    {
        $blocks = $this->certificateBlocks($certificatePem);
        $leaf = @openssl_x509_read($blocks[0]);
        $info = $leaf === false ? false : @openssl_x509_parse($leaf);
        if ($leaf === false || $info === false) {
            throw new CertificateException('The first certificate could not be read. It has to be PEM text that starts with -----BEGIN CERTIFICATE-----.');
        }

        foreach (array_slice($blocks, 1) as $index => $block) {
            if (@openssl_x509_read($block) === false) {
                throw new CertificateException('Certificate number ' . ($index + 2) . ' in the chain could not be read.');
            }
        }
        $this->checkChainOrder($blocks);

        $key = $this->readKey($keyPem, $passphrase);
        if (!openssl_x509_check_private_key($leaf, $key)) {
            throw new CertificateException('The private key does not belong to this certificate.');
        }
        if (!openssl_pkey_export($key, $unprotected)) {
            throw new CertificateException('The private key could not be read.');
        }

        $notAfter = CarbonImmutable::createFromTimestampUTC((int) $info['validTo_time_t']);
        $notBefore = CarbonImmutable::createFromTimestampUTC((int) $info['validFrom_time_t']);
        if ($notAfter->isPast()) {
            throw new CertificateException('This certificate expired on ' . $notAfter->toDateString() . '.');
        }

        $domains = $this->domains($info);
        if ($domains === []) {
            throw new CertificateException('The certificate is not for any domain name (no Subject Alternative Name or Common Name).');
        }

        return [
            'certificate' => implode("\n", $blocks) . "\n",
            'private_key' => $unprotected,
            'domains' => $domains,
            'issuer' => isset($info['issuer']['O']) ? (string) (is_array($info['issuer']['O']) ? $info['issuer']['O'][0] : $info['issuer']['O']) : ($info['issuer']['CN'] ?? null),
            'not_before' => $notBefore,
            'not_after' => $notAfter,
            'fingerprint' => (string) openssl_x509_fingerprint($leaf, 'sha256'),
        ];
    }

    /**
     * Whether the certificate came without the intermediate certificates of its authority: browsers often find those themselves, but
     * other clients (apps, bots, older systems) do not, and then do not trust the site. A self signed certificate has none to give.
     */
    public function lacksIntermediates(Certificate $certificate): bool
    {
        if (substr_count($certificate->certificate, 'BEGIN CERTIFICATE') > 1) {
            return false;
        }
        $info = @openssl_x509_parse($certificate->certificate);

        return $info !== false && ($info['subject'] ?? null) !== ($info['issuer'] ?? null);
    }

    /**
     * Adds a certificate. The first one becomes the default.
     *
     * @param  array<string, mixed>  $extra  more columns, like where it came from
     *
     * @throws CertificateException
     */
    public function create(string $name, string $certificatePem, string $keyPem, ?string $passphrase = null, array $extra = []): Certificate
    {
        $data = $this->inspect($certificatePem, $keyPem, $passphrase);
        if (Certificate::query()->where('fingerprint', $data['fingerprint'])->exists()) {
            throw new CertificateException('This certificate is added already.');
        }

        $certificate = DB::transaction(fn () => Certificate::query()->create($extra + $data + [
            'name' => $name,
            'enabled' => true,
            'is_default' => !Certificate::query()->where('is_default', true)->exists(),
        ]));

        Activity::event('certificate:create')->subject($certificate)->property(['name' => $name, 'domains' => $data['domains']])->log();

        return $certificate;
    }

    /**
     * Puts a new certificate in the place of one (a renewal). It keeps its name, whether it is on and whether it is the default.
     *
     * @throws CertificateException
     */
    public function replace(Certificate $certificate, string $certificatePem, string $keyPem, ?string $passphrase = null): Certificate
    {
        $data = $this->inspect($certificatePem, $keyPem, $passphrase);
        if (Certificate::query()->where('fingerprint', $data['fingerprint'])->where('id', '!=', $certificate->id)->exists()) {
            throw new CertificateException('This certificate is added already.');
        }

        $certificate->forceFill($data)->save();
        Activity::event('certificate:replace')->subject($certificate)->property(['name' => $certificate->name, 'domains' => $data['domains']])->log();

        return $certificate;
    }

    /** Changes the name, switches on or off, and makes it the default. A default is always one that is on. */
    public function update(Certificate $certificate, string $name, bool $enabled, bool $default): Certificate
    {
        DB::transaction(function () use ($certificate, $name, $enabled, $default) {
            $certificate->forceFill(['name' => $name, 'enabled' => $enabled])->save();

            if ($default && $enabled) {
                Certificate::query()->where('id', '!=', $certificate->id)->update(['is_default' => false]);
                $certificate->forceFill(['is_default' => true])->save();
            } elseif ($certificate->is_default && (!$default || !$enabled)) {
                $certificate->forceFill(['is_default' => false])->save();
            }
            $this->ensureDefault();
        });

        Activity::event('certificate:update')->subject($certificate)->property(['name' => $name, 'enabled' => $enabled])->log();

        return $certificate->refresh();
    }

    public function delete(Certificate $certificate): void
    {
        $name = $certificate->name;
        DB::transaction(function () use ($certificate) {
            $certificate->delete();
            $this->ensureDefault();
        });

        Activity::event('certificate:delete')->property(['name' => $name])->log();
    }

    /** There is a default as long as there is a certificate that is on: the one that lasts longest. */
    private function ensureDefault(): void
    {
        if (Certificate::query()->where('is_default', true)->where('enabled', true)->exists()) {
            return;
        }

        Certificate::query()->where('is_default', true)->update(['is_default' => false]);
        $next = Certificate::query()->where('enabled', true)->orderByDesc('not_after')->first();
        $next?->forceFill(['is_default' => true])->save();
    }

    // ---- what panel-edge gets ---------------------------------------------------------------------------------------------

    public function tokenConfigured(): bool
    {
        return (string) config('certificates.token') !== '';
    }

    /**
     * The certificates that are on, with their keys, for panel-edge. Expired ones are included: a visitor is better told by their
     * browser that a certificate expired than that nothing could be set up.
     *
     * @return array{etag: string, certificates: list<array<string, mixed>>, sites: list<array{domain: string, target: string, status: string|null}>}
     */
    public function forEdge(): array
    {
        $list = Certificate::query()->where('enabled', true)->orderBy('id')->get()->map(fn (Certificate $c) => [
            'name' => $c->name,
            'domains' => $c->domains,
            'certificate' => $c->certificate,
            'key' => $c->private_key,
            'default' => $c->is_default,
            'fingerprint' => $c->fingerprint,
        ])->all();

        $sites = $this->sites();

        return [
            'etag' => '"' . substr(hash('sha256', json_encode([array_map(fn ($c) => [$c['fingerprint'], $c['default'], $c['domains']], $list), $sites])), 0, 32) . '"',
            'certificates' => $list,
            'sites' => $sites,
        ];
    }

    /**
     * The domains of servers that are served over the web (http and https) and where each one leads: panel-edge passes their requests to
     * the allocation. A domain that is not served over the web is left to the panel, as before.
     *
     * @return list<array{domain: string, target: string, status: string|null}>
     */
    public function sites(): array
    {
        return ServerDomain::query()->with(['allocation', 'server.node'])->where('web', true)->orderBy('domain')->get()
            ->filter(fn (ServerDomain $domain) => $domain->allocation !== null && $domain->server !== null)
            ->map(function (ServerDomain $domain) {
                $ip = (string) $domain->allocation->ip;
                $host = $ip === '' || $ip === '0.0.0.0' ? (string) $domain->server->node->fqdn : $ip;
                $server = $domain->server;

                return [
                    'domain' => $domain->domain,
                    'target' => $host . ':' . $domain->allocation->port,
                    'status' => $server->isSuspended() ? 'suspended' : (is_null($server->status) ? null : 'installing'),
                ];
            })->values()->all();
    }

    /** Notes that panel-edge asked, so the admin page can say whether it is connected. */
    public function edgeSeen(string $ip, int $count, array $features = []): void
    {
        Cache::forever(self::EDGE_CACHE, ['at' => now()->getTimestamp(), 'ip' => $ip, 'count' => $count, 'features' => array_values($features)]);
    }

    /** @return array{at: CarbonImmutable, ip: string, count: int, features: list<string>}|null */
    public function lastEdge(): ?array
    {
        $seen = Cache::get(self::EDGE_CACHE);

        return is_array($seen) ? ['at' => CarbonImmutable::createFromTimestamp($seen['at']), 'ip' => (string) $seen['ip'], 'count' => (int) $seen['count'], 'features' => (array) ($seen['features'] ?? [])] : null;
    }

    // ---- reading PEM ------------------------------------------------------------------------------------------------------

    /**
     * @return non-empty-list<string>
     *
     * @throws CertificateException
     */
    private function certificateBlocks(string $pem): array
    {
        preg_match_all('/-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+\/=\s]+?)\s*-----END CERTIFICATE-----/', $pem, $matches);
        if (empty($matches[1])) {
            throw new CertificateException('No certificate was found. It has to be PEM text that starts with -----BEGIN CERTIFICATE-----.');
        }
        if (count($matches[1]) > 10) {
            throw new CertificateException('A chain of more than 10 certificates is not a chain.');
        }

        return array_map(
            fn (string $body) => "-----BEGIN CERTIFICATE-----\n" . chunk_split(preg_replace('/\s+/', '', $body), 64, "\n") . '-----END CERTIFICATE-----',
            $matches[1]
        );
    }

    /** @param  non-empty-list<string>  $blocks */
    private function checkChainOrder(array $blocks): void
    {
        if (count($blocks) < 2) {
            return;
        }

        $issuer = @openssl_pkey_get_public($blocks[1]);
        // 1 means the certificate was signed by that key. Roots and intermediates are accepted in any case after the first.
        if ($issuer === false || @openssl_x509_verify($blocks[0], $issuer) !== 1) {
            throw new CertificateException('The certificate after the first one did not sign it. Put your own certificate first, then the intermediate certificates, in order.');
        }
    }

    /** @throws CertificateException */
    private function readKey(string $pem, ?string $passphrase): \OpenSSLAsymmetricKey
    {
        $pem = trim($pem);
        if (!str_contains($pem, 'PRIVATE KEY-----')) {
            throw new CertificateException('No private key was found. It has to be PEM text that starts with -----BEGIN PRIVATE KEY----- (or RSA PRIVATE KEY, EC PRIVATE KEY).');
        }
        $protected = str_contains($pem, 'ENCRYPTED');
        if ($protected && ($passphrase === null || $passphrase === '')) {
            throw new CertificateException('The private key is protected with a passphrase. Enter the passphrase.');
        }

        $key = @openssl_pkey_get_private($pem, $protected ? (string) $passphrase : '');
        if ($key === false) {
            throw new CertificateException($protected ? 'The private key could not be opened, is the passphrase right?' : 'The private key could not be read.');
        }

        return $key;
    }

    /**
     * @param  array<string, mixed>  $info
     * @return list<string>
     */
    private function domains(array $info): array
    {
        $names = [];
        foreach (explode(',', (string) ($info['extensions']['subjectAltName'] ?? '')) as $entry) {
            $entry = trim($entry);
            if (str_starts_with($entry, 'DNS:')) {
                $names[] = substr($entry, 4);
            }
        }
        if ($names === [] && isset($info['subject']['CN']) && is_string($info['subject']['CN'])) {
            $names[] = $info['subject']['CN'];
        }

        $names = array_map(fn ($name) => strtolower(rtrim(trim($name), '.')), $names);
        $names = array_filter($names, fn ($name) => $name !== '' && preg_match('/^(\*\.)?[a-z0-9_]([a-z0-9_.-]*[a-z0-9_])?$/', $name));

        return array_values(array_unique($names));
    }
}
