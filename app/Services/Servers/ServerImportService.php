<?php

namespace Pterodactyl\Services\Servers;

use Illuminate\Support\Arr;
use Pterodactyl\Models\Task;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Schedule;

/**
 * The part of an import the new server form cannot do by itself: the schedules of the exported server.
 */
class ServerImportService
{
    private const ACTIONS = [Task::ACTION_POWER, Task::ACTION_COMMAND, Task::ACTION_BACKUP];

    /**
     * Reads the document the form sends along (it comes from a file the admin chose, so nothing in it is trusted) and makes the
     * schedules on the server. Returns how many were made.
     */
    public function restoreSchedules(Server $server, ?string $json): int
    {
        $document = is_string($json) && $json !== '' ? json_decode($json, true) : null;
        if (!is_array($document) || Arr::get($document, 'format') !== ServerExportService::FORMAT) {
            return 0;
        }

        $made = 0;
        foreach (array_slice((array) Arr::get($document, 'schedules', []), 0, 50) as $entry) {
            if (!is_array($entry) || !is_string($name = Arr::get($entry, 'name')) || $name === '') {
                continue;
            }

            $cron = (array) Arr::get($entry, 'cron', []);
            $schedule = new Schedule([
                'server_id' => $server->id,
                'name' => mb_substr($name, 0, 191),
                'cron_minute' => $this->field($cron, 'minute'),
                'cron_hour' => $this->field($cron, 'hour'),
                'cron_day_of_month' => $this->field($cron, 'day_of_month'),
                'cron_month' => $this->field($cron, 'month'),
                'cron_day_of_week' => $this->field($cron, 'day_of_week'),
                'is_active' => (bool) Arr::get($entry, 'is_active', true),
                'only_when_online' => (bool) Arr::get($entry, 'only_when_online', false),
            ]);

            try {
                $schedule->next_run_at = $schedule->getNextRunDate();
            } catch (\Throwable) {
                continue; // not a cron expression
            }
            $schedule->save();

            $sequence = 1;
            foreach (array_slice((array) Arr::get($entry, 'tasks', []), 0, 50) as $task) {
                $action = is_array($task) ? Arr::get($task, 'action') : null;
                if (!in_array($action, self::ACTIONS, true)) {
                    continue;
                }

                Task::query()->create([
                    'schedule_id' => $schedule->id,
                    'sequence_id' => $sequence++,
                    'action' => $action,
                    'payload' => (string) Arr::get($task, 'payload', ''),
                    'time_offset' => max(0, min(900, (int) Arr::get($task, 'time_offset', 0))),
                    'continue_on_failure' => (bool) Arr::get($task, 'continue_on_failure', false),
                ]);
            }

            ++$made;
        }

        return $made;
    }

    private function field(array $cron, string $key): string
    {
        $value = Arr::get($cron, $key);

        return is_string($value) && preg_match('/^[0-9*,\/\-a-zA-Z?#LW]{1,64}$/', $value) ? $value : '*';
    }
}
