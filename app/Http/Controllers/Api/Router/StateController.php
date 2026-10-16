<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Extensions\Hooks;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;
use Pterodactyl\Services\Servers\AutoSleep\AutoSleepService;

class StateController extends Controller
{
    use AuthorizesRouter;

    public function __construct(private DaemonServerRepository $repository, private AutoSleepService $autoSleep)
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

        // A server that auto sleep stopped is asleep, not off: the router says so to the player and starts it when they log in.
        $answer = ['state' => $state, 'sleeping' => $state === 'offline' && $this->autoSleep->isSleeping($server)];

        // Extensions may add what the router shows the player instead of its own words: 'notice' => ['label' => ..., 'message' => ...].
        return new JsonResponse($this->clean(Hooks::filter('router.state', $answer, $server, $record), $answer));
    }

    /**
     * What the router is given, after the extensions had their say. The router believes this, so it is only what it understands:
     * a state and a sleeping flag as they were, and a notice with a short label and message that cannot hold more than a server list
     * entry can.
     *
     * @param  mixed  $filtered
     * @param  array<string, mixed>  $original
     * @return array<string, mixed>
     */
    private function clean(mixed $filtered, array $original): array
    {
        if (!is_array($filtered)) {
            return $original;
        }

        $answer = ['state' => $original['state'], 'sleeping' => $original['sleeping']];
        $notice = $filtered['notice'] ?? null;
        if (is_array($notice) && is_string($notice['message'] ?? null) && trim($notice['message']) !== '') {
            $answer['notice'] = [
                'label' => mb_substr(is_string($notice['label'] ?? null) ? $notice['label'] : '', 0, 40),
                'message' => mb_substr($notice['message'], 0, 400),
            ];
        }

        return $answer;
    }
}
