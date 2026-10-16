<?php

namespace Pterodactyl\Providers;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;
use Pterodactyl\Extensions\ExtensionManager;

class ExtensionServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ExtensionManager::class);
    }

    /**
     * Starts the extensions that are on. This is the last provider, so what they hook into is there. Whatever happens in
     * here, the panel starts.
     */
    public function boot(): void
    {
        try {
            $this->app->make(ExtensionManager::class)->start();
        } catch (\Throwable $exception) {
            Log::error('Extensions could not be started, the panel carries on without them: ' . $exception->getMessage());
        }
    }
}
