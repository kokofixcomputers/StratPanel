<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\ServerDomain;

class DomainsController extends Controller
{
    use AuthorizesRouter;

    /**
     * Returns every domain together with the address it has to be proxied to. This is read by the Minecraft router
     * (see tools/mc-router) and is protected by a shared secret instead of a user account.
     */
    public function __invoke(Request $request): JsonResponse
    {
        if ($rejected = $this->rejectUnlessRouter($request)) {
            return $rejected;
        }

        $data = ServerDomain::query()
            ->with(['allocation', 'server'])
            ->get()
            ->filter(fn (ServerDomain $domain) => !is_null($domain->allocation))
            ->map(fn (ServerDomain $domain) => [
                'domain' => $domain->domain,
                'host' => $domain->allocation->ip,
                'port' => $domain->allocation->port,
                'status' => $this->blockedStatus($domain->server),
            ])
            ->values()
            ->all();

        return new JsonResponse(['data' => $data]);
    }

    /**
     * Servers in these states cannot be joined whatever the daemon says, so the router does not even try.
     */
    private function blockedStatus(?Server $server): ?string
    {
        if (is_null($server)) {
            return null;
        }

        if ($server->isSuspended()) {
            return 'suspended';
        }

        return match ($server->status) {
            Server::STATUS_INSTALLING, Server::STATUS_INSTALL_FAILED, Server::STATUS_REINSTALL_FAILED => 'installing',
            Server::STATUS_RESTORING_BACKUP => 'restoring',
            default => null,
        };
    }
}
