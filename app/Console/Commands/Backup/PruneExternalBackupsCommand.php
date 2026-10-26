<?php

namespace Pterodactyl\Console\Commands\Backup;

use Illuminate\Console\Command;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Services\Backups\External\BackupRetentionService;

/** Applies what each destination keeps (copies of backups outside the node) and gives up on copies that were left half done. */
class PruneExternalBackupsCommand extends Command
{
    protected $signature = 'p:backup:prune-external';

    protected $description = 'Delete copies of backups that go over the retention of their destination.';

    public function handle(BackupRetentionService $retention): int
    {
        // A copy that has been "uploading" for longer than any upload takes was cut off (the worker stopped).
        $stuck = BackupCopy::query()->whereIn('status', [BackupCopy::PENDING, BackupCopy::UPLOADING])->where('updated_at', '<', now()->subHours(6))
            ->update(['status' => BackupCopy::FAILED, 'error' => 'It did not finish, the queue worker may have stopped. Copy it again.']);
        $deleted = $retention->pruneAll();

        $this->info("Deleted $deleted copies, gave up on $stuck that did not finish.");

        return self::SUCCESS;
    }
}
