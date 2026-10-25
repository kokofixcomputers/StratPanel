<?php

namespace Pterodactyl\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Queue\SerializesModels;
use Pterodactyl\Models\DnsZone;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Pterodactyl\Services\Acme\ZoneCertificateService;

/** Gets the certificate of a domain of the admin (and its wildcard) from Let's Encrypt, it takes a minute or two. */
class IssueZoneCertificate implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 1200;

    public function __construct(public int $zoneId)
    {
    }

    public function handle(ZoneCertificateService $service): void
    {
        $zone = DnsZone::query()->find($this->zoneId);
        if ($zone !== null) {
            $service->issue($zone);
        }
    }
}
