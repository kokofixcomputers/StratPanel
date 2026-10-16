<?php

namespace Pterodactyl\Console\Commands\Extension;

use Illuminate\Console\Command;
use Pterodactyl\Models\InstalledExtension;

/** Shared by p:extension:enable and p:extension:disable. */
abstract class ToggleCommand extends Command
{
    abstract protected function target(): bool;

    public function handle(): int
    {
        $record = InstalledExtension::query()->where('ext_id', $this->argument('id'))->first();
        if ($record === null) {
            $this->error('"' . $this->argument('id') . '" is not installed. See: php artisan p:extension:list');

            return self::FAILURE;
        }

        $record->forceFill(['enabled' => $this->target()] + ($this->target() ? ['last_error' => null, 'last_error_at' => null] : []))->save();
        $this->info($record->name . ' is ' . ($this->target() ? 'on.' : 'off.'));

        return self::SUCCESS;
    }
}
