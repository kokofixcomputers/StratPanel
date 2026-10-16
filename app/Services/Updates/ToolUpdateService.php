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
     * @throws \InvalidArgumentException for anything but the two actions
     * @throws \RuntimeException when no updater is installed or one request is still waiting
     */
    public function request(string $action): void
    {
        if (!in_array($action, [self::LOCAL, self::DOWNLOAD, self::DOWNLOAD_NIGHTLY, self::PANEL, self::PANEL_NIGHTLY], true)) {
            throw new \InvalidArgumentException('Unknown update action.');
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
