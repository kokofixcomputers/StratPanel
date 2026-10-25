<?php

namespace Pterodactyl\Services\Acme;

use Pterodactyl\Jobs\IssueDomainCertificate;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Models\ServerDomain;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Nodes\NodeCertificateService;
use Pterodactyl\Services\Certificates\CertificateService;
use Pterodactyl\Services\Certificates\CertificateException;

/**
 * Free https for the domains of servers: a button that gets a certificate from Let's Encrypt, with no setup by hand, and the renewal
 * of it before it ends. A domain that an uploaded certificate (a wildcard, say) covers already does not need one.
 */
class DomainCertificateService
{
    public function __construct(
        private AcmeIssuer $issuer,
        private CertificateService $certificates,
        private NodeCertificateService $nodes,
        private DnsTxtChecker $dns,
    ) {
    }

    public function enabled(): bool
    {
        return (bool) config('acme.enabled');
    }

    /** Whether the edge answers on port 80 (it asked for its certificates lately and said it does): without it nothing can be proven. */
    public function httpReady(): bool
    {
        $edge = $this->certificates->lastEdge();

        return $edge !== null && in_array('http', $edge['features'], true) && $edge['at']->gt(now()->subMinutes(10));
    }

    /** The certificate that is on and not expired and covers a domain, uploaded or from Let's Encrypt. */
    public function covering(string $domain): ?Certificate
    {
        return Certificate::query()->where('enabled', true)->where('not_after', '>', now())->orderByDesc('not_after')->get()
            ->first(fn (Certificate $certificate) => NodeCertificateService::covers($certificate, $domain));
    }

    /**
     * What to show of a domain, and whether the button can be pressed.
     *
     * @return array{web: bool, status: string, message: string|null, covered_by: string|null, expires_at: string|null, source: string|null, can_request: bool, reason: string|null, can_request_dns: bool, renew_by_dns: bool, dns: array{name: string, value: string}|null}
     */
    public function describe(ServerDomain $domain): array
    {
        $certificate = $domain->certificate ?? $this->covering($domain->domain);
        $reason = null;
        if (!$this->enabled()) {
            $reason = 'Let\'s Encrypt is not turned on on this panel.';
        } elseif (!$this->httpReady()) {
            $reason = 'The panel is not set up to answer on port 80 (the edge with HTTP_LISTEN), which Let\'s Encrypt needs.';
        }

        $expiring = $certificate !== null && $certificate->acme_method === 'dns' && $certificate->not_after?->lt(now()->addDays((int) config('acme.renew_days', 30)));
        $pendingDns = $domain->certificate_status === 'pending' && $domain->dns_name !== null;

        return [
            'web' => $domain->web,
            'status' => $certificate !== null && $certificate->not_after?->isFuture() ? 'issued' : $domain->certificate_status,
            'message' => $domain->certificate_message,
            'covered_by' => $certificate?->name,
            'expires_at' => $certificate?->not_after?->toAtomString(),
            'source' => $certificate?->source,
            'can_request' => $reason === null && $domain->certificate_status !== 'pending' && ($certificate === null || $certificate->not_after?->isPast()),
            'reason' => $reason,
            // The dns way: for domains Let's Encrypt can not visit. The person adds a TXT record, and has to again to renew.
            'can_request_dns' => $this->enabled() && $domain->certificate_status !== 'pending' && ($certificate === null || $certificate->not_after?->isPast() || $expiring),
            'renew_by_dns' => $expiring,
            'dns' => $pendingDns ? ['name' => $domain->dns_name, 'value' => $domain->dns_value] : null,
        ];
    }

