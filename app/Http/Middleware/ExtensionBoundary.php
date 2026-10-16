<?php

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Pterodactyl\Extensions\ExtensionManager;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Around every route an extension adds. What is meant to happen in a request (a 404, a failed validation, no permission) goes through
 * as usual, but when the extension itself breaks the error is written down for the admin and the person gets a short message,
 * not a stack trace, and the rest of the panel is not touched.
 */
class ExtensionBoundary
{
    public function __construct(private ExtensionManager $extensions)
    {
    }

    public function handle(Request $request, Closure $next, string $extension): mixed
    {
        try {
            return $next($request);
        } catch (HttpExceptionInterface|ValidationException|AuthenticationException|AuthorizationException|ModelNotFoundException $normal) {
            throw $normal;
        } catch (\Throwable $exception) {
            $this->extensions->report($extension, $exception, 'a request to ' . $request->path());

            $message = 'The extension "' . $extension . '" ran into a problem. The panel itself is fine, an admin can see the details on the Extensions page.';
            if ($request->expectsJson() || str_starts_with($request->path(), 'api/')) {
                return new JsonResponse(['errors' => [['code' => 'ExtensionError', 'status' => '500', 'detail' => $message]]], 500);
            }

            return response($message, 500);
        }
    }
}
