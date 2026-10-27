<?php

namespace Pterodactyl\Http\Controllers\Api\Remote;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Tunnel;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Tunnels\TunnelService;
use Pterodactyl\Exceptions\Http\HttpForbiddenException;

/** What a node asks about tunnels: which ports to open, and the result to tell the panel. */
class TunnelsController extends Controller
{
    public function __construct(private TunnelService $tunnels)
    {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var Node $node */
        $node = $request->attributes->get('node');

        return new JsonResponse($this->tunnels->configFor($node));
    }

    public function report(Request $request, int $tunnel): JsonResponse
    {
        /** @var Node $node */
        $node = $request->attributes->get('node');
        $found = Tunnel::query()->with('server')->findOrFail($tunnel);
        if ($found->server->node_id !== $node->id) {
            throw new HttpForbiddenException('Requesting node does not have permission to access this tunnel.');
        }

        $data = $request->validate(['state' => 'required|in:active,failed,waiting', 'address' => 'nullable|string|max:255', 'message' => 'nullable|string|max:1000']);
        $this->tunnels->report($found, $data['state'], $data['address'] ?? null, $data['message'] ?? null);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }
}
