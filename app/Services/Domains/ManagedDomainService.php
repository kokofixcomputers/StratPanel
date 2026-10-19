<?php

namespace Pterodactyl\Services\Domains;

use Pterodactyl\Models\Server;
use Pterodactyl\Models\DnsZone;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Dns\DnsException;
use Pterodactyl\Services\Dns\DnsProviders;
use Pterodactyl\Exceptions\DisplayException;
use Psr\Log\LoggerInterface;

/**
 * Names under the domains of the admin: the person picks "play" and a domain, the panel adds the DNS record at the provider of
 * that domain, and removes it again with the name. From then on it is a domain like any other (the router, https).
 */
class ManagedDomainService
{
    public const LABEL_REGEX = '/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/';

    public function __construct(private LoggerInterface $log)
    {
    }

    /** The name in one form. */
    public function normalize(string $label): string
    {
        return strtolower(trim($label));
    }

    /**
     * Why a name cannot be taken, null when it can. Looks at the panel's own rules and at the DNS provider (a name that already
     * has a record is never taken over).
     */
    public function problem(DnsZone $zone, string $label): ?string
    {
        $label = $this->normalize($label);
        if (!$zone->enabled) {
            return 'That domain is not available.';
        }
        if ($label === '' || !preg_match(self::LABEL_REGEX, $label)) {
            return 'Use letters, numbers and dashes only, not starting or ending with a dash, up to 63 characters.';
        }
        if (in_array($label, array_map('strtolower', (array) config('pterodactyl.domains.reserved_labels', [])), true)) {
            return 'That name is kept for the panel.';
        }
        $full = "$label.{$zone->domain}";
        $panelHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        if ($full === $panelHost || ServerDomain::query()->where('domain', $full)->exists()) {
            return 'That name is already taken.';
        }

        try {
            if (DnsProviders::make($zone)->recordExists($zone, $full)) {
                return 'That name is already taken.';
            }
        } catch (DnsException $e) {
            $this->log->warning("DNS check for $full failed: " . $e->getMessage());

            return 'The DNS provider could not be asked right now, try again in a moment.';
        }

        return null;
    }

    /**
     * Makes the record and the domain.
     *
     * @throws DisplayException
     */
    public function create(Server $server, Allocation $allocation, DnsZone $zone, string $label): ServerDomain
    {
        $label = $this->normalize($label);
        if ($problem = $this->problem($zone, $label)) {
            throw new DisplayException($problem);
        }

        $target = ServerDomain::routerTargetIp();
        if ($target === '') {
            throw new DisplayException('The address of the router is not known, an admin has to set PTERODACTYL_DOMAINS_TARGET_IP.');
        }

        $full = "$label.{$zone->domain}";
        $provider = DnsProviders::make($zone);
        try {
            $recordId = $provider->createARecord($zone, $full, $target, (int) $zone->ttl);
        } catch (DnsException $e) {
            $this->log->warning("Could not make the DNS record for $full: " . $e->getMessage());

            throw new DisplayException('The DNS record could not be made: ' . rtrim($e->getMessage(), '.') . '.');
        }

        try {
            return ServerDomain::query()->create([
                'server_id' => $server->id,
                'allocation_id' => $allocation->id,
                'domain' => $full,
                'web' => true,
                'dns_zone_id' => $zone->id,
                'dns_record_id' => $recordId,
            ]);
        } catch (\Throwable $e) {
            // The name is not kept, so the record must not stay behind either.
            $this->forget($zone, $recordId, $full);

            throw $e;
        }
    }

    /** Removes the name, and the DNS record when the panel made it. */
    public function remove(ServerDomain $domain): void
    {
        if ($domain->dns_zone_id && $domain->dns_record_id && ($zone = $domain->zone)) {
            $this->forget($zone, $domain->dns_record_id, $domain->domain);
        }
        $domain->delete();
    }

    /** Takes a record away, and only says so in the log when that fails: the name goes either way. */
    public function forget(DnsZone $zone, string $recordId, string $name): void
    {
        try {
            DnsProviders::make($zone)->deleteRecord($zone, $recordId);
        } catch (DnsException $e) {
            $this->log->warning("The DNS record of $name ($recordId) could not be removed and is still at the provider: " . $e->getMessage());
        }
    }
}
