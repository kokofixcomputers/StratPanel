<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Allocations\AssignmentService;
use Pterodactyl\Services\Allocations\AllocationDeletionService;
use Pterodactyl\Http\Requests\Admin\Node\AllocationFormRequest;
use Pterodactyl\Http\Requests\Admin\Node\AllocationAliasFormRequest;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** The allocations (an address and a port) of a node and the servers on it, for the admin pages. */
class NodeAllocationsController extends Controller
{
    use FormatsAdminResponses;

    public function __construct(private AssignmentService $assignment, private AllocationDeletionService $deletion)
    {
    }

    public function index(int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $allocations = $found->allocations()
            ->orderByRaw('server_id IS NOT NULL DESC, server_id IS NULL')
            ->orderByRaw('INET_ATON(ip) ASC')
            ->orderBy('port')
            ->with('server:id,name')
            ->paginate(50);

        return new JsonResponse([
            'allocations' => $allocations->getCollection()->map(fn (Allocation $allocation) => [
                'id' => $allocation->id,
                'ip' => $allocation->ip,
                'ip_alias' => $allocation->ip_alias,
                'port' => $allocation->port,
                'server' => $allocation->server ? ['id' => $allocation->server->id, 'name' => $allocation->server->name] : null,
            ])->values()->all(),
            'pagination' => $this->pagination($allocations),
            // The addresses that have allocations here, to choose from when adding more or removing a block.
            'ips' => Allocation::query()->where('node_id', $found->id)->groupBy('ip')->orderByRaw('INET_ATON(ip) ASC')->pluck('ip')->all(),
        ]);
    }

    public function store(AllocationFormRequest $request, int $node): JsonResponse
    {
        $this->assignment->handle(Node::query()->findOrFail($node), $request->normalize());

        return $this->index($node);
    }

    public function setAlias(AllocationAliasFormRequest $request, int $node): JsonResponse
    {
        Allocation::query()->where('node_id', $node)->findOrFail($request->input('allocation_id'))
            ->update(['ip_alias' => empty($request->input('alias')) ? null : $request->input('alias')]);

        return new JsonResponse([], 204);
    }

    public function destroy(int $node, int $allocation): JsonResponse
    {
        $this->deletion->handle(Allocation::query()->where('node_id', $node)->findOrFail($allocation));

        return new JsonResponse([], 204);
    }

    /** Several at once, the ones that are chosen on the page. */
    public function destroyMany(Request $request, int $node): JsonResponse
    {
        $data = $request->validate(['allocations' => 'required|array|min:1', 'allocations.*' => 'integer']);

        foreach (Allocation::query()->where('node_id', $node)->whereIn('id', $data['allocations'])->get() as $allocation) {
            $this->deletion->handle($allocation);
        }

        return new JsonResponse([], 204);
    }

    /** Every allocation of an address that no server uses. */
    public function destroyBlock(Request $request, int $node): JsonResponse
    {
        $data = $request->validate(['ip' => 'required|string']);

        Allocation::query()->where('node_id', $node)->whereNull('server_id')->where('ip', $data['ip'])->delete();

        return new JsonResponse([], 204);
    }

    public function servers(int $node): JsonResponse
    {
        $servers = Server::query()->with(['user', 'nest', 'egg'])->where('node_id', Node::query()->findOrFail($node)->id)->orderBy('id')->paginate(25);

        return new JsonResponse([
            'servers' => $servers->getCollection()->map(fn (Server $server) => [
                'id' => $server->id,
                'uuid_short' => $server->uuidShort,
                'name' => $server->name,
                'owner' => ['id' => $server->owner_id, 'username' => $server->user->username],
                'nest' => $server->nest->name,
                'egg' => $server->egg->name,
            ])->values()->all(),
            'pagination' => $this->pagination($servers),
        ]);
    }
}
