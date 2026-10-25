<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Services\Servers\AutomodpackFingerprintService;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class AutomodpackController extends ClientApiController
{
    public function __construct(private AutomodpackFingerprintService $service)
    {
        parent::__construct();
    }

    /** The fingerprint AutoModpack hosts with. Everybody who can see the server (and so its address) may see it. */
    public function index(ClientApiRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse($this->service->get($server, $request->boolean('scan')));
    }
}
