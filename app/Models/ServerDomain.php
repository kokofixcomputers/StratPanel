<?php

namespace Pterodactyl\Models;

use Illuminate\Support\Facades\Cache;
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

    /**
     * The address a domain's A record has to point to, which is where the Minecraft router is listening.
     */
    public static function routerTargetIp(): string
    {
        $configured = (string) config('pterodactyl.domains.target_ip');
        if ($configured !== '') {
            return $configured;
        }

        $host = (string) parse_url((string) config('app.url'), PHP_URL_HOST);

        return $host === '' ? '' : (string) gethostbyname($host);
    }

    /**
     * Whether the domain currently has an A record pointing at the router. Results are cached for a short while so
     * refreshing a page does not trigger a flood of DNS lookups.
     */
    public function pointsAtRouter(string $target): bool
    {
        if ($target === '') {
            return false;
        }

        $domain = $this->domain;

        return Cache::remember("domains:dns:$domain:$target", 60, function () use ($domain, $target) {
            $records = @dns_get_record($domain, DNS_A);

            return is_array($records) && collect($records)->contains(fn ($record) => ($record['ip'] ?? null) === $target);
        });
    }
}
