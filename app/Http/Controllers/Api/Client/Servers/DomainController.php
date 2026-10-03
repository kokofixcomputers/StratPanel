<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\ServerDomain;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Domains\GetDomainsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Domains\StoreDomainRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Domains\DeleteDomainRequest;

class DomainController extends ClientApiController
{
    /**
     * Lists the custom domains of a server, together with what the DNS record has to look like.
     */
    public function index(GetDomainsRequest $request, Server $server): array
    {
        $target = $this->targetIp();

        return [
            'object' => 'list',
            'data' => ServerDomain::query()
                ->with('allocation')
                ->where('server_id', $server->id)
                ->orderBy('domain')
                ->get()
                ->map(fn (ServerDomain $domain) => $this->transform($domain, $target))
                ->values()
                ->all(),
            'meta' => [
                'enabled' => (bool) config('pterodactyl.domains.enabled'),
                'target_ip' => $target,
                'max' => (int) config('pterodactyl.domains.max_per_server'),
            ],
        ];
    }

    /**
     * Points a new domain at one of the allocations of the server.
     *
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    public function store(StoreDomainRequest $request, Server $server): JsonResponse
    {
        if (!config('pterodactyl.domains.enabled')) {
            throw new DisplayException('Custom domains are not enabled on this panel.');
        }

        $max = (int) config('pterodactyl.domains.max_per_server');
        if ($max > 0 && ServerDomain::query()->where('server_id', $server->id)->count() >= $max) {
            throw new DisplayException("This server can have at most $max domains.");
        }

        $domain = (string) $request->input('domain');
        $panelHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        if ($panelHost !== '' && $domain === $panelHost) {
            throw new DisplayException('The domain of the panel itself cannot be used for a server.');
        }

        $allocation = $server->allocations()->where('id', (int) $request->input('allocation_id'))->first();
        if (is_null($allocation)) {
            throw new DisplayException('That allocation does not belong to this server.');
        }

        $record = ServerDomain::query()->create([
            'server_id' => $server->id,
            'allocation_id' => $allocation->id,
            'domain' => $domain,
        ]);
        $record->load('allocation');

        Activity::event('server:domain.create')
            ->property(['domain' => $domain, 'allocation' => $allocation->toString()])
            ->log();

        return new JsonResponse(['object' => 'server_domain', 'attributes' => $this->transform($record, $this->targetIp())], 201);
    }

    /**
     * Removes a domain from a server.
     */
    public function delete(DeleteDomainRequest $request, Server $server, int $domain): JsonResponse
    {
        $record = ServerDomain::query()->where('server_id', $server->id)->findOrFail($domain);
        $record->delete();

        Activity::event('server:domain.delete')->property(['domain' => $record->domain])->log();

        return new JsonResponse([], 204);
    }

    /**
     * The address a domain's A record has to point to, which is where the Minecraft router is listening.
     */
    private function targetIp(): string
    {
        $configured = (string) config('pterodactyl.domains.target_ip');
        if ($configured !== '') {
            return $configured;
        }

        $host = (string) parse_url((string) config('app.url'), PHP_URL_HOST);

        return $host === '' ? '' : (string) gethostbyname($host);
    }

    /**
     * @return array<string, mixed>
     */
    private function transform(ServerDomain $domain, string $target): array
    {
        $allocation = $domain->allocation;

        return [
            'id' => $domain->id,
            'domain' => $domain->domain,
            'allocation_id' => $domain->allocation_id,
            'allocation' => $allocation ? ($allocation->ip_alias ?: $allocation->ip) . ':' . $allocation->port : null,
            'dns_ok' => $this->dnsPointsAt($domain->domain, $target),
            'created_at' => $domain->created_at?->toAtomString(),
        ];
    }

    /**
     * Checks whether the domain currently has an A record pointing at the router. Results are cached for a short
     * while so refreshing the page does not trigger a flood of DNS lookups.
     */
    private function dnsPointsAt(string $domain, string $target): bool
    {
        if ($target === '') {
            return false;
        }

        return Cache::remember("domains:dns:$domain:$target", 60, function () use ($domain, $target) {
            $records = @dns_get_record($domain, DNS_A);

            return is_array($records) && collect($records)->contains(fn ($record) => ($record['ip'] ?? null) === $target);
        });
    }
}
