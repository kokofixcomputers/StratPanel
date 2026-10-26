<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A place outside the node where copies of backups are kept.
 *
 * @property int $id
 * @property string $name
 * @property string $type s3, webdav or folder
 * @property array<string, mixed> $config
 * @property bool $enabled
 * @property bool $auto_copy
 * @property bool $delete_local
 * @property int|null $keep_last
 * @property int|null $keep_days
 * @property int|null $max_gb
 */
class BackupDestination extends Model
{
    public const S3 = 's3';
    public const WEBDAV = 'webdav';
    public const FOLDER = 'folder';

    public const TYPES = [self::S3, self::WEBDAV, self::FOLDER];

    /** The settings that are secrets: kept encrypted, never given back to a page. */
    public const SECRETS = ['secret', 'password'];

    protected $table = 'backup_destinations';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $hidden = ['config'];

    protected function casts(): array
    {
        return [
            'config' => 'encrypted:array',
            'enabled' => 'boolean',
            'auto_copy' => 'boolean',
            'delete_local' => 'boolean',
            'keep_last' => 'integer',
            'keep_days' => 'integer',
            'max_gb' => 'integer',
        ];
    }

    /** @return HasMany<BackupCopy, $this> */
    public function copies(): HasMany
    {
        return $this->hasMany(BackupCopy::class, 'destination_id');
    }
}
