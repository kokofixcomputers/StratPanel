<?php

namespace Pterodactyl\Console\Commands\Router;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class InstallRouterCommand extends Command
{
    protected $signature = 'p:router:install';

    protected $description = 'Installs the Minecraft router that makes custom domains work, run it with sudo.';

    public function handle(): int
    {
        // The router is a system service that listens on port 25565, so installing it needs root.
        if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
            $this->error('This installs a system service. Run it as root: sudo php artisan p:router:install');

            return self::FAILURE;
        }

        $script = base_path('tools/mc-router/install.sh');
        if (!is_file($script)) {
            $this->error('Could not find tools/mc-router/install.sh, make sure the panel files are complete.');

            return self::FAILURE;
        }

        // Keep the files the panel writes owned by the user the web server runs as.
        $owner = function_exists('posix_getpwuid') ? (posix_getpwuid((int) fileowner(storage_path())) ?: []) : [];

        $process = new Process(
            ['bash', $script],
            base_path(),
            ['PANEL_DIR' => base_path(), 'WEB_USER' => $owner['name'] ?? 'www-data']
        );
        $process->setTimeout(300);
        $process->run(function ($type, $buffer) {
            $this->output->write($buffer);
        });

        return $process->isSuccessful() ? self::SUCCESS : self::FAILURE;
    }
}
