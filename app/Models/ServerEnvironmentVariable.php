<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An environment variable that a user added to their own server, on top of the ones defined by the egg.
 *
 * @property int $id
 * @property int $server_id
 * @property string $key
 * @property string $value
 * @property \Carbon\CarbonImmutable|null $created_at
 * @property \Carbon\CarbonImmutable|null $updated_at
 * @property \Pterodactyl\Models\Server $server
 */
class ServerEnvironmentVariable extends Model
{
    public const MAX_PER_SERVER = 50;

    /**
     * Names the panel or the daemon set themselves. Letting a user override them would break the server or the
     * container, so they cannot be used.
     */
    public const RESERVED = ['STARTUP', 'TZ', 'HOME', 'PATH', 'USER', 'HOSTNAME', 'PWD', 'LD_PRELOAD', 'LD_LIBRARY_PATH'];

    protected $table = 'server_environment_variables';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /**
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<\Pterodactyl\Models\Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * Whether a name is used by the panel, the daemon or the egg of the server.
     *
     * @param string[] $taken names that are already in use for the server, such as the variables of its egg
     */
    public static function isReserved(string $key, array $taken = []): bool
    {
        $key = strtoupper($key);

        return in_array($key, self::RESERVED, true)
            || str_starts_with($key, 'P_')
            || str_starts_with($key, 'SERVER_')
            || in_array($key, array_map('strtoupper', $taken), true);
    }
}
