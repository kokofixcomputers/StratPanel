<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Tunnel;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Permission;
use Pterodactyl\Services\Tunnels\TunnelService;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Illuminate\Auth\Access\AuthorizationException;

/** Opening the ports of a server to the internet through a tunnel, from the Network tab. */
class TunnelController extends ClientApiController
{
    public function __construct(private TunnelService $tunnels)
    {
        parent::__construct();
    }

    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_READ);

        return new JsonResponse($this->describe($server));
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function store(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_UPDATE);
        $data = $request->validate(['allocation_id' => 'required|integer']);
        $allocation = Allocation::query()->where('server_id', $server->id)->findOrFail($data['allocation_id']);

        $this->tunnels->open($server, $allocation);
        Activity::event('server:tunnel.open')->subject($allocation)->property('allocation', $allocation->toString())->log();

        return new JsonResponse($this->describe($server), 201);
    }

    public function delete(Request $request, Server $server, int $tunnel): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_UPDATE);
        $found = Tunnel::query()->where('server_id', $server->id)->findOrFail($tunnel);

        $this->tunnels->close($found);
        Activity::event('server:tunnel.close')->subject($server)->log();

        return new JsonResponse($this->describe($server));
    }

    private function authorizeFor(Request $request, Server $server, string $permission): void
    {
        if (!$request->user()->can($permission, $server)) {
            throw new AuthorizationException();
        }
    }

    /** @return array<string, mixed> */
    private function describe(Server $server): array
    {
        $tunnels = Tunnel::query()->where('server_id', $server->id)->get()->keyBy('allocation_id');

        return [
            'enabled' => $this->tunnels->enabled(),
            'max' => $this->tunnels->maxPerServer(),
            // The port the server is played on first.
            'allocations' => $server->allocations()->get()->sortBy(fn (Allocation $a) => [$a->id === $server->allocation_id ? 0 : 1, $a->port])->map(function (Allocation $allocation) use ($server, $tunnels) {
                $tunnel = $tunnels->get($allocation->id);

                return [
                    'id' => $allocation->id,
                    'ip' => $allocation->ip,
                    'port' => $allocation->port,
                    'is_primary' => $allocation->id === $server->allocation_id,
                    'tunnel' => $tunnel ? [
                        'id' => $tunnel->id,
                        'status' => $tunnel->status,
                        'address' => $tunnel->address,
                        'error' => $tunnel->error,
                    ] : null,
                ];
            })->values()->all(),
        ];
    }
}
