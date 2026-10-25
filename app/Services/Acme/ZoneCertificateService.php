<?php

namespace Pterodactyl\Services\Acme;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\DnsZone;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Jobs\IssueZoneCertificate;
use Pterodactyl\Services\Dns\DnsProviders;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Nodes\NodeCertificateService;
use Pterodactyl\Services\Certificates\CertificateService;

/**
 * A certificate from Let's Encrypt for a domain of the admin (example.com) and everything under it (*.example.com). The panel has the
 * credentials of the DNS provider of the domain, so it adds the TXT record that proves the domain itself, waits until it can be seen and
 * removes it again. Nobody has to do anything, and it renews itself like the others.
 */
class ZoneCertificateService
{
    public const METHOD = 'zone';

    public function __construct(
        private AcmeIssuer $issuer,
        private CertificateService $certificates,
        private NodeCertificateService $nodes,
        private DnsTxtChecker $dns,
    ) {
    }

    /** The certificate that was got for this domain, if any. */
    public function certificateOf(DnsZone $zone): ?Certificate
    {
        return Certificate::query()->where('source', 'letsencrypt')->where('acme_method', self::METHOD)->where('acme_domain', $zone->domain)->first();
    }

    /** @return array{status: string|null, message: string|null, certificate: Certificate|null, can_request: bool} */
    public function state(DnsZone $zone): array
    {
        $kept = Cache::get($this->key($zone), []);
        $certificate = $this->certificateOf($zone);
        $pending = ($kept['status'] ?? null) === 'pending';

        return [
            'status' => $pending ? 'pending' : (($kept['status'] ?? null) === 'failed' ? 'failed' : ($certificate !== null ? 'issued' : null)),
            'message' => $kept['message'] ?? null,
            'certificate' => $certificate,
            'can_request' => (bool) config('acme.enabled') && !$pending,
        ];
    }

    /**
     * Starts getting (or renewing) the certificate of a domain, in the background.
     *
     * @throws DisplayException
     */
    public function request(DnsZone $zone): void
    {
        if (!config('acme.enabled')) {
            throw new DisplayException('Let\'s Encrypt is not turned on on this panel (Settings > Certificates).');
        }
        if (($this->state($zone)['status'] ?? null) === 'pending') {
            throw new DisplayException('A certificate is being got for this domain already.');
        }
        if (empty($zone->credentials)) {
            throw new DisplayException('The access to the DNS provider of this domain is not set up.');
        }

        Cache::put($this->key($zone), ['status' => 'pending', 'message' => null], 3600);
        IssueZoneCertificate::dispatch($zone->id);
    }

    /** What the job does. A failure is kept with its reason, it is for the admin to read. */
    public function issue(DnsZone $zone): void
    {
        Cache::put($this->key($zone), ['status' => 'pending', 'message' => null], 3600);
        $records = [];

        try {
            $names = [$zone->domain, '*.' . $zone->domain];
            $provider = DnsProviders::make($zone);

            $got = $this->issuer->obtainDnsNames($names, function (string $name, string $value) use ($zone, $provider, &$records) {
                $records[] = $provider->createTxtRecord($zone, $name, $value, 60);
                $this->waitFor($name, $value);
            });

            $existing = $this->certificateOf($zone);
            if ($existing !== null) {
                $certificate = $this->certificates->replace($existing, $got['chain'], $got['key']);
                $certificate->forceFill(['renew_error' => null, 'renewed_at' => now()])->save();
            } else {
                $this->certificates->create(
                    $zone->domain . ' and *.' . $zone->domain . ' (Let\'s Encrypt)',
                    $got['chain'],
                    $got['key'],
                    null,
                    ['source' => 'letsencrypt', 'acme_domain' => $zone->domain, 'acme_method' => self::METHOD]
                );
            }

            Cache::forget($this->key($zone));
            $this->syncNodes();
        } catch (\Throwable $exception) {
            Log::warning('Let\'s Encrypt: no certificate for the domain ' . $zone->domain . ': ' . $exception->getMessage());
            Cache::put($this->key($zone), ['status' => 'failed', 'message' => mb_substr($exception->getMessage(), 0, 500)], 86400);
            $this->certificateOf($zone)?->forceFill(['renew_error' => mb_substr($exception->getMessage(), 0, 500)])->save();
        } finally {
            // The records were only there for the proof.
            foreach ($records as $id) {
                try {
                    DnsProviders::make($zone)->deleteRecord($zone, $id);
                } catch (\Throwable $exception) {
                    Log::warning('Let\'s Encrypt: could not remove the TXT record ' . $id . ' of ' . $zone->domain . ': ' . $exception->getMessage());
                }
            }
        }
    }

    /**
     * Gets new certificates for the ones of domains that end soon.
     *
     * @return array{renewed: int, failed: int}
     */
    public function renewDue(): array
    {
        $renewed = $failed = 0;
        if (!config('acme.enabled')) {
            return ['renewed' => 0, 'failed' => 0];
        }

        Certificate::query()->where('source', 'letsencrypt')->where('acme_method', self::METHOD)->where('enabled', true)
            ->where('not_after', '<', now()->addDays((int) config('acme.renew_days', 30)))
            ->each(function (Certificate $certificate) use (&$renewed, &$failed) {
                $zone = DnsZone::query()->where('domain', $certificate->acme_domain)->first();
                if ($zone === null || !$zone->enabled) {
                    return;
                }

                $this->issue($zone);
                $this->state($zone)['status'] === 'failed' ? ++$failed : ++$renewed;
            });

        return ['renewed' => $renewed, 'failed' => $failed];
    }

    private function waitFor(string $name, string $value): void
    {
        $poll = max(0, (int) config('acme.dns_poll_seconds', 10));
        $tries = max(1, (int) ceil((int) config('acme.dns_wait_seconds', 900) / max(1, $poll)));
        for ($i = 0; $i < $tries; ++$i) {
            if ($this->dns->has($name, $value)) {
                $settle = (int) config('acme.dns_settle_seconds', 5);
                if ($settle > 0) {
                    sleep($settle);
                }

                return;
            }
            if ($poll > 0) {
                sleep($poll);
            }
        }

        throw new \RuntimeException('The TXT record ' . $name . ' did not show up in time. Is the zone of this domain the one at the provider?');
    }

    private function key(DnsZone $zone): string
    {
        return 'acme:zone:' . $zone->id;
    }

    private function syncNodes(): void
    {
        try {
            $this->nodes->syncAll();
        } catch (\Throwable) {
            // The hourly run tries again.
        }
    }
}
