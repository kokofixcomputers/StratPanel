<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Auto sleep of a server: it is stopped when nobody has been online for a while, and started again when a player tries to join.
 * Off for every server until its owner turns it on.
 *
 * @property int $id
 * @property int $server_id
 * @property bool $enabled
 * @property int $idle_minutes
 * @property bool $wake_on_join
 * @property \Carbon\CarbonImmutable|null $idle_since
 * @property \Carbon\CarbonImmutable|null $slept_at
 * @property \Pterodactyl\Models\Server $server
 */
class ServerAutoSleep extends Model
{
    /** The times a server can be left idle before it sleeps, in minutes. */
    public const IDLE_CHOICES = [5, 10, 15, 30, 60, 120, 240];

    public const DEFAULT_IDLE_MINUTES = 15;

    protected $table = 'server_auto_sleep';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $attributes = [
        'enabled' => false,
        'idle_minutes' => self::DEFAULT_IDLE_MINUTES,
        'wake_on_join' => true,
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'wake_on_join' => 'boolean',
            'idle_minutes' => 'integer',
            'idle_since' => 'datetime',
            'slept_at' => 'datetime',
        ];
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\Pterodactyl\Models\Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
