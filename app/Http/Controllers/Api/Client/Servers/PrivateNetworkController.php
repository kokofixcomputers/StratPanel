<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Permission;
use Pterodactyl\Services\PrivateNetwork\PrivateNetworkService;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Illuminate\Auth\Access\AuthorizationException;

/** Joining a server to the private network, from the Network tab. */
class PrivateNetworkController extends ClientApiController
{
    public function __construct(private PrivateNetworkService $network)
    {
        parent::__construct();
    }

    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_READ);

        return new JsonResponse($this->describe($server));
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function join(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_UPDATE);
        $address = $this->network->join($server);
        Activity::event('server:private-network.join')->subject($server)->property('address', $address)->log();

        return new JsonResponse($this->describe($server->refresh()), 201);
    }

    public function leave(Request $request, Server $server): JsonResponse
    {
        $this->authorizeFor($request, $server, Permission::ACTION_ALLOCATION_UPDATE);
        $this->network->leave($server);
        Activity::event('server:private-network.leave')->subject($server)->log();

        return new JsonResponse($this->describe($server->refresh()));
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
        $on = $this->network->enabled();

        return [
            // Whether the panel has the private network on at all, and whether this server can join it (its node takes part).
            'enabled' => $on,
            'available' => $on && $this->network->available($server),
            'joined' => $server->private_address !== null,
            'address' => $server->private_address,
            'node' => $server->node->name,
            // The servers of the same owner that are on it too, which are the ones that can be reached.
            'others' => $server->private_address === null ? [] : Server::query()->where('owner_id', $server->owner_id)->where('id', '!=', $server->id)
                ->whereNotNull('private_address')->orderBy('name')->get(['name', 'private_address', 'uuidShort'])
                ->map(fn (Server $other) => ['name' => $other->name, 'address' => $other->private_address, 'identifier' => $other->uuidShort])->values()->all(),
        ];
    }
}
