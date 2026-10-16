<?php

namespace Stratosphere\MyExtension;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Extensions\Extension;

/**
 * The main class of the extension (php.main in extension.json). The panel makes one when it starts and calls register() and boot().
 * Anything thrown from here, or from the functions you hand to the panel, is caught: the panel writes it down on the Extensions page
 * and carries on without your extension, so a mistake here never takes the panel down.
 */
class MyExtension extends Extension
{
    /** Listen to what happens in the panel. */
    public function register(): void
    {
        // A filter changes a value. This adds a field to what the client API tells about every server (the hooks the panel has are
        // listed in Pterodactyl\Extensions\Hooks). Return the value, changed.
        $this->context->filter('server.attributes', function (array $attributes) {
            $attributes['my_extension'] = ['greeting' => $this->context->setting('greeting')];

            return $attributes;
        });
    }

    /** Add routes. */
    public function boot(): void
    {
        // Routes for people who are logged in, at /api/client/extensions/my-extension/...
        $this->context->clientRoutes(function ($router) {
            $router->get('/hello', fn () => new JsonResponse(['message' => $this->context->setting('greeting')]));
        });

        // $this->context->adminRoutes(...)  pages for admins, at /admin/extensions/my-extension/x/...
        // $this->context->publicRoutes(...) no login, at /api/extensions/my-extension/... (a webhook: check what comes in)
    }
}
