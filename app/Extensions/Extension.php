<?php

namespace Pterodactyl\Extensions;

/**
 * What an extension's main class extends (php.main in extension.json). It is created when the panel starts, once per request, and
 * gets its {@see ExtensionContext}. Do as little as you can here: listen to hooks, add routes, and do the real work when asked.
 *
 * Anything that is thrown from these methods, or from a hook, is caught: the panel writes it down for the admin and carries on without
 * the extension.
 */
abstract class Extension
{
    final public function __construct(protected ExtensionContext $context)
    {
    }

    /** Called first. Listen to hooks here. */
    public function register(): void
    {
    }

    /** Called when everything is registered. Add routes here. */
    public function boot(): void
    {
    }
}
