<?php

namespace Pterodactyl\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Acme\DomainCertificateService;

/**
 * Gets the certificate of a domain from Let's Encrypt, it takes a while (the authority has to visit the domain, or with the dns method the
 * person has to add a TXT record first).
 */
class IssueDomainCertificate implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 1200;

    public function __construct(public int $domainId, public string $method = 'http')
    {
    }

    public function handle(DomainCertificateService $service): void
    {
        $domain = ServerDomain::query()->find($this->domainId);
        if ($domain !== null) {
            $service->issue($domain, $this->method);
        }
    }
}
