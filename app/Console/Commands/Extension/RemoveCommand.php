<?php

namespace Pterodactyl\Console\Commands\Extension;

use Illuminate\Console\Command;
use Pterodactyl\Extensions\ExtensionInstaller;

class RemoveCommand extends Command
{
    protected $signature = 'p:extension:remove
                            {id : The id of the extension}
                            {--purge : Also delete what the extension stored (its settings stay in the database otherwise, for a reinstall)}
                            {--yes : Do not ask for confirmation}';

    protected $description = 'Remove an extension and its files.';

    public function handle(ExtensionInstaller $installer): int
    {
        if (!$this->option('yes') && !$this->confirm('Remove "' . $this->argument('id') . '"?')) {
            return self::SUCCESS;
        }

        try {
            $installer->remove($this->argument('id'), (bool) $this->option('purge'));
        } catch (\RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info('Removed.');

        return self::SUCCESS;
    }
}
