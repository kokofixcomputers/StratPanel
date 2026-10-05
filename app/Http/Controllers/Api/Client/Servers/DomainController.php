<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\ServerDomain;
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
        $target = ServerDomain::routerTargetIp();

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

        return new JsonResponse(['object' => 'server_domain', 'attributes' => $this->transform($record, ServerDomain::routerTargetIp())], 201);
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
            'dns_ok' => $domain->pointsAtRouter($target),
            'created_at' => $domain->created_at?->toAtomString(),
        ];
    }
}
