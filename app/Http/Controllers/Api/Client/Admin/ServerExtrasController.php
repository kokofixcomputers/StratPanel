<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\Mount;
use Pterodactyl\Models\Server;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Database;
use Pterodactyl\Models\MountServer;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Repositories\Eloquent\MountRepository;
use Pterodactyl\Repositories\Eloquent\DatabaseHostRepository;
use Pterodactyl\Services\Domains\ManagedDomainService;
use Pterodactyl\Services\Databases\DatabasePasswordService;
use Pterodactyl\Services\Databases\DatabaseManagementService;
use Pterodactyl\Http\Requests\Admin\Servers\Databases\StoreServerDatabaseRequest;

/** The databases, mounts and domains of a server, for the admin pages. */
class ServerExtrasController extends Controller
{
    public function __construct(
        private DatabaseManagementService $databases,
        private DatabasePasswordService $passwords,
        private DatabaseHostRepository $hosts,
        private MountRepository $mounts,
        private ManagedDomainService $managed,
    ) {
    }

    // ---- databases -------------------------------------------------------------------------------------------------------

    public function databases(int $serverId): JsonResponse
    {
        return new JsonResponse($this->databaseState(Server::query()->with('databases.host')->findOrFail($serverId)));
    }

    public function createDatabase(StoreServerDatabaseRequest $request, int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        $this->databases->create($server, [
            'database' => DatabaseManagementService::generateUniqueDatabaseName($request->input('database'), $server->id),
            'remote' => $request->input('remote'),
            'database_host_id' => $request->input('database_host_id'),
            'max_connections' => $request->input('max_connections'),
        ]);

        return new JsonResponse($this->databaseState(Server::query()->with('databases.host')->findOrFail($serverId)), 201);
    }

    public function resetDatabasePassword(int $serverId, int $database): JsonResponse
    {
        $this->passwords->handle(Server::query()->findOrFail($serverId)->databases()->findOrFail($database));

        return new JsonResponse([], 204);
    }

    public function deleteDatabase(int $serverId, int $database): JsonResponse
    {
        $this->databases->delete(Server::query()->findOrFail($serverId)->databases()->findOrFail($database));

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    private function databaseState(Server $server): array
    {
        return [
            'id' => $server->id,
            'name' => $server->name,
            'uuid_short' => $server->uuidShort,
            'databases' => $server->databases->map(fn (Database $database) => [
                'id' => $database->id,
                'database' => $database->database,
                'username' => $database->username,
                'remote' => $database->remote,
                'host' => $database->host->host . ':' . $database->host->port,
                'max_connections' => $database->max_connections,
            ])->values()->all(),
            'hosts' => $this->hosts->all()->map(fn ($host) => ['id' => $host->id, 'name' => $host->name])->values()->all(),
        ];
    }

    // ---- mounts ----------------------------------------------------------------------------------------------------------

    public function mounts(int $serverId): JsonResponse
    {
        return new JsonResponse($this->mountState(Server::query()->with('mounts')->findOrFail($serverId)));
    }

    public function addMount(Request $request, int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        $data = $request->validate(['mount_id' => 'required|integer|exists:mounts,id']);

        (new MountServer())->forceFill(['mount_id' => $data['mount_id'], 'server_id' => $server->id])->saveOrFail();

        return new JsonResponse($this->mountState($server->load('mounts')));
    }

    public function deleteMount(int $serverId, int $mount): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        MountServer::query()->where('mount_id', $mount)->where('server_id', $server->id)->delete();

        return new JsonResponse($this->mountState($server->load('mounts')));
    }

    /** @return array<string, mixed> */
    private function mountState(Server $server): array
    {
        $mounted = $server->mounts->pluck('id')->all();

        return [
            'id' => $server->id,
            'name' => $server->name,
            'mounts' => $this->mounts->getMountListForServer($server)->map(fn (Mount $mount) => [
                'id' => $mount->id,
                'name' => $mount->name,
                'source' => $mount->source,
                'target' => $mount->target,
                'mounted' => in_array($mount->id, $mounted, true),
            ])->values()->all(),
        ];
    }

    // ---- domains ---------------------------------------------------------------------------------------------------------

    public function domains(int $serverId): JsonResponse
    {
        return new JsonResponse($this->domainState(Server::query()->with('allocations')->findOrFail($serverId)));
    }

    public function addDomain(Request $request, int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        if (!config('pterodactyl.domains.enabled')) {
            throw new DisplayException('Custom domains are not enabled on this panel.');
        }

        $request->merge(['domain' => strtolower(rtrim(trim((string) $request->input('domain')), '.'))]);
        $data = $request->validate([
            'domain' => ['required', 'string', 'max:253', 'regex:/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', Rule::unique('server_domains', 'domain')],
            'allocation_id' => ['required', 'integer'],
        ], [
            'domain.regex' => 'Enter a valid domain name such as play.example.com.',
            'domain.unique' => 'That domain is already in use.',
        ]);

        $panelHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        if ($panelHost !== '' && $data['domain'] === $panelHost) {
            throw new DisplayException('The domain of the panel itself cannot be used for a server.');
        }

        $allocation = $server->allocations()->where('id', (int) $data['allocation_id'])->first();
        if (is_null($allocation)) {
            throw new DisplayException('That allocation does not belong to this server.');
        }

        ServerDomain::query()->create(['server_id' => $server->id, 'allocation_id' => $allocation->id, 'domain' => $data['domain']]);
        Activity::event('server:domain.create')->property(['domain' => $data['domain'], 'allocation' => $allocation->toString()])->log();

        return new JsonResponse($this->domainState($server->load('allocations')), 201);
    }

    public function deleteDomain(int $serverId, int $domain): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        $record = ServerDomain::query()->with('zone')->where('server_id', $server->id)->findOrFail($domain);
        $this->managed->remove($record);
        Activity::event('server:domain.delete')->property(['domain' => $record->domain])->log();

        return new JsonResponse($this->domainState($server->load('allocations')));
    }

    /** @return array<string, mixed> */
    private function domainState(Server $server): array
    {
        $target = ServerDomain::routerTargetIp();

        return [
            'id' => $server->id,
            'name' => $server->name,
            'enabled' => (bool) config('pterodactyl.domains.enabled'),
            'target_ip' => $target,
            'max' => (int) config('pterodactyl.domains.max_per_server'),
            'allocations' => $server->allocations->map(fn ($allocation) => ['id' => $allocation->id, 'text' => $allocation->alias . ':' . $allocation->port, 'primary' => $allocation->id === $server->allocation_id])->values()->all(),
            'domains' => ServerDomain::query()->with('allocation')->where('server_id', $server->id)->orderBy('domain')->get()->map(fn (ServerDomain $domain) => [
                'id' => $domain->id,
                'domain' => $domain->domain,
                'leads_to' => $domain->allocation ? ($domain->allocation->alias ?? $domain->allocation->ip) . ':' . $domain->allocation->port : null,
                'ready' => $domain->pointsAtRouter($target),
            ])->values()->all(),
        ];
    }
}
