<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\ServerDomain;
use Illuminate\Routing\Controller;

class DomainsController extends Controller
{
    /**
     * Returns every domain together with the address it has to be proxied to. This is read by the Minecraft router
     * (see tools/mc-router) and is protected by a shared secret instead of a user account.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $secret = (string) config('pterodactyl.domains.router_token');
        $given = (string) $request->bearerToken();

        if ($secret === '' || !hash_equals($secret, $given)) {
            return new JsonResponse(['errors' => [['code' => 'Unauthorized', 'status' => '401', 'detail' => 'Invalid router token.']]], 401);
        }

        $data = ServerDomain::query()
            ->with('allocation')
            ->get()
            ->filter(fn (ServerDomain $domain) => !is_null($domain->allocation))
            ->map(fn (ServerDomain $domain) => [
                'domain' => $domain->domain,
                'host' => $domain->allocation->ip,
                'port' => $domain->allocation->port,
            ])
            ->values()
            ->all();

        return new JsonResponse(['data' => $data]);
    }
}
