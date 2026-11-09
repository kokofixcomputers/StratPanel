<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Pterodactyl\Services\Minecraft\MinecraftLinkService;

class LinkController extends Controller
{
    use AuthorizesRouter;

    public function __construct(private MinecraftLinkService $links)
    {
    }

    /**
     * A player joined the router with an address that leads nowhere and Mojang confirmed who they are (the router checks that, it never
     * asks about anybody else). The answer is the code they type into their account page, or that the account is linked already.
     */
    public function __invoke(Request $request): JsonResponse
    {
        if ($rejected = $this->rejectUnlessRouter($request)) {
            return $rejected;
        }

        $data = $request->validate([
            'uuid' => ['required', 'string', 'regex:/^[0-9a-f]{32}$/'],
            'username' => ['required', 'string', 'regex:/^\w{1,16}$/'],
        ]);

        return new JsonResponse($this->links->request($data['uuid'], $data['username']));
    }
}
