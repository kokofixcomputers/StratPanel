<?php

namespace Pterodactyl\Console\Commands\Server;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Services\Servers\AutoSleep\AutoSleepService;

class AutoSleepCommand extends Command
{
    protected $signature = 'p:server:auto-sleep';

    protected $description = 'Stop the servers that have auto sleep on and that nobody has been on for as long as their owner chose.';

    public function handle(AutoSleepService $service): int
    {
        $counts = [];

        ServerAutoSleep::query()
            ->where('enabled', true)
            ->with(['server.node', 'server.allocation', 'server.transfer'])
            ->chunkById(50, function ($rows) use ($service, &$counts) {
                foreach ($rows as $row) {
                    if (is_null($row->server)) {
                        continue;
                    }

                    try {
                        $result = $service->check($row->server);
                    } catch (\Throwable $exception) {
                        // One server that cannot be looked at must not keep the others from being looked at.
                        Log::warning('Auto sleep: could not check server ' . $row->server->uuid . ': ' . $exception->getMessage());
                        $result = AutoSleepService::UNKNOWN;
                    }
                    $counts[$result] = ($counts[$result] ?? 0) + 1;
                }
            });

        if ($this->getOutput()->isVerbose()) {
            foreach ($counts as $result => $count) {
                $this->line("$result: $count");
            }
        }

        return self::SUCCESS;
    }
}
