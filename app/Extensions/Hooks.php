<?php

namespace Pterodactyl\Extensions;

/**
 * The places where the panel asks extensions what to do. The panel calls {@see filter} with a value (the answer the router is about
 * to get, the attributes of a server) and every extension that listens may change it, one after the other. {@see fire} just tells
 * them something happened.
 *
 * An extension that throws is skipped: the value stays what it was, the error is written down for the admin page and the panel
 * carries on with the other extensions. Nothing an extension does can stop a filter from returning.
 *
 * The hooks the panel has:
 *   router.state        array  the answer to the router about one server (state, sleeping, notice), args: Server, ServerDomain
 *   router.domains      array  the list of domains the router is given
 *   server.attributes   array  the attributes of a server in the client API, args: Server, User
 *   site.configuration  array  what the pages of the panel get in window.SiteConfiguration
 */
final class Hooks
{
    /** @var array<string, array<int, list<array{0: callable, 1: string|null}>>> name => priority => listeners */
    private static array $listeners = [];

    /** @param  callable  $callback  called with the value (a filter) or the arguments (an action) */
    public static function listen(string $name, callable $callback, ?string $extension = null, int $priority = 10): void
    {
        self::$listeners[$name][$priority][] = [$callback, $extension];
    }

    public static function has(string $name): bool
    {
        return !empty(self::$listeners[$name]);
    }

    /**
     * Passes a value through everyone who listens and returns what is left of it.
     *
     * @param  mixed  ...$args  more things the listeners may want to know, they cannot change them
     */
    public static function filter(string $name, mixed $value, mixed ...$args): mixed
    {
        foreach (self::ordered($name) as [$callback, $extension]) {
            try {
                $result = $callback($value, ...$args);
                // A listener that forgets to return the value does not make it null.
                if ($result === null) {
                    continue;
                }
                // What comes back has to be the kind of thing that went in. The panel counts on it (an array stays an array), so
                // a listener that answers with something else is ignored and written down, it cannot break what called it.
                if (!self::sameKind($value, $result)) {
                    throw new \UnexpectedValueException("returned " . get_debug_type($result) . " for the filter $name, which takes " . get_debug_type($value));
                }
                $value = $result;
            } catch (\Throwable $exception) {
                self::report($extension, $exception, "the filter $name");
            }
        }

        return $value;
    }

    private static function sameKind(mixed $before, mixed $after): bool
    {
        $number = fn (mixed $value) => is_int($value) || is_float($value);

        return get_debug_type($before) === get_debug_type($after) || ($number($before) && $number($after));
    }

    public static function fire(string $name, mixed ...$args): void
    {
        foreach (self::ordered($name) as [$callback, $extension]) {
            try {
                $callback(...$args);
            } catch (\Throwable $exception) {
                self::report($extension, $exception, "the hook $name");
            }
        }
    }

    /** Takes away what an extension listened to, used when it failed while it was being started. */
    public static function forget(string $extension): void
    {
        foreach (self::$listeners as $name => $priorities) {
            foreach ($priorities as $priority => $listeners) {
                self::$listeners[$name][$priority] = array_values(array_filter($listeners, fn ($listener) => $listener[1] !== $extension));
            }
        }
    }

    public static function reset(): void
    {
        self::$listeners = [];
    }

    /** @return list<array{0: callable, 1: string|null}> */
    private static function ordered(string $name): array
    {
        $priorities = self::$listeners[$name] ?? [];
        ksort($priorities);

        return array_merge(...array_values($priorities) ?: [[]]);
    }

    private static function report(?string $extension, \Throwable $exception, string $where): void
    {
        try {
            app(ExtensionManager::class)->report($extension ?? 'unknown', $exception, $where);
        } catch (\Throwable) {
            // Not even that may break the panel.
        }
    }
}
