<?php

namespace Pterodactyl\Console\Commands\Node;

use Illuminate\Console\Command;
use Pterodactyl\Services\Acme\DomainCertificateService;

class RenewCertificatesCommand extends Command
{
    protected $signature = 'p:certificates:renew';

    protected $description = 'Renew the Let\'s Encrypt certificates of domains that end soon.';

    public function handle(DomainCertificateService $domains): int
    {
        $result = $domains->renewDue();

        if ($this->getOutput()->isVerbose() || $result['renewed'] + $result['failed'] > 0) {
            $this->line(sprintf('Renewed %d certificate(s), %d could not be renewed.', $result['renewed'], $result['failed']));
        }

        return self::SUCCESS;
    }
}
