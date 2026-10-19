<?php

namespace Pterodactyl\Services\Dns;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\DnsZone;
use Illuminate\Http\Client\ConnectionException;

/**
 * Cloudflare. The credentials are an API token that may edit DNS of the zone ("Zone > DNS > Edit"), and the zone id, which is found
 * by the name of the domain when it is left empty. The records are never proxied: Minecraft is not web traffic.
 */
class CloudflareProvider implements DnsProvider
{
    private const BASE = 'https://api.cloudflare.com/client/v4';

    public function verify(DnsZone $zone): array
    {
        $token = (string) ($zone->credentials['api_token'] ?? '');
        if ($token === '') {
            return ['ok' => false, 'message' => 'there is no API token.'];
        }

        try {
            $response = $this->http($token)->get(self::BASE . '/zones', ['name' => $zone->domain, 'per_page' => 5]);
            $found = $this->result($response)[0] ?? null;
        } catch (DnsException $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }
        if (!$found) {
            return ['ok' => false, 'message' => "the token cannot see the domain {$zone->domain}. Is it in this Cloudflare account, and may the token read zones?"];
        }
        $id = (string) ($zone->credentials['zone_id'] ?? '');
        if ($id !== '' && $id !== $found['id']) {
            return ['ok' => false, 'message' => 'the zone id belongs to another domain than ' . $zone->domain . '.'];
        }

        // The records themselves: the token has to be allowed to look at them, which is what editing needs too.
        try {
            $this->result($this->http($token)->get(self::BASE . "/zones/{$found['id']}/dns_records", ['per_page' => 1]));
        } catch (DnsException $e) {
            return ['ok' => false, 'message' => 'the token cannot read the DNS records of the domain (' . $e->getMessage() . '). Give it "Zone > DNS > Edit".'];
        }

        return [
            'ok' => true,
            'message' => "the token works for {$zone->domain}.",
            'credentials' => ['api_token' => $token, 'zone_id' => $found['id']],
        ];
    }

    public function recordExists(DnsZone $zone, string $name): bool
    {
        $response = $this->http($this->token($zone))->get(self::BASE . "/zones/{$this->zoneId($zone)}/dns_records", ['name' => $name, 'per_page' => 1]);

        return count($this->result($response)) > 0;
    }

    public function createARecord(DnsZone $zone, string $name, string $ip, int $ttl): string
    {
        $response = $this->http($this->token($zone))->post(self::BASE . "/zones/{$this->zoneId($zone)}/dns_records", [
            'type' => str_contains($ip, ':') ? 'AAAA' : 'A',
            'name' => $name,
            'content' => $ip,
            'ttl' => max(60, $ttl),
            'proxied' => false,
            'comment' => 'Made by the panel for a server',
        ]);
        $record = $this->result($response);

        return (string) ($record['id'] ?? throw new DnsException('Cloudflare did not say which record it made.'));
    }

    public function deleteRecord(DnsZone $zone, string $recordId): void
    {
        $response = $this->http($this->token($zone))->delete(self::BASE . "/zones/{$this->zoneId($zone)}/dns_records/{$recordId}");
        if ($response->status() === 404) {
            return;
        }
        $this->result($response);
    }

    private function token(DnsZone $zone): string
    {
        return (string) ($zone->credentials['api_token'] ?? '');
    }

    private function zoneId(DnsZone $zone): string
    {
        $id = (string) ($zone->credentials['zone_id'] ?? '');
        if ($id === '' || !preg_match('/^[a-f0-9]{32}$/i', $id)) {
            throw new DnsException('The Cloudflare zone of ' . $zone->domain . ' is not set up: check the zone in the admin settings.');
        }

        return $id;
    }

    private function http(string $token): \Illuminate\Http\Client\PendingRequest
    {
        return Http::withToken($token)->acceptJson()->timeout(15)->retry(1, 300, fn ($e) => $e instanceof ConnectionException, false);
    }

    /**
     * The "result" of an answer, or the reason Cloudflare gave.
     *
     * @return array<mixed>
     *
     * @throws DnsException
     */
    private function result(Response $response): array
    {
        $json = $response->json();
        if ($response->successful() && is_array($json) && ($json['success'] ?? false)) {
            return is_array($json['result'] ?? null) ? $json['result'] : [];
        }

        $reason = is_array($json) ? ($json['errors'][0]['message'] ?? null) : null;
        $reason ??= 'Cloudflare answered with ' . $response->status();
        if ($response->status() === 401 || $response->status() === 403) {
            $reason = 'Cloudflare does not accept the token (' . $reason . ')';
        }

        throw new DnsException($reason . '.');
    }
}
