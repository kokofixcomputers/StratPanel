<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The copy of a backup in a destination.
 *
 * @property int $id
 * @property int $backup_id
 * @property int $destination_id
 * @property string $status pending, uploading, stored or failed
 * @property int $bytes
 * @property string|null $error
 * @property \Carbon\CarbonImmutable|null $stored_at
 * @property Backup $backup
 * @property BackupDestination $destination
 */
class BackupCopy extends Model
{
    public const PENDING = 'pending';
    public const UPLOADING = 'uploading';
    public const STORED = 'stored';
    public const FAILED = 'failed';

    protected $table = 'backup_copies';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['bytes' => 'integer', 'stored_at' => 'datetime'];
    }

    /** @return BelongsTo<Backup, $this> */
    public function backup(): BelongsTo
    {
        return $this->belongsTo(Backup::class)->withTrashed();
    }

    /** @return BelongsTo<BackupDestination, $this> */
    public function destination(): BelongsTo
    {
        return $this->belongsTo(BackupDestination::class, 'destination_id');
    }

    /** Where the file is in a destination: a folder for each server, a file for each backup. */
    public function path(): string
    {
        return $this->backup->server->uuid . '/' . $this->backup->uuid . '.tar.gz';
    }
}
