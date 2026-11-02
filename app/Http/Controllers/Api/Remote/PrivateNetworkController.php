<?php

namespace Pterodactyl\Http\Controllers\Api\Remote;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\PrivateNetwork\PrivateNetworkService;

/** What a node asks about the private network, and what it says about itself (its public key, and how it is doing). */
class PrivateNetworkController extends Controller
{
    public function __construct(private PrivateNetworkService $network)
    {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var Node $node */
        $node = $request->attributes->get('node');

        return new JsonResponse($this->network->configFor($node));
    }

    public function report(Request $request): JsonResponse
    {
        /** @var Node $node */
        $node = $request->attributes->get('node');
        $data = $request->validate([
            // A WireGuard public key is 32 bytes in base64.
            'public_key' => ['nullable', 'string', 'regex:/^[A-Za-z0-9+\/]{43}=$/'],
            'state' => 'required|in:ready,error,off',
            'message' => 'nullable|string|max:1000',
        ]);

        $this->network->report($node, $data['public_key'] ?? null, $data['state'], $data['message'] ?? null);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }
}
