<?php

namespace Pterodactyl\Http\Middleware\Admin\Servers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class ServerInstalled
{
    /**
     * Checks that the server is installed before allowing access through the route.
     */
    public function handle(Request $request, \Closure $next): mixed
    {
        $server = $request->route()->parameter('server');
        // The page of the admin area is the app (it has no model in its signature), so the route still holds the id.
        if (!$server instanceof Server && is_scalar($server)) {
            $server = Server::query()->find($server);
        }

        if (!$server instanceof Server) {
            throw new NotFoundHttpException('No server resource was located in the request parameters.');
        }

        if (!$server->isInstalled()) {
            throw new HttpException(Response::HTTP_FORBIDDEN, 'Access to this resource is not allowed due to the current installation state.');
        }

        return $next($request);
    }
}
