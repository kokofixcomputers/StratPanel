<?php

namespace Pterodactyl\Http\Middleware;

use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * "admin.can:servers.view" lets a request through for a user who holds that permission (root admins hold all of them). With several,
 * "admin.can:users.view,servers.create", holding any one is enough. "admin.can:root" is for the few things only root admins do.
 */
class AdminPermission
{
    /**
     * @throws AccessDeniedHttpException
     */
    public function handle(Request $request, \Closure $next, string ...$permissions): mixed
    {
        $user = $request->user();

        if (!$user) {
            throw new AccessDeniedHttpException();
        }
        if (in_array('root', $permissions, true)) {
            if (!$user->root_admin) {
                throw new AccessDeniedHttpException();
            }

            return $next($request);
        }
        if (!$user->hasAnyPermission(...$permissions)) {
            throw new AccessDeniedHttpException();
        }

        return $next($request);
    }
}
