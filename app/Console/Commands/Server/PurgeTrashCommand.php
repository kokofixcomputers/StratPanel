<?php

namespace Pterodactyl\Console\Commands\Server;

use Illuminate\Console\Command;
use Pterodactyl\Services\Trash\TrashService;

class PurgeTrashCommand extends Command
{
    protected $signature = 'p:trash:purge';

    protected $description = 'Delete for good what has been in the trash bin of a server for longer than it is kept.';

    public function handle(TrashService $trash): int
    {
        $result = $trash->purgeExpired();

        if ($this->getOutput()->isVerbose() || $result['deleted'] + $result['failed'] > 0) {
            $this->line(sprintf('Deleted %d expired item(s) from trash bins, %d could not be deleted yet.', $result['deleted'], $result['failed']));
        }

        return self::SUCCESS;
    }
}
