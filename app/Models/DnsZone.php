<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A domain of the admin (example.com) that people can take a name under. The panel makes the DNS record for the name at the DNS
 * provider of the domain, with the credentials kept here.
 *
 * @property int $id
 * @property string $name
 * @property string $type
 * @property string $domain
 * @property array $credentials
 * @property bool $enabled
 * @property int $ttl
 */
class DnsZone extends Model
{
    protected $table = 'dns_zones';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /** The keys never leave the server, not even in an array or JSON by accident. */
    protected $hidden = ['credentials'];

    protected function casts(): array
    {
        return [
            'credentials' => 'encrypted:array',
            'enabled' => 'boolean',
        ];
    }

    public function domains(): HasMany
    {
        return $this->hasMany(ServerDomain::class, 'dns_zone_id');
    }
}
