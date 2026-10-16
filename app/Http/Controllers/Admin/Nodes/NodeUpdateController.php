<?php

namespace Pterodactyl\Http\Controllers\Admin\Nodes;

use Pterodactyl\Models\Node;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\NodeUpdateService;

class NodeUpdateController extends Controller
{
    public function __construct(private NodeUpdateService $updates)
    {
    }

    /** Updates the Wings of one node. */
    public function node(Node $node): JsonResponse
    {
        $result = $this->updates->update($node);

        return new JsonResponse($result, $result['status'] === 'failed' ? 502 : 200);
    }

    /** Updates the Wings of every node, one after the other. */
    public function all(): JsonResponse
    {
        return new JsonResponse(['results' => $this->updates->updateAll(Node::query()->orderBy('id')->get())]);
    }
}
