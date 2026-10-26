<?php

namespace Pterodactyl\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Services\Backups\External\BackupCopyService;

/** Writes a complete backup to a destination outside the node, a large one takes a while. */
class CopyBackupToDestination implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 14400;

    public function __construct(public int $copyId)
    {
    }

    public function handle(BackupCopyService $service): void
    {
        $copy = BackupCopy::query()->find($this->copyId);
        if ($copy !== null) {
            $service->copy($copy);
        }
    }
}
