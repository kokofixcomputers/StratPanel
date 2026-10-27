<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Tunnel;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Tunnels\TunnelService;

/** Settings > Tunnels: whether servers can be opened to the internet through ngrok, Pinggy or playit.gg, with which token, and the tunnels that are open. */
class TunnelsController extends Controller
{
    public function __construct(private TunnelService $tunnels)
    {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'enabled' => $this->tunnels->switchedOn(),
            'provider' => $this->tunnels->provider(),
            'providers' => collect(TunnelService::PROVIDERS)->map(fn ($info, $id) => ['id' => $id] + $info)->values()->all(),
            'token_set' => $this->tunnels->token() !== null,
            'max' => $this->tunnels->maxPerServer(),
            'nodes' => Node::query()->orderBy('name')->get(['id', 'name', 'tunnel_token'])->map(fn (Node $node) => [
                'id' => $node->id,
                'name' => $node->name,
                'has_token' => is_string($node->tunnel_token) && $node->tunnel_token !== '',
            ])->values()->all(),
            'tunnels' => Tunnel::query()->with(['server:id,name,node_id', 'server.node:id,name', 'allocation:id,port'])->orderByDesc('id')->limit(200)->get()->map(fn (Tunnel $tunnel) => [
                'id' => $tunnel->id,
                'server' => $tunnel->server?->name,
                'node' => $tunnel->server?->node?->name,
                'port' => $tunnel->allocation?->port,
                'status' => $tunnel->status,
                'address' => $tunnel->address,
                'error' => $tunnel->error,
            ])->values()->all(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'max' => 'required|integer|between:1,50',
            'provider' => 'required|in:' . implode(',', array_keys(TunnelService::PROVIDERS)),
            'token' => 'nullable|string|max:500',
            'clear_token' => 'nullable|boolean',
            'node_tokens' => 'nullable|array',
            'node_tokens.*.id' => 'required|integer|exists:nodes,id',
            'node_tokens.*.token' => 'nullable|string|max:500',
            'node_tokens.*.clear' => 'nullable|boolean',
        ]);

        $this->tunnels->setEnabled($request->boolean('enabled'));
        $this->tunnels->setProvider($data['provider']);
        $this->tunnels->setMaxPerServer((int) $data['max']);
        if ($request->boolean('clear_token')) {
            $this->tunnels->setToken(null);
        } elseif (!empty($data['token'])) {
            $this->tunnels->setToken($data['token']);
        }

        $touched = [];
        foreach ($data['node_tokens'] ?? [] as $row) {
            $node = Node::query()->find($row['id']);
            if (!$node) {
                continue;
            }
            if (!empty($row['clear'])) {
                $node->forceFill(['tunnel_token' => null])->save();
                $touched[] = $node;
            } elseif (!empty($row['token'])) {
                $node->forceFill(['tunnel_token' => trim($row['token'])])->save();
                $touched[] = $node;
            }
        }

        // The nodes that have tunnels look at what is wanted now (a new token, or turned off).
        $nodes = collect($touched)->merge(Node::query()->whereHas('servers.tunnels')->get())->unique('id');
        foreach ($nodes as $node) {
            $this->tunnels->syncNode($node);
        }

        return $this->index();
    }

    public function destroy(int $tunnel): JsonResponse
    {
        $this->tunnels->close(Tunnel::query()->with('server.node')->findOrFail($tunnel));

        return new JsonResponse([], 204);
    }
}
