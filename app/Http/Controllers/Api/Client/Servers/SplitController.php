<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Services\Servers\ServerSplitService;
use Pterodactyl\Services\Servers\ServerDeletionService;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Splitting a server into parts that share its memory, disk and CPU, and moving those between the parts. Whoever owns the server
 * (or may update servers in the admin area) can do it, from the page of any part.
 */
class SplitController extends ClientApiController
{
    public function __construct(private ServerSplitService $split, private ServerDeletionService $deletion)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse($this->describe($request, $server));
    }

    /** @throws \Throwable */
    public function store(Request $request, Server $server): JsonResponse
    {
        $root = $this->manageable($request, $server);
        $data = $request->validate([
            'name' => 'required|string|min:1|max:191',
            'memory' => 'required|integer|min:1',
            'disk' => 'required|integer|min:1',
            'cpu' => 'required|integer|min:1',
        ]);

        $this->split->split($root, $data['name'], ['memory' => $data['memory'], 'disk' => $data['disk'], 'cpu' => $data['cpu']]);

        return new JsonResponse($this->describe($request, $server->refresh()), 201);
    }

    /** @throws DisplayException */
    public function update(Request $request, Server $server): JsonResponse
    {
        $root = $this->manageable($request, $server);
        $data = $request->validate([
            'parts' => 'required|array|min:1',
            'parts.*.uuid' => 'required|string',
            'parts.*.memory' => 'required|integer|min:1',
            'parts.*.disk' => 'required|integer|min:1',
            'parts.*.cpu' => 'required|integer|min:1',
        ]);

        $shares = [];
        foreach ($data['parts'] as $part) {
            $shares[$part['uuid']] = ['memory' => $part['memory'], 'disk' => $part['disk'], 'cpu' => $part['cpu']];
        }
        $this->split->divide($root, $shares);

        return new JsonResponse($this->describe($request, $server->refresh()));
    }

    /**
     * Deletes a part, its share goes back to the first server.
     *
     * @throws \Throwable
     */
    public function delete(Request $request, Server $server, string $part): JsonResponse
    {
        $root = $this->manageable($request, $server);
        $child = $root->children()->where('uuidShort', $part)->first();
        if (!$child) {
            throw new DisplayException('That is not a part of this server.');
        }

        $this->deletion->handle($child);

        return new JsonResponse($this->describe($request, $server->refresh()));
    }

    /** @throws DisplayException */
    private function manageable(Request $request, Server $server): Server
    {
        $root = $this->split->root($server);
        $user = $request->user();
        abort_unless($user->id === $root->owner_id || $user->hasPermission('servers.update'), 403, 'Only the owner of the server can split it.');

        return $root;
    }

    /** @return array<string, mixed> */
    private function describe(Request $request, Server $server): array
    {
        $root = $this->split->root($server);
        $user = $request->user();

        return [
            'root' => $root->uuidShort,
            'current' => $server->uuidShort,
            'can_manage' => $user->id === $root->owner_id || $user->hasPermission('servers.update'),
            'splittable' => $this->split->splittable($root),
            'is_part' => (bool) $server->parent_server_id,
            'max_parts' => ServerSplitService::MAX_CHILDREN + 1,
            'minimum' => array_intersect_key(ResourcePool::MINIMUM, array_flip(ServerSplitService::RESOURCES)),
            'total' => $this->split->total($root),
            'parts' => $this->split->family($root)->map(fn (Server $part) => [
                'uuid' => $part->uuidShort,
                'name' => $part->name,
                'is_root' => $part->id === $root->id,
                'memory' => (int) $part->memory,
                'disk' => (int) $part->disk,
                'cpu' => (int) $part->cpu,
            ])->values()->all(),
        ];
    }
}
