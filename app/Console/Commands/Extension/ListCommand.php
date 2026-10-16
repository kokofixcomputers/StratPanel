<?php

namespace Pterodactyl\Console\Commands\Extension;

use Illuminate\Console\Command;
use Pterodactyl\Extensions\ExtensionManager;

class ListCommand extends Command
{
    protected $signature = 'p:extension:list';

    protected $description = 'List the installed extensions.';

    public function handle(ExtensionManager $manager): int
    {
        $records = $manager->records(true);
        if ($records->isEmpty()) {
            $this->line('No extensions are installed.');

            return self::SUCCESS;
        }

        $this->table(
            ['Id', 'Name', 'Version', 'State', 'Last error'],
            $records->map(fn ($record) => [
                $record->ext_id,
                $record->name,
                $record->version,
                $record->enabled ? ($record->last_error ? 'on, with an error' : 'on') : 'off',
                $record->last_error ? mb_substr($record->last_error, 0, 70) : '',
            ])->all()
        );

        return self::SUCCESS;
    }
}
