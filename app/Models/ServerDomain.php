<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A custom domain that is routed to one of the allocations of a server by the Minecraft router.
 *
 * @property int $id
 * @property int $server_id
 * @property int $allocation_id
 * @property string $domain
 * @property \Carbon\CarbonImmutable|null $created_at
 * @property \Carbon\CarbonImmutable|null $updated_at
 * @property \Pterodactyl\Models\Server $server
 * @property \Pterodactyl\Models\Allocation $allocation
 */
class ServerDomain extends Model
{
    protected $table = 'server_domains';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /**
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\Pterodactyl\Models\Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\Pterodactyl\Models\Allocation, $this>
     */
    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class);
    }
}
