<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class StateController extends Controller
{
    use AuthorizesRouter;

    public function __construct(private DaemonServerRepository $repository)
    {
    }

    /**
     * What the server behind a domain is doing right now, asked by the router when it cannot connect to a server so it
     * can tell the player whether the server is off or just starting up.
     */
    public function __invoke(Request $request): JsonResponse
    {
        if ($rejected = $this->rejectUnlessRouter($request)) {
            return $rejected;
        }

        $domain = strtolower((string) $request->query('domain'));
        $record = ServerDomain::query()->with('server.node')->where('domain', $domain)->first();
        if (is_null($record) || is_null($record->server)) {
            return new JsonResponse(['state' => 'unknown']);
        }

        $server = $record->server;

        // Every player refreshing the server list asks, so the daemon is only bothered every few seconds.
        $state = Cache::remember("router:state:{$server->id}", 3, function () use ($server) {
            try {
                $details = $this->repository->setServer($server)->getDetails();

                return in_array($details['state'] ?? null, ['running', 'starting', 'stopping', 'offline'], true)
                    ? $details['state']
                    : 'unknown';
            } catch (\Throwable $exception) {
                return 'unknown';
            }
        });

        return new JsonResponse(['state' => $state]);
    }
}
