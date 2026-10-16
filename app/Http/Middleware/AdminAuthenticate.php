<?php

namespace Pterodactyl\Http\Middleware;

use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * The admin area is for root admins and for people whose roles give them at least one permission in it. What exactly each of them
 * may open is checked per route by AdminPermission.
 */
class AdminAuthenticate
{
    /**
     * Handle an incoming request.
     *
     * @throws AccessDeniedHttpException
     */
    public function handle(Request $request, \Closure $next): mixed
    {
        if (!$request->user() || !$request->user()->canAccessAdmin()) {
            throw new AccessDeniedHttpException();
        }

        return $next($request);
    }
}
