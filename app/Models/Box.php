<?php

namespace Pterodactyl\Models;

use Illuminate\Support\Str;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A box: memory, disk, CPU, ports, backups and databases that belong to a person, and that the servers they make inside of it share. A box
 * is made by an admin, or bought in the store, and does not need the store to exist.
 *
 * @property int $id
 * @property string $uuid
 * @property int $user_id
 * @property string $name
 * @property int|null $node_id
 * @property int $memory
 * @property int $disk
 * @property int $cpu
 * @property int $allocations
 * @property int $backups
 * @property int $databases
 * @property string $status
 * @property string $source
 * @property \Illuminate\Support\Carbon|null $expires_at
 * @property string|null $notes
 * @property User $user
 * @property Node|null $node
 * @property \Illuminate\Database\Eloquent\Collection<int, Server> $servers
 */
class Box extends Model
{
    public const ACTIVE = 'active';
    public const SUSPENDED = 'suspended';
    public const EXPIRED = 'expired';

    protected $table = 'boxes';

    protected $guarded = ['id', 'uuid'];

    protected $casts = [
        'user_id' => 'integer',
        'node_id' => 'integer',
        'memory' => 'integer',
        'disk' => 'integer',
        'cpu' => 'integer',
        'allocations' => 'integer',
        'backups' => 'integer',
        'databases' => 'integer',
        'expires_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Box $box) {
            $box->uuid ??= (string) Str::uuid();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class);
    }

    public function servers(): HasMany
    {
        return $this->hasMany(Server::class, 'box_id');
    }

    /** Whether the servers of this box may run: it was not suspended and it is paid for. */
    public function isUsable(): bool
    {
        return $this->status === self::ACTIVE;
    }
}
