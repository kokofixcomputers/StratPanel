<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\PrivateNetwork\PrivateNetworkService;

/** Settings > Private network: turning it on, the range, and how each node is doing. */
class PrivateNetworkController extends Controller
{
    public function __construct(private PrivateNetworkService $network)
    {
    }

    public function index(): JsonResponse
    {
        $joined = Server::query()->whereNotNull('private_address')->selectRaw('node_id, COUNT(*) as total')->groupBy('node_id')->pluck('total', 'node_id');

        return new JsonResponse([
            'enabled' => $this->network->enabled(),
            'range' => $this->network->range(),
            // What it would be if it were turned on now, so the form has something to show and to change.
            'suggested' => $this->network->range() !== '' ? $this->network->range() : $this->network->suggest(),
            'joined' => (int) $joined->sum(),
            'nodes' => Node::query()->orderBy('name')->get()->map(fn (Node $node) => [
                'id' => $node->id,
                'name' => $node->name,
                'fqdn' => $node->fqdn,
                'enabled' => (bool) $node->private_enabled,
                'subnet' => $node->private_subnet,
                'port' => (int) $node->private_port,
                'state' => $node->private_state,
                'message' => $node->private_message,
                // A node that did not say anything for a while is not running a Wings that knows the private network.
                'reported_at' => $node->private_reported_at?->toIso8601String(),
                'recent' => $node->private_reported_at?->gt(now()->subMinutes(5)) ?? false,
                'has_key' => $node->private_public_key !== null,
                'servers' => (int) ($joined[$node->id] ?? 0),
            ])->values()->all(),
        ]);
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'range' => 'nullable|string|max:32',
            'nodes' => 'nullable|array',
            'nodes.*.id' => 'required|integer|exists:nodes,id',
            'nodes.*.enabled' => 'required|boolean',
            'nodes.*.port' => 'required|integer|between:1024,65535',
        ]);

        foreach ($data['nodes'] ?? [] as $row) {
            Node::query()->whereKey($row['id'])->first()?->forceFill(['private_enabled' => (bool) $row['enabled'], 'private_port' => (int) $row['port']])->save();
        }
        $this->network->configure($request->boolean('enabled'), $data['range'] ?? null);

        return $this->index();
    }
}
