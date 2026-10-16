<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Servers\AutoSleep\AutoSleepService;

class WakeController extends Controller
{
    use AuthorizesRouter;

    public function __construct(private AutoSleepService $service)
    {
    }

    /**
     * A player tried to join a server through the router that did not answer. When the server is asleep (auto sleep stopped it
     * because nobody was on) it is started, otherwise nothing happens. The router only asks when a player tries to log in, not
     * when the server list is refreshed, or every list that someone looks at would wake the server.
     */
    public function __invoke(Request $request): JsonResponse
    {
        if ($rejected = $this->rejectUnlessRouter($request)) {
            return $rejected;
        }

        $domain = strtolower((string) $request->input('domain'));
        $record = ServerDomain::query()->with('server.node')->where('domain', $domain)->first();
        if (is_null($record) || is_null($record->server)) {
            return new JsonResponse(['result' => AutoSleepService::NOT_SLEEPING]);
        }

        return new JsonResponse(['result' => $this->service->wake($record->server)]);
    }
}
