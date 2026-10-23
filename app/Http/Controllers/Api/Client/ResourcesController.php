<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Account > Resources: what the account may spend on servers and how the servers it owns use it. Without resource pools there is no
 * limit to show, only what the servers use.
 */
class ResourcesController extends ClientApiController
{
    public function __construct(private ResourcePool $pools)
    {
        parent::__construct();
    }

    public function __invoke(ClientApiRequest $request): array
    {
        $user = $request->user();
        $applies = $this->pools->appliesTo($user);

        $servers = Server::query()->where('owner_id', $user->id)->orderBy('name')->get(['id', 'uuid', 'uuidShort', 'name', 'memory', 'disk', 'cpu', 'backup_limit']);
        $counts = Allocation::query()->whereIn('server_id', $servers->pluck('id'))->selectRaw('server_id, COUNT(*) as total')->groupBy('server_id')->pluck('total', 'server_id');

        return [
            'object' => 'resources',
            'attributes' => [
                // Whether the panel pays servers from pools, and whether this account is held to one (admins who may create servers are not).
                'enabled' => $this->pools->enabled(),
                'limited' => $applies,
                'limits' => $applies ? $this->pools->limits($user) : null,
                'used' => $this->pools->used($user),
                'remaining' => $applies ? $this->pools->remaining($user) : null,
                'servers' => $servers->map(fn (Server $server) => [
                    'identifier' => $server->uuidShort,
                    'name' => $server->name,
                    'memory' => (int) $server->memory,
                    'disk' => (int) $server->disk,
                    'cpu' => (int) $server->cpu,
                    'allocations' => (int) ($counts[$server->id] ?? 0),
                    'backups' => (int) $server->backup_limit,
                ])->values()->all(),
            ],
        ];
    }
}
