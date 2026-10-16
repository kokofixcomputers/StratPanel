<?php

namespace Pterodactyl\Console\Commands\Node;

use Illuminate\Console\Command;
use Pterodactyl\Services\Nodes\NodeCertificateService;

class SyncCertificatesCommand extends Command
{
    protected $signature = 'p:node:sync-certificates';

    protected $description = 'Give the nodes the certificates that were renewed, replaced or newly chosen for them (https nodes only).';

    public function handle(NodeCertificateService $certificates): int
    {
        $result = $certificates->syncAll();

        if ($this->getOutput()->isVerbose() || $result['pushed'] + $result['failed'] > 0) {
            $this->line(sprintf('Gave %d node(s) a new certificate, %d could not be reached.', $result['pushed'], $result['failed']));
        }

        return self::SUCCESS;
    }
}
