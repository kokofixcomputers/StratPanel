<?php

namespace Pterodactyl\Console\Commands\Store;

use Illuminate\Console\Command;
use Pterodactyl\Services\Store\StoreService;

class ExpireCommand extends Command
{
    protected $signature = 'p:store:expire';

    protected $description = 'Suspend the boxes and servers that were bought and whose time has run out.';

    public function handle(StoreService $store): int
    {
        $count = $store->expireDue();
        if ($count > 0) {
            $this->line(sprintf('Suspended %d box(es) and server(s) that ran out.', $count));
        }

        return self::SUCCESS;
    }
}
