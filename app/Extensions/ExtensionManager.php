<?php

namespace Pterodactyl\Extensions;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\InstalledExtension;

/**
 * Starts the extensions that are switched on, and keeps going when one of them cannot be started. An extension that fails
 * (a file that is gone, a syntax error, an exception while it starts) is written down with the reason, left out for this request, and
 * the panel carries on with the others. The same happens to anything an extension does later, see {@see Hooks} and the boundary
 * around its routes.
 */
class ExtensionManager
{
    /** @var array<string, ExtensionContext> the ones that started */
    private array $running = [];

    /** @var array<string, string> the ones that did not, with the reason */
    private array $failed = [];

    private bool $started = false;

    /** @var Collection<int, InstalledExtension>|null */
    private ?Collection $records = null;

    /** Writing the same error again and again would be a database write per request. */
    private const REPEAT_SECONDS = 600;

    public function enabled(): bool
    {
        return (bool) config('extensions.enabled', true);
    }

    /** The folder with all extensions, or with one of them. */
    public function directory(?string $id = null): string
    {
        $base = rtrim((string) config('extensions.directory'), '/');

        return $id === null ? $base : $base . '/' . $id;
    }

    /** @return Collection<int, InstalledExtension> everything that is installed, newest settings from the database */
    public function records(bool $fresh = false): Collection
    {
        if ($this->records === null || $fresh) {
            try {
                $this->records = InstalledExtension::query()->orderBy('name')->get();
            } catch (\Throwable) {
                // Before the migration has run there is no table, and a database that is down has no extensions to start. Both
                // mean the panel starts without them, which is better than not starting.
                $this->records = new Collection();
            }
        }

        return $this->records;
    }

    public function find(string $id): ?InstalledExtension
    {
        return $this->records()->firstWhere('ext_id', $id);
    }

    /** Forgets what was started and starts again from the database, which is what the tests of extensions need. */
    public function restart(): void
    {
        $this->running = [];
        $this->failed = [];
        $this->started = false;
        $this->records = null;
        Hooks::reset();
        $this->start();
    }

    /** Starts every extension that is on. Safe to call twice. */
    public function start(): void
    {
        if ($this->started) {
            return;
        }
        $this->started = true;

        if (!$this->enabled()) {
            return;
        }

        foreach ($this->records()->where('enabled', true) as $record) {
            $this->startGuarded($record);
        }
    }

    /**
     * Some mistakes in PHP (a class that breaks its parent's rules, for one) are fatal and can not be caught. For those
     * the extension leaves a note before it starts and takes it away afterwards. A note that is still there while nobody
     * is starting the extension means the last start killed the process, so it is turned off for the next request.
     */
    private function startGuarded(InstalledExtension $record): void
    {
        $id = $record->ext_id;
        $note = null;

        try {
            $path = dirname($this->directory($id)) . '/.starting-' . $id;
            if (!is_dir(dirname($path))) {
                $this->startOne($record);

                return;
            }
            $note = @fopen($path, 'c+');
        } catch (\Throwable) {
            $note = null;
        }

        if (!is_resource($note)) {
            $this->startOne($record);

            return;
        }

        if (!flock($note, LOCK_EX | LOCK_NB)) {
            // Another request is starting it right now, that one keeps the note.
            fclose($note);
            $this->startOne($record);

            return;
        }

        if (trim((string) stream_get_contents($note)) === 'starting') {
            $this->failed[$id] = 'It crashed the panel while starting, so it was turned off.';
            $record->forceFill(['enabled' => false])->save();
            $this->records = null;
            $this->report($id, new \RuntimeException($this->failed[$id]), 'starting');
            flock($note, LOCK_UN);
            fclose($note);
            @unlink($path);

            return;
        }

        ftruncate($note, 0);
        rewind($note);
        fwrite($note, 'starting');
        fflush($note);

        try {
            $this->startOne($record);
        } finally {
            ftruncate($note, 0);
            flock($note, LOCK_UN);
            fclose($note);
        }
    }

