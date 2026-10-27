<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A port of a server that is open to the internet through a tunnel.
 *
 * @property int $id
 * @property int $server_id
 * @property int $allocation_id
 * @property string $status pending, waiting, active or failed
 * @property string|null $address
 * @property string|null $error
 * @property Server $server
 * @property Allocation $allocation
 */
class Tunnel extends Model
{
    public const PENDING = 'pending';
    public const ACTIVE = 'active';
    public const FAILED = 'failed';
    // The server is not running: the tunnel opens when it starts.
    public const WAITING = 'waiting';

    protected $table = 'tunnels';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /** @return BelongsTo<Server, $this> */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /** @return BelongsTo<Allocation, $this> */
    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class);
    }
}
