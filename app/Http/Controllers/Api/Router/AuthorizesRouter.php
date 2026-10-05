<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

/**
 * The router is not a user, it authenticates with a secret shared through the panel's configuration.
 */
trait AuthorizesRouter
{
    /**
     * Returns an error response when the request does not carry the router token, or null when it is allowed.
     */
    protected function rejectUnlessRouter(Request $request): ?JsonResponse
    {
        $secret = (string) config('pterodactyl.domains.router_token');
        $given = (string) $request->bearerToken();

        if ($secret === '' || !hash_equals($secret, $given)) {
            return new JsonResponse(['errors' => [['code' => 'Unauthorized', 'status' => '401', 'detail' => 'Invalid router token.']]], 401);
        }

        return null;
    }
}
