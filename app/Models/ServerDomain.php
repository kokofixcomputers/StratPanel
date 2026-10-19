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
 * @property int|null $dns_zone_id
 * @property string|null $dns_record_id
 * @property \Carbon\CarbonImmutable|null $created_at
 * @property \Carbon\CarbonImmutable|null $updated_at
 * @property \Pterodactyl\Models\Server $server
 * @property \Pterodactyl\Models\Allocation $allocation
 */
class ServerDomain extends Model
{
    protected $table = 'server_domains';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['web' => 'boolean'];
    }

    /** The domain of the admin this name is under, null for a domain somebody brought along. */
    public function zone(): BelongsTo
    {
        return $this->belongsTo(DnsZone::class, 'dns_zone_id');
    }

    /** The certificate this domain is served over https with (made by Let's Encrypt, or an uploaded one that covers it). */
    public function certificate(): BelongsTo
    {
        return $this->belongsTo(Certificate::class);
    }

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
     * The addresses the domain leads to right now, as this machine sees them: its A and AAAA records, and whatever a CNAME in
     * between leads to. Kept for a short while so refreshing a page does not trigger a flood of DNS lookups.
     *
     * @return list<string>
     */
    public function resolvedAddresses(): array
    {
        $domain = $this->domain;

        return Cache::remember("domains:dns:resolved:$domain", 20, function () use ($domain) {
            $found = [];
            foreach ((array) @dns_get_record($domain, DNS_A | DNS_AAAA) as $record) {
                $found[] = $record['ip'] ?? $record['ipv6'] ?? null;
            }
            // The system resolver as well: it follows a CNAME, and it is what the router itself will use.
            foreach ((array) @gethostbynamel($domain) as $ip) {
                $found[] = $ip;
            }

            return array_values(array_unique(array_filter($found)));
        });
    }

    /**
     * Every address that is "the router": the one that was set (or found), and the addresses of the panel's own host name. The panel
     * can sit behind a name that has several addresses, and the address it found for itself is not always the one in the record.
     *
     * @return list<string>
     */
    public static function routerAddresses(string $target): array
    {
        $host = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        $addresses = [$target];
        if ($host !== '' && !filter_var($host, FILTER_VALIDATE_IP)) {
            foreach ((array) @gethostbynamel($host) as $ip) {
                $addresses[] = $ip;
            }
        } elseif ($host !== '') {
            $addresses[] = $host;
        }

        return array_values(array_unique(array_filter($addresses)));
    }

    /**
     * Whether the domain leads to the router (or the machine the panel is on) right now.
     */
    public function pointsAtRouter(string $target): bool
    {
        if ($target === '') {
            return false;
        }

        return count(array_intersect($this->resolvedAddresses(), self::routerAddresses($target))) > 0;
    }
}
