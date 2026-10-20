<?php

namespace Pterodactyl\Services\Servers;

use Pterodactyl\Models\Server;

/**
 * Turns a server into a small document another panel can read to make the same server (see the import on the new server page).
 * It holds the settings, the egg it runs, the variables and the schedules. The files stay on the node: the document tells where
 * they can be pulled from (the SFTP address of this server) with the importer in the Jobs tab.
 */
class ServerExportService
{
    public const FORMAT = 'stratosphere-server';
    public const VERSION = 1;

    public function handle(Server $server): array
    {
        $server->loadMissing(['egg', 'user', 'node', 'schedules.tasks']);
        $egg = $server->egg;

        return [
            'format' => self::FORMAT,
            'version' => self::VERSION,
            'exported_at' => now()->toIso8601String(),
            'server' => [
                'name' => $server->name,
                'description' => $server->description,
                'owner_email' => $server->user?->email,
                'image' => $server->image,
                'startup' => $server->startup,
                'skip_scripts' => (bool) $server->skip_scripts,
                'oom_disabled' => (bool) $server->oom_disabled,
                'limits' => [
                    'memory' => $server->memory,
                    'swap' => $server->swap,
                    'disk' => $server->disk,
                    'io' => $server->io,
                    'cpu' => $server->cpu,
                    'threads' => $server->threads,
                ],
                'feature_limits' => [
                    'databases' => $server->database_limit,
                    'allocations' => $server->allocation_limit,
                    'backups' => $server->backup_limit,
                ],
            ],
            'egg' => [
                'uuid' => $egg?->uuid,
                'name' => $egg?->name,
                'author' => $egg?->author,
            ],
            'environment' => $server->variables->mapWithKeys(
                fn ($variable) => [$variable->env_variable => $variable->server_value ?? $variable->default_value]
            )->all(),
            'schedules' => $server->schedules->map(fn ($schedule) => [
                'name' => $schedule->name,
                'cron' => [
                    'minute' => $schedule->cron_minute,
                    'hour' => $schedule->cron_hour,
                    'day_of_month' => $schedule->cron_day_of_month,
                    'month' => $schedule->cron_month,
                    'day_of_week' => $schedule->cron_day_of_week,
                ],
                'is_active' => (bool) $schedule->is_active,
                'only_when_online' => (bool) $schedule->only_when_online,
                'tasks' => $schedule->tasks->sortBy('sequence_id')->values()->map(fn ($task) => [
                    'action' => $task->action,
                    'payload' => $task->payload,
                    'time_offset' => $task->time_offset,
                    'continue_on_failure' => (bool) $task->continue_on_failure,
                ])->all(),
            ])->values()->all(),
            'files' => [
                'sftp_host' => $server->node->fqdn,
                'sftp_port' => $server->node->daemonSFTP,
                'sftp_username' => $server->user ? $server->user->username . '.' . $server->uuidShort : null,
            ],
        ];
    }
}
