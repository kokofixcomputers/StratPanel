<?php

namespace Pterodactyl\Extensions;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Psr\Log\LoggerInterface;
use Pterodactyl\Http\Middleware\RequireTwoFactorAuthentication;
use Pterodactyl\Http\Middleware\AdminAuthenticate;

/**
 * What an extension can do. Everything it needs from the panel goes through here, so what is stable for extension authors is
 * this class and {@see Hooks}, and not the insides of the panel (which an extension may of course use too, it is PHP in the panel).
 */
class ExtensionContext
{
    private ?ExtensionStore $store = null;

    /**
     * @param  array<string, mixed>  $settings  what the admin set, over the defaults of the manifest
     */
    public function __construct(
        private Manifest $manifest,
        private string $directory,
        private array $settings,
    ) {
    }

    public function id(): string
    {
        return $this->manifest->id();
    }

    public function manifest(): Manifest
    {
        return $this->manifest;
    }

    public function version(): string
    {
        return $this->manifest->version();
    }

    /** A path inside the folder of the extension. */
    public function path(string $relative = ''): string
    {
        return rtrim($this->directory, '/') . ($relative === '' ? '' : '/' . ltrim($relative, '/'));
    }

    /** One setting, as the admin set it on the Extensions page. */
    public function setting(string $key, mixed $default = null): mixed
    {
        return $this->settings[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    public function settings(): array
    {
        return $this->settings;
    }

    public function store(): ExtensionStore
    {
        return $this->store ??= new ExtensionStore($this->id());
    }

    public function log(): LoggerInterface
    {
        return Log::channel(config('logging.default'));
    }

    /** Changes a value of the panel, see {@see Hooks} for what there is. */
    public function filter(string $hook, callable $callback, int $priority = 10): void
    {
        Hooks::listen($hook, $callback, $this->id(), $priority);
    }

    /** Is told when something happens in the panel. */
    public function on(string $hook, callable $callback, int $priority = 10): void
    {
        Hooks::listen($hook, $callback, $this->id(), $priority);
    }

    /**
     * Routes for people who are logged in, under /api/client/extensions/<id>/. Same as the rest of the client API: sessions or API
     * keys, the rate limit and two factor, and errors are caught so a broken extension answers with an error instead of a crash.
     *
     * @param  callable(\Illuminate\Routing\Router): void  $define
     */
    public function clientRoutes(callable $define): void
    {
        Route::middleware(['api', RequireTwoFactorAuthentication::class, 'client-api', 'throttle:api.client', 'extension.boundary:' . $this->id()])
            ->prefix('/api/client/extensions/' . $this->id())
            ->scopeBindings()
            ->group(fn () => $define(app('router')));
    }

    /**
     * Pages and actions for admins, under /admin/extensions/<id>/x/.
     *
     * @param  callable(\Illuminate\Routing\Router): void  $define
     */
    public function adminRoutes(callable $define): void
    {
        Route::middleware(['web', 'auth.session', RequireTwoFactorAuthentication::class, AdminAuthenticate::class, 'extension.boundary:' . $this->id()])
            ->prefix('/admin/extensions/' . $this->id() . '/x')
            ->group(fn () => $define(app('router')));
    }

    /**
     * Routes that need no login (a webhook, a public status), under /api/extensions/<id>/. Only rate limited: check what comes in.
     *
     * @param  callable(\Illuminate\Routing\Router): void  $define
     */
    public function publicRoutes(callable $define): void
    {
        Route::middleware(['throttle:60,1', 'extension.boundary:' . $this->id()])
            ->prefix('/api/extensions/' . $this->id())
            ->group(fn () => $define(app('router')));
    }
}
