<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\DnsZone;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Domains\ManagedDomainService;
use Pterodactyl\Services\Acme\DomainCertificateService;
use Pterodactyl\Http\Requests\Api\Client\Servers\Domains\UpdateDomainRequest;
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
                ->with(['allocation', 'zone'])
                ->where('server_id', $server->id)
                ->orderBy('domain')
                ->get()
                ->map(fn (ServerDomain $domain) => $this->transform($domain, $target))
                ->values()
                ->all(),
            'meta' => [
                // Whether people may bring their own domain, and the domains of the admin they may take a name under.
                'enabled' => (bool) config('pterodactyl.domains.enabled'),
                'zones' => DnsZone::query()->where('enabled', true)->orderBy('domain')->get(['id', 'domain'])->map(fn (DnsZone $z) => ['id' => $z->id, 'domain' => $z->domain])->all(),
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
    public function store(StoreDomainRequest $request, Server $server, ManagedDomainService $managed): JsonResponse
    {
        $max = (int) config('pterodactyl.domains.max_per_server');
        if ($max > 0 && ServerDomain::query()->where('server_id', $server->id)->count() >= $max) {
            throw new DisplayException("This server can have at most $max domains.");
        }

        $allocation = $server->allocations()->where('id', (int) $request->input('allocation_id'))->first();
        if (is_null($allocation)) {
            throw new DisplayException('That allocation does not belong to this server.');
        }

        if ($request->filled('zone_id')) {
            $zone = DnsZone::query()->where('enabled', true)->findOrFail((int) $request->input('zone_id'));
            $record = $managed->create($server, $allocation, $zone, (string) $request->input('label'));
            $domain = $record->domain;
        } else {
            if (!config('pterodactyl.domains.enabled')) {
                throw new DisplayException('Bringing your own domain is not enabled on this panel.');
            }

            $domain = (string) $request->input('domain');
            $panelHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
            if ($panelHost !== '' && $domain === $panelHost) {
                throw new DisplayException('The domain of the panel itself cannot be used for a server.');
            }

            $record = ServerDomain::query()->create([
                'server_id' => $server->id,
                'allocation_id' => $allocation->id,
                'domain' => $domain,
                'web' => true,
            ]);
        }
        $record->load('allocation');

        Activity::event('server:domain.create')
            ->property(['domain' => $domain, 'allocation' => $allocation->toString(), 'managed' => $record->dns_zone_id !== null])
            ->log();

        return new JsonResponse(['object' => 'server_domain', 'attributes' => $this->transform($record, ServerDomain::routerTargetIp())], 201);
    }

    /**
     * Whether a name under a domain of the admin can still be taken, for the box while it is typed.
     */
    public function check(GetDomainsRequest $request, Server $server, ManagedDomainService $managed): array
    {
        $zone = DnsZone::query()->where('enabled', true)->find((int) $request->query('zone_id'));
        $label = $managed->normalize((string) $request->query('label'));
        if (!$zone || $label === '') {
            return ['object' => 'domain_check', 'attributes' => ['available' => false, 'reason' => null]];
        }
        $reason = $managed->problem($zone, $label);

        return ['object' => 'domain_check', 'attributes' => ['available' => $reason === null, 'domain' => "$label.{$zone->domain}", 'reason' => $reason]];
    }

    /**
     * Gets a free certificate from Let's Encrypt for the domain. It takes a moment, the state is in the domain's "https" attributes.
     *
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    public function certificate(UpdateDomainRequest $request, Server $server, int $domain, DomainCertificateService $service): JsonResponse
    {
        $record = ServerDomain::query()->with('allocation')->where('server_id', $server->id)->findOrFail($domain);
        // The dns way is for domains Let's Encrypt can not reach; the person adds a TXT record while the job waits.
        $request->input('method') === 'dns' ? $service->requestDns($record) : $service->request($record);

        Activity::event('server:domain.certificate')->property(['domain' => $record->domain])->log();

        return new JsonResponse(['object' => 'server_domain', 'attributes' => $this->transform($record->refresh(), ServerDomain::routerTargetIp())], 202);
    }

    /**
     * Removes a domain from a server.
     */
    public function delete(DeleteDomainRequest $request, Server $server, int $domain, ManagedDomainService $managed): JsonResponse
    {
        $record = ServerDomain::query()->with('zone')->where('server_id', $server->id)->findOrFail($domain);
        // A name under a domain of the admin takes its DNS record with it.
        $managed->remove($record);

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
            // The domain of the admin it is under (the panel made and keeps the DNS record), null for a domain somebody brought.
            'managed' => $domain->dns_zone_id ? ($domain->zone?->domain) : null,
            'dns_ok' => $domain->pointsAtRouter($target),
            // What the domain leads to as the panel sees it, and what it should lead to: for when it does not match yet.
            'dns' => ['resolves_to' => $domain->resolvedAddresses(), 'expected' => ServerDomain::routerAddresses($target)],
            // Served over the web (http, and https once there is a certificate) by panel-edge, and the state of that certificate.
            'https' => app(DomainCertificateService::class)->describe($domain),
            'created_at' => $domain->created_at?->toAtomString(),
        ];
    }
}
