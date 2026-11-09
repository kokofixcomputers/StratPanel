<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\MinecraftLinkCode;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Minecraft\MinecraftLinkService;

/** Settings > Minecraft accounts: whether people can link theirs, and how many did. */
class MinecraftLinkController extends Controller
{
    public function __construct(private MinecraftLinkService $links)
    {
    }

    public function index(): JsonResponse
    {
        $this->links->purge();

        return new JsonResponse([
            'enabled' => $this->links->enabled(),
            'address' => $this->links->address(),
            'minutes' => MinecraftLinkService::MINUTES,
            'linked' => $this->links->linkedCount(),
            'waiting' => MinecraftLinkCode::query()->count(),
            // The router that shows the codes has to be running, and it needs the address of the panel and its secret.
            'router' => (string) config('pterodactyl.domains.router_token') !== '',
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['enabled' => 'required|boolean', 'address' => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9.-]*(:\d{1,5})?$/']]);
        $this->links->setEnabled($request->boolean('enabled'));
        $this->links->setAddress((string) ($data['address'] ?? ''));

        return $this->index();
    }
}