    private function startOne(InstalledExtension $record): void
    {
        $id = $record->ext_id;

        try {
            $directory = $this->directory($id);
            $manifest = Manifest::fromDirectory($directory);
            if ($manifest->id() !== $id) {
                throw new InvalidManifestException('The folder is for "' . $id . '" but extension.json says "' . $manifest->id() . '".');
            }

            $this->registerAutoload($manifest, $directory);
            $context = new ExtensionContext($manifest, $directory, array_replace($manifest->defaults(), (array) $record->settings));

            if (($main = $manifest->mainClass()) !== null) {
                if (!class_exists($main)) {
                    throw new \RuntimeException('The class ' . $main . ' (php.main) was not found.');
                }
                if (!is_subclass_of($main, Extension::class)) {
                    throw new \RuntimeException($main . ' has to extend ' . Extension::class . '.');
                }

                $extension = new $main($context);
                $extension->register();
                $extension->boot();
            }

            $this->running[$id] = $context;
        } catch (\Throwable $exception) {
            // Whatever it had already hooked into is taken away again, half an extension is worse than none.
            Hooks::forget($id);
            $this->failed[$id] = $exception->getMessage();
            $this->report($id, $exception, 'starting');
        }
    }

    /** Lets the classes of an extension be found in the folders its manifest names, and nowhere else. */
    private function registerAutoload(Manifest $manifest, string $directory): void
    {
        $base = realpath($directory);
        foreach ($manifest->autoload() as $prefix => $folder) {
            $root = $base === false ? false : realpath($base . '/' . $folder);
            if ($root === false || !str_starts_with($root, $base . '/')) {
                continue;
            }

            spl_autoload_register(function (string $class) use ($prefix, $root) {
                if (!str_starts_with($class, $prefix)) {
                    return;
                }
                $file = $root . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
                if (is_file($file) && str_starts_with((string) realpath($file), $root . '/')) {
                    require_once $file;
                }
            });
        }
    }

    /**
     * Writes down that an extension went wrong, for the admin page and the log. The panel does not stop for it.
     */
    public function report(string $id, \Throwable|string $error, string $where = ''): void
    {
        $message = $error instanceof \Throwable ? $error->getMessage() : $error;
        $detail = trim(($where !== '' ? "While $where: " : '') . $message);
        $location = $error instanceof \Throwable ? ' (' . basename($error->getFile()) . ':' . $error->getLine() . ')' : '';
        $detail = mb_substr($detail . $location, 0, 1000);

        try {
            Log::warning("Extension $id: $detail", $error instanceof \Throwable ? ['exception' => $error] : []);

            $record = InstalledExtension::query()->where('ext_id', $id)->first();
            if ($record !== null && ($record->last_error !== $detail || is_null($record->last_error_at)
                || $record->last_error_at->lt(now()->subSeconds(self::REPEAT_SECONDS)))) {
                $record->forceFill(['last_error' => $detail, 'last_error_at' => now()])->save();
            }
        } catch (\Throwable) {
            // Not being able to write it down is no reason to break anything either.
        }
    }

    /** @return array<string, ExtensionContext> */
    public function running(): array
    {
        return $this->running;
    }

    public function isRunning(string $id): bool
    {
        return isset($this->running[$id]);
    }

    /** @return array<string, string> */
    public function failed(): array
    {
        return $this->failed;
    }

    public function context(string $id): ?ExtensionContext
    {
        return $this->running[$id] ?? null;
    }

    /** The manifest of an installed extension from its folder, null when it cannot be read. */
    public function manifestOf(string $id): ?Manifest
    {
        try {
            return Manifest::fromDirectory($this->directory($id));
        } catch (InvalidManifestException) {
            return null;
        }
    }

    /**
     * What the pages of the panel need to load the browser part of the extensions that started: their scripts and styles.
     *
     * @return list<array{id: string, name: string, version: string, scripts: list<string>, styles: list<string>}>
     */
    public function frontend(): array
    {
        $result = [];
        foreach ($this->running as $id => $context) {
            $manifest = $context->manifest();
            if (!$manifest->scripts() && !$manifest->styles()) {
                continue;
            }

            // The version in the address is what makes a browser fetch the new file after an update.
            $url = fn (string $file) => '/extensions/' . $id . '/assets/' . substr($file, strlen('web/')) . '?v=' . rawurlencode($manifest->version());
            $result[] = [
                'id' => $id,
                'name' => $manifest->name(),
                'version' => $manifest->version(),
                'scripts' => array_map($url, $manifest->scripts()),
                'styles' => array_map($url, $manifest->styles()),
            ];
        }

        return $result;
    }
}