    /**
     * Starts getting a certificate for a domain. A domain one is already covering is just linked to it. Anything that can not work is
     * refused here, in words, before Let's Encrypt is asked: it limits how often and how many, and a mistake costs some of that.
     *
     * @throws DisplayException
     */
    public function request(ServerDomain $domain): void
    {
        if (!$this->enabled()) {
            throw new DisplayException('Let\'s Encrypt is not turned on on this panel.');
        }
        if (!$this->httpReady()) {
            throw new DisplayException('This needs the edge to answer on port 80. Ask the admin to set it up (HTTP_LISTEN in /etc/stratosphere-net.env).');
        }
        if ($domain->certificate_status === 'pending') {
            throw new DisplayException('A certificate is being requested for this domain already.');
        }
        if (str_contains($domain->domain, '*') || filter_var($domain->domain, FILTER_VALIDATE_IP)) {
            throw new DisplayException('A certificate from Let\'s Encrypt this way is for a domain name, not a wildcard or an IP address.');
        }

        $covering = $this->covering($domain->domain);
        if ($covering !== null) {
            $domain->forceFill(['web' => true, 'certificate_id' => $covering->id, 'certificate_status' => 'issued', 'certificate_message' => null])->save();

            return;
        }
        if (!$domain->pointsAtRouter(ServerDomain::routerTargetIp())) {
            throw new DisplayException('The domain does not point at this panel yet (its A record has to be ' . ServerDomain::routerTargetIp() . '). Let\'s Encrypt would not be able to check it.');
        }

        $domain->forceFill(['web' => true, 'certificate_status' => 'pending', 'certificate_message' => null])->save();
        IssueDomainCertificate::dispatch($domain->id);
    }

    /**
     * Starts getting a certificate with the dns challenge: nothing has to reach this panel, the person proves the domain is theirs with a TXT
     * record (shown on the domain while the job waits for it). Works for domains on a private address and for any DNS provider.
     *
     * @throws DisplayException
     */
    public function requestDns(ServerDomain $domain): void
    {
        if (!$this->enabled()) {
            throw new DisplayException('Let\'s Encrypt is not turned on on this panel.');
        }
        if ($domain->certificate_status === 'pending') {
            throw new DisplayException('A certificate is being requested for this domain already.');
        }
        if (str_contains($domain->domain, '*') || filter_var($domain->domain, FILTER_VALIDATE_IP)) {
            throw new DisplayException('A certificate from Let\'s Encrypt this way is for a domain name, not a wildcard or an IP address.');
        }

        $covering = $this->covering($domain->domain);
        $renewing = $covering !== null && $covering->acme_method === 'dns'
            && $covering->not_after?->lt(now()->addDays((int) config('acme.renew_days', 30)));
        if ($covering !== null && !$renewing) {
            $domain->forceFill(['web' => true, 'certificate_id' => $covering->id, 'certificate_status' => 'issued', 'certificate_message' => null])->save();

            return;
        }

        $domain->forceFill(['web' => true, 'certificate_status' => 'pending', 'certificate_message' => null, 'dns_name' => null, 'dns_value' => null])->save();
        IssueDomainCertificate::dispatch($domain->id, 'dns');
    }

    /**
     * Gets a new certificate for one that came from Let's Encrypt, now and not when it is due (an admin asked). It is done for the domain
     * the certificate was made for, the same way as the first time.
     *
     * @throws DisplayException
     */
    public function renewNow(Certificate $certificate): ?ServerDomain
    {
        if ($certificate->source !== 'letsencrypt' || $certificate->acme_domain === null) {
            throw new DisplayException('Only a certificate that came from Let\'s Encrypt can be renewed here.');
        }
        if (!$this->enabled()) {
            throw new DisplayException('Let\'s Encrypt is not turned on on this panel.');
        }
        if ($certificate->acme_method === ZoneCertificateService::METHOD) {
            $zone = \Pterodactyl\Models\DnsZone::query()->where('domain', $certificate->acme_domain)->first()
                ?? throw new DisplayException('The domain ' . $certificate->acme_domain . ' is not one of the domains of the settings any more.');
            app(ZoneCertificateService::class)->request($zone);

            return null;
        }

        $domain = ServerDomain::query()->where('domain', $certificate->acme_domain)->first();
        if ($domain === null) {
            throw new DisplayException('No server uses ' . $certificate->acme_domain . ' any more, so there is nothing to renew it for.');
        }
        if ($domain->certificate_status === 'pending') {
            throw new DisplayException('A certificate is being requested for this domain already.');
        }

        $method = $certificate->acme_method === 'dns' ? 'dns' : 'http';
        if ($method === 'http' && !$this->httpReady()) {
            throw new DisplayException('This needs the edge to answer on port 80 (HTTP_LISTEN in /etc/stratosphere-net.env).');
        }

        $domain->forceFill(['web' => true, 'certificate_status' => 'pending', 'certificate_message' => null, 'dns_name' => null, 'dns_value' => null])->save();
        IssueDomainCertificate::dispatch($domain->id, $method);

        return $domain;
    }

