<?php

namespace Pterodactyl\Services\Updates;

use Illuminate\Support\Facades\File;

/**
 * Asks the updater on the panel machine (tools/updater) to put the newest router and edge in place, or to update the panel. The panel never runs anything
 * itself: it writes one word into a file, a root service watching that file does the work and writes down how it went.
 */
class ToolUpdateService
{
    public const LOCAL = 'local';

    public const DOWNLOAD = 'download';

    public const DOWNLOAD_NIGHTLY = 'download-nightly';

    /** The panel itself (the steps of tools/update-panel.sh), then the router and edge. */
    public const PANEL = 'panel';

    public const PANEL_NIGHTLY = 'panel-nightly';

    /** Writes down the backups of the panel files, nothing else (the page cannot read the folder, it is root's). */
    public const BACKUPS = 'backups';

    /** Puts one of the backups back ("restore:NAME") or deletes it ("delete-backup:NAME"). */
    public const RESTORE = 'restore';

    public const DELETE_BACKUP = 'delete-backup';

    /** The names the updater makes; the same pattern is checked there. */
    public const BACKUP_NAME = '/^panel-backup-\d{4}-\d{2}-\d{2}-\d{4}(-[a-z]+)?\.tar\.gz$/D';

    /** Whether tools/updater/install.sh was run on this machine. */
    public function installed(): bool
    {
        return File::exists(dirname(config('updates.request_file')) . '/installed');
    }

    /** Whether a request is waiting for the updater. */
    public function pending(): bool
    {
        return File::exists(config('updates.request_file'));
    }

    /** What the updater did the last time, null if it never ran. */
    public function status(): ?array
    {
        $file = config('updates.status_file');
        if (!File::exists($file)) {
            return null;
        }
        $status = json_decode((string) File::get($file), true);

        return is_array($status) ? $status : null;
    }

    /**
     * The backups the updater made of the panel files, newest first: name, size in bytes and the time it was made.
     * Null when the updater never wrote the list.
     */
    public function backups(): ?array
    {
        $file = dirname(config('updates.status_file')) . '/backups.json';
        if (!File::exists($file)) {
            return null;
        }
        $list = json_decode((string) File::get($file), true);
        if (!is_array($list)) {
            return null;
        }

        return array_values(array_filter(array_map(fn ($item) => is_array($item) && is_string($item['name'] ?? null) && preg_match(self::BACKUP_NAME, $item['name']) ? [
            'name' => $item['name'],
            'size' => (int) ($item['size'] ?? 0),
            'created' => (int) ($item['created'] ?? 0),
        ] : null, $list)));
    }

    /**
     * @throws \InvalidArgumentException for anything but the known actions, or a backup name the updater did not make
     * @throws \RuntimeException when no updater is installed or one request is still waiting
     */
    public function request(string $action, ?string $backup = null): void
    {
        if (!in_array($action, [self::LOCAL, self::DOWNLOAD, self::DOWNLOAD_NIGHTLY, self::PANEL, self::PANEL_NIGHTLY, self::BACKUPS, self::RESTORE, self::DELETE_BACKUP], true)) {
            throw new \InvalidArgumentException('Unknown update action.');
        }
        if (in_array($action, [self::RESTORE, self::DELETE_BACKUP], true)) {
            if (!is_string($backup) || !preg_match(self::BACKUP_NAME, $backup)) {
                throw new \InvalidArgumentException('That is not the name of a backup.');
            }
            $action .= ':' . $backup;
        }
        if (!$this->installed()) {
            throw new \RuntimeException('The updater is not installed on this machine.');
        }
        if ($this->pending()) {
            throw new \RuntimeException('An update is already waiting to start.');
        }

        File::put(config('updates.request_file'), $action);
    }
}
