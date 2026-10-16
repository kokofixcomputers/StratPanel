<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Something that was deleted from a server and can be recovered until it expires.
 *
 * @property int $id
 * @property string $uuid
 * @property int $server_id
 * @property string $type file, directory or schedule
 * @property string $name
 * @property string|null $path
 * @property int|null $size
 * @property int|null $schedule_id
 * @property int|null $deleted_by
 * @property \Carbon\CarbonImmutable $expires_at
 * @property \Carbon\CarbonImmutable|null $created_at
 * @property Server $server
 * @property User|null $deleter
 */
class ServerTrashItem extends Model
{
    public const FILE = 'file';

    public const DIRECTORY = 'directory';

    public const SCHEDULE = 'schedule';

    protected $table = 'server_trash';

    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'created_at' => 'datetime', 'size' => 'integer'];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function deleter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function isFile(): bool
    {
        return $this->type === self::FILE || $this->type === self::DIRECTORY;
    }
}
