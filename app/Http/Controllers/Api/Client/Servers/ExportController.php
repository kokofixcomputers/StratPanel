<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Servers\ServerExportService;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class ExportController extends ClientApiController
{
    public function __construct(private ServerExportService $exporter)
    {
        parent::__construct();
    }

    /**
     * The export file of a server (settings, egg, variables, schedules). Only for its owner and the admins, it holds the owner's
     * email and the startup command.
     */
    public function __invoke(ClientApiRequest $request, Server $server): JsonResponse
    {
        $user = $request->user();
        if (!$user->root_admin && $user->id !== $server->owner_id) {
            throw new DisplayException('Only the owner of this server can export it.');
        }

        Activity::event('server:export')->log();

        return new JsonResponse($this->exporter->handle($server));
    }
}
