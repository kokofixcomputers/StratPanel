<?php

namespace Pterodactyl\Services\Backups\External;

use GuzzleHttp\Client;
use Illuminate\Support\Str;
use Psr\Http\Message\StreamInterface;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Models\BackupDestination;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Jobs\CopyBackupToDestination;
use Pterodactyl\Services\Backups\DownloadLinkService;
use Pterodactyl\Repositories\Wings\DaemonBackupRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * Copies of backups outside the node (see BackupDestination). The backup is made on the node as always; when it is complete the panel
 * reads it from the node and writes it to every destination that is on, the way a download does. What is kept there is decided by the
 * retention of the destination (BackupRetentionService). A backup can also have no file on the node any more, then the copies are
 * all there is, and downloading or restoring reads from one of them.
 */
class BackupCopyService
{
    public function __construct(
        private Stores $stores,
        private DownloadLinkService $links,
        private DaemonBackupRepository $daemon,
        private BackupRetentionService $retention,
    ) {
    }

    /** A new, complete backup is copied to the destinations that take every backup. */
    public function queueNew(Backup $backup): void
    {
        BackupDestination::query()->where('enabled', true)->where('auto_copy', true)->get()
            ->each(fn (BackupDestination $destination) => $this->queue($backup, $destination));
    }

    /** Starts (or starts again) the copy of a backup in a destination, in the background. */
    public function queue(Backup $backup, BackupDestination $destination): BackupCopy
    {
        $copy = BackupCopy::query()->updateOrCreate(
            ['backup_id' => $backup->id, 'destination_id' => $destination->id],
            ['status' => BackupCopy::PENDING, 'error' => null]
        );
        CopyBackupToDestination::dispatch($copy->id);

        return $copy;
    }

    /** Copies the backups that have no copy in this destination yet (the ones from before it was added). */
    public function backfill(BackupDestination $destination): int
    {
        $queued = 0;
        Backup::query()->where('is_successful', true)->whereNotNull('completed_at')
            ->whereDoesntHave('copies', fn ($q) => $q->where('destination_id', $destination->id)->whereIn('status', [BackupCopy::STORED, BackupCopy::PENDING, BackupCopy::UPLOADING]))
            ->orderBy('id')->each(function (Backup $backup) use ($destination, &$queued) {
                $this->queue($backup, $destination);
                ++$queued;
            });

        return $queued;
    }

    /** Does the copy: reads the backup from where it is and writes it to the destination. Failing is written down on the copy, not thrown. */
    public function copy(BackupCopy $copy): void
    {
        $copy->loadMissing('backup.server', 'destination');
        $backup = $copy->backup;
        $destination = $copy->destination;
        if (!$destination->enabled || !$backup->is_successful || $backup->trashed()) {
            return;
        }

        $copy->forceFill(['status' => BackupCopy::UPLOADING, 'error' => null])->save();
        try {
            $this->stores->for($destination)->put($copy->path(), $this->source($backup, $copy), $backup->bytes ?: null);
        } catch (\Throwable $exception) {
            Log::warning('Copying backup ' . $backup->uuid . ' to ' . $destination->name . ' failed: ' . $exception->getMessage());
            $copy->forceFill(['status' => BackupCopy::FAILED, 'error' => Str::limit($exception->getMessage(), 500)])->save();

            return;
        }

        $copy->forceFill(['status' => BackupCopy::STORED, 'bytes' => $backup->bytes, 'stored_at' => now(), 'error' => null])->save();

        // What the destination keeps is kept to its limits, and the node may let go of its file.
        $this->retention->prune($destination, $backup->server);
        if ($destination->delete_local) {
            $this->removeFromNode($backup->fresh() ?? $backup);
        }
    }

    /** Where the file is read from: the node, or when it is not there any more a copy that is stored. */
    public function source(Backup $backup, ?BackupCopy $not = null): StreamInterface
    {
        if (!$backup->local_removed) {
            $url = $this->links->handle($backup, $backup->server->user);
            $response = (new Client(['verify' => app()->environment('production'), 'timeout' => 0, 'connect_timeout' => 20, 'http_errors' => false]))
                ->get($url, ['stream' => true]);
            if ($response->getStatusCode() !== 200) {
                throw new DisplayException('The node answered ' . $response->getStatusCode() . ' when the backup was read from it.');
            }

            return $response->getBody();
        }

        $other = $backup->copies()->where('status', BackupCopy::STORED)->when($not, fn ($q) => $q->where('id', '!=', $not->id))->with('destination')->first();
        if (!$other) {
            throw new DisplayException('The backup is not on the node any more and there is no other copy to read it from.');
        }

        return $this->stores->for($other->destination)->read($other->path());
    }

    /** The node lets go of the file, the copies are all there is. Only for a backup made on the node itself. */
    public function removeFromNode(Backup $backup): void
    {
        if ($backup->local_removed || $backup->disk !== Backup::ADAPTER_WINGS || !$backup->is_successful) {
            return;
        }
        try {
            $this->daemon->setServer($backup->server)->delete($backup);
        } catch (DaemonConnectionException $exception) {
            // A node that does not have it any more (404) is what is wanted anyway; for another error the file stays and the next copy tries again.
            if ($exception->getPrevious()?->getCode() !== 404) {
                Log::warning('Could not remove backup ' . $backup->uuid . ' from the node: ' . $exception->getMessage());

                return;
            }
        }
        $backup->forceFill(['local_removed' => true])->save();
    }

    /** A link that downloads the copy: from S3 itself, otherwise through the panel. */
    public function downloadUrl(BackupCopy $copy): string
    {
        $copy->loadMissing('destination', 'backup.server');

        return $this->stores->for($copy->destination)->temporaryUrl($copy->path(), 15)
            ?? URL::temporarySignedRoute('backups.copy.download', now()->addMinutes(15), ['copy' => $copy->id]);
    }

    public function stream(BackupCopy $copy): StreamInterface
    {
        $copy->loadMissing('destination', 'backup.server');

        return $this->stores->for($copy->destination)->read($copy->path());
    }

    /** Removes the file of a copy from its destination and forgets the copy. A destination that can not be reached keeps the row, it is tried again. */
    public function forget(BackupCopy $copy, bool $force = false): bool
    {
        $copy->loadMissing('destination', 'backup.server');
        try {
            $this->stores->for($copy->destination)->delete($copy->path());
        } catch (\Throwable $exception) {
            Log::warning('Could not delete the copy of backup ' . $copy->backup->uuid . ' from ' . $copy->destination->name . ': ' . $exception->getMessage());
            if (!$force) {
                return false;
            }
        }
        $copy->delete();

        return true;
    }
}