    /** What the job does: asks Let's Encrypt, adds what it gives as a certificate, and links it to the domain. */
    public function issue(ServerDomain $domain, string $method = 'http'): void
    {
        try {
            $got = $method === 'dns'
                ? $this->issuer->obtainDns($domain->domain, fn (string $name, string $value) => $this->presentDns($domain, $name, $value))
                : $this->issuer->obtain($domain->domain);

            // A certificate that ended, or that is renewed by hand, is replaced instead of added next to the old one.
            $existing = Certificate::query()->where('source', 'letsencrypt')->where('acme_domain', $domain->domain)->first();
            if ($existing !== null) {
                $certificate = $this->certificates->replace($existing, $got['chain'], $got['key']);
                $certificate->forceFill(['acme_method' => $method, 'renew_error' => null, 'renewed_at' => now()])->save();
            } else {
                $certificate = $this->certificates->create(
                    $domain->domain . ' (Let\'s Encrypt)',
                    $got['chain'],
                    $got['key'],
                    null,
                    ['source' => 'letsencrypt', 'acme_domain' => $domain->domain, 'acme_method' => $method]
                );
            }

            $domain->forceFill(['certificate_id' => $certificate->id, 'certificate_status' => 'issued', 'certificate_message' => null, 'dns_name' => null, 'dns_value' => null])->save();
            $this->syncNodes();
        } catch (\Throwable $exception) {
            Log::warning('Let\'s Encrypt: no certificate for ' . $domain->domain . ': ' . $exception->getMessage());
            $domain->forceFill(['certificate_status' => 'failed', 'certificate_message' => mb_substr($exception->getMessage(), 0, 500), 'dns_name' => null, 'dns_value' => null])->save();
        }
    }

    /** Shows the person the TXT record to add and waits until it can be seen on the internet. */
    private function presentDns(ServerDomain $domain, string $name, string $value): void
    {
        $domain->forceFill(['dns_name' => $name, 'dns_value' => $value])->save();

        $poll = max(0, (int) config('acme.dns_poll_seconds', 10));
        $tries = max(1, (int) ceil((int) config('acme.dns_wait_seconds', 900) / max(1, $poll)));
        for ($i = 0; $i < $tries; ++$i) {
            if ($this->dns->has($name, $value)) {
                // Let's Encrypt asks the authoritative servers, give the ones that are behind a moment.
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

        throw new \RuntimeException('The TXT record ' . $name . ' did not show up within ' . (int) ceil($tries * max(1, $poll) / 60) . ' minutes. Add it and try again.');
    }

    /**
     * Gets new certificates for those of Let's Encrypt that end soon. A domain that is not served any more is left to end.
     *
     * @return array{renewed: int, failed: int}
     */
    public function renewDue(): array
    {
        $renewed = $failed = 0;

        Certificate::query()->where('source', 'letsencrypt')->where('enabled', true)
            ->where(fn ($q) => $q->whereNull('acme_method')->orWhereNotIn('acme_method', ['dns', ZoneCertificateService::METHOD]))
            ->where('not_after', '<', now()->addDays((int) config('acme.renew_days', 30)))
            ->each(function (Certificate $certificate) use (&$renewed, &$failed) {
                if (!$this->enabled() || !ServerDomain::query()->where('domain', $certificate->acme_domain)->where('web', true)->exists()) {
                    return;
                }

                try {
                    $got = $this->issuer->obtain((string) $certificate->acme_domain);
                    $this->certificates->replace($certificate, $got['chain'], $got['key']);
                    $certificate->forceFill(['renew_error' => null, 'renewed_at' => now()])->save();
                    ++$renewed;
                } catch (\Throwable $exception) {
                    ++$failed;
                    $certificate->forceFill(['renew_error' => mb_substr($exception->getMessage(), 0, 500)])->save();
                    Log::warning('Let\'s Encrypt: could not renew ' . $certificate->acme_domain . ': ' . $exception->getMessage());
                }
            });

        if ($renewed > 0) {
            $this->syncNodes();
        }

        // The certificates of the domains of the admin renew themselves too, through the DNS provider.
        $zones = app(ZoneCertificateService::class)->renewDue();

        return ['renewed' => $renewed + $zones['renewed'], 'failed' => $failed + $zones['failed']];
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
