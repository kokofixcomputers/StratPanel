<?php

namespace Pterodactyl\Services\Dns;

use Pterodactyl\Models\DnsZone;

/**
 * What the panel needs from a DNS provider: to know the credentials work, to see whether a name is taken, to add an A record and
 * to remove it again. A new provider is one class that does this, plus an entry in DnsProviders.
 */
interface DnsProvider
{
    /**
     * Whether the credentials work for the domain of the zone.
     *
     * @return array{ok: bool, message: string, credentials?: array<string, string>} credentials: what to keep instead (found out while checking)
     */
    public function verify(DnsZone $zone): array;

    /**
     * Whether the name already has a record of any kind (so it is not taken over).
     *
     * @throws DnsException
     */
    public function recordExists(DnsZone $zone, string $name): bool;

    /**
     * Adds an A record and returns the id the provider gave it.
     *
     * @throws DnsException
     */
    public function createARecord(DnsZone $zone, string $name, string $ip, int $ttl): string;

    /**
     * Removes a record. A record that is already gone is fine.
     *
     * @throws DnsException
     */
    public function deleteRecord(DnsZone $zone, string $recordId): void;
}
