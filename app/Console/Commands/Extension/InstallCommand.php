<?php

namespace Pterodactyl\Console\Commands\Extension;

use Illuminate\Console\Command;
use Pterodactyl\Extensions\ExtensionInstaller;
use Pterodactyl\Extensions\InvalidManifestException;

class InstallCommand extends Command
{
    protected $signature = 'p:extension:install
                            {file : The .stratext file to install}
                            {--enable : Switch the extension on right away (a new one is off until you do)}
                            {--force : Replace the extension when it is installed already, its settings and data are kept}
                            {--yes : Do not ask for confirmation}';

    protected $description = 'Install an extension from a .stratext file.';

    public function handle(ExtensionInstaller $installer): int
    {
        try {
            $manifest = $installer->inspect($this->argument('file'));
        } catch (InvalidManifestException|\RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->line('');
        $this->line('  <info>' . $manifest->name() . '</info> ' . $manifest->version() . ' (' . $manifest->id() . ')');
        if ($manifest->description() !== '') {
            $this->line('  ' . $manifest->description());
        }
        if ($manifest->author() !== '') {
            $this->line('  by ' . $manifest->author());
        }
        $this->line('');
        $this->warn('An extension is PHP and JavaScript that runs as part of the panel, with the same access to everything in it. Only install');
        $this->warn('extensions from people you trust.');

        if (!$this->option('yes') && !$this->confirm('Install ' . $manifest->name() . '?')) {
            $this->line('Nothing was installed.');

            return self::SUCCESS;
        }

        try {
            $record = $installer->install($this->argument('file'), (bool) $this->option('enable'), (bool) $this->option('force'));
        } catch (InvalidManifestException|\RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info($record->name . ' ' . $record->version . ' is installed' . ($record->enabled ? ' and on.' : '.'));
        if (!$record->enabled) {
            $this->line('Switch it on under Admin > Extensions, or with: php artisan p:extension:enable ' . $record->ext_id);
        }

        return self::SUCCESS;
    }
}
