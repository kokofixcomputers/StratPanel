<?php

namespace Pterodactyl\Services\Backups\External;

use Pterodactyl\Models\Server;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Models\BackupDestination;
use Illuminate\Support\Facades\Log;

/**
 * How much a destination keeps: for each server the newest N copies, none older than N days, and no more than N GB together. Whatever
 * goes over a limit is deleted, the oldest first. A locked backup is never deleted, and counts toward the limits like any other.
 * A backup that has no file on the node and no copy left is gone, so it is removed from the panel too.
 */
class BackupRetentionService
{
    public function __construct(private Stores $stores)
    {
    }

    /** Applies the limits of one destination, for one server or for all. @return int how many copies were deleted */
    public function prune(BackupDestination $destination, ?Server $server = null): int
    {
        if (!$destination->keep_last && !$destination->keep_days && !$destination->max_gb) {
            return 0;
        }

        $query = BackupCopy::query()->where('destination_id', $destination->id)->where('status', BackupCopy::STORED)
            ->with('backup.server')->whereHas('backup');
        if ($server) {
            $query->whereHas('backup', fn ($q) => $q->where('server_id', $server->id));
        }

        $deleted = 0;
        $query->get()->groupBy(fn (BackupCopy $copy) => $copy->backup->server_id)->each(function ($copies) use ($destination, &$deleted) {
            $newest = $copies->sortByDesc(fn (BackupCopy $copy) => $copy->backup->completed_at?->getTimestamp() ?? $copy->backup->created_at->getTimestamp())->values();
            $total = 0;
            foreach ($newest as $index => $copy) {
                $total += $copy->bytes;
                $age = $copy->backup->completed_at ?? $copy->backup->created_at;
                $over = ($destination->keep_last && $index >= $destination->keep_last)
                    || ($destination->keep_days && $age->lt(now()->subDays($destination->keep_days)))
                    || ($destination->max_gb && $total > $destination->max_gb * 1024 ** 3);
                if (!$over || $copy->backup->is_locked) {
                    continue;
                }
                if ($this->remove($copy)) {
                    ++$deleted;
                }
            }
        });

        return $deleted;
    }

    public function pruneAll(): int
    {
        $deleted = 0;
        foreach (BackupDestination::query()->get() as $destination) {
            try {
                $deleted += $this->prune($destination);
            } catch (\Throwable $exception) {
                Log::warning('Pruning the backups of ' . $destination->name . ' failed: ' . $exception->getMessage());
            }
        }

        return $deleted;
    }

    private function remove(BackupCopy $copy): bool
    {
        $backup = $copy->backup;
        try {
            $this->stores->for($copy->destination)->delete($copy->path());
        } catch (\Throwable $exception) {
            Log::warning('Could not delete the copy of backup ' . $backup->uuid . ': ' . $exception->getMessage());

            return false;
        }
        $copy->delete();

        // Nothing is left of the backup when its file is not on the node and no copy has it.
        if ($backup->local_removed && !$backup->copies()->exists()) {
            $backup->delete();
        }

        return true;
    }
}
