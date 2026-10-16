<?php

namespace Pterodactyl\Extensions;

use ZipArchive;
use Illuminate\Support\Facades\Artisan;
use Pterodactyl\Models\InstalledExtension;

/**
 * Installs an extension from a .stratext, which is a zip file with extension.json in it. A package is not trusted any further
 * than it has to be: the names inside are checked before anything is written (no way out of the folder, no links), the size is
 * limited, and it is unpacked to a folder of its own and only moved into place when everything worked.
 */
class ExtensionInstaller
{
    public function __construct(private ExtensionManager $manager)
    {
    }

    /**
     * Reads the manifest of a package without installing it.
     *
     * @throws InvalidManifestException
     */
    public function inspect(string $file): Manifest
    {
        $zip = $this->open($file);
        try {
            [, $manifest] = $this->validate($zip);

            return $manifest;
        } finally {
            $zip->close();
        }
    }

    /**
     * @param  bool  $enable  switch it on after installing, for a new extension (an update keeps whatever it was)
     * @param  bool  $replace  allow an extension that is installed already to be replaced, its settings and data stay
     *
     * @throws InvalidManifestException
     * @throws \RuntimeException
     */
    public function install(string $file, bool $enable = false, bool $replace = false): InstalledExtension
    {
        $zip = $this->open($file);
        $temporary = null;

        try {
            [$prefix, $manifest] = $this->validate($zip);
            $id = $manifest->id();
            $existing = InstalledExtension::query()->where('ext_id', $id)->first();
            if ($existing !== null && !$replace) {
                throw new \RuntimeException('"' . $id . '" is installed already (version ' . $existing->version . '). Install it with --force to replace it, its settings stay.');
            }

            $base = $this->manager->directory();
            $this->makeDirectory($base);
            $temporary = $base . '/.incoming-' . bin2hex(random_bytes(6));
            $this->extract($zip, $prefix, $temporary);

            // The database changes of the extension, from its own folder, before it is moved into place: if they fail nothing has
            // been replaced.
            if (($migrations = $manifest->migrations()) !== null && is_dir($temporary . '/' . $migrations)) {
                try {
                    $code = Artisan::call('migrate', ['--path' => $temporary . '/' . $migrations, '--realpath' => true, '--force' => true]);
                    $problem = trim(Artisan::output());
                } catch (\Throwable $exception) {
                    $code = 1;
                    $problem = $exception->getMessage();
                }
                if ($code !== 0) {
                    throw new \RuntimeException('The database changes of the extension failed: ' . $problem);
                }
            }

            $final = $this->manager->directory($id);
            $old = null;
            if (is_dir($final)) {
                $old = $final . '.old-' . bin2hex(random_bytes(4));
                if (!@rename($final, $old)) {
                    throw new \RuntimeException('The old version of "' . $id . '" could not be moved away, is the folder ' . $base . ' writable?');
                }
            }
            if (!@rename($temporary, $final)) {
                if ($old !== null) {
                    @rename($old, $final);
                }
                throw new \RuntimeException('The extension could not be moved into place in ' . $base . '.');
            }
            $temporary = null;
            if ($old !== null) {
                $this->deleteTree($old);
            }

            $record = InstalledExtension::query()->updateOrCreate(
                ['ext_id' => $id],
                array_merge(
                    ['name' => $manifest->name(), 'version' => $manifest->version(), 'last_error' => null, 'last_error_at' => null],
                    $existing === null ? ['enabled' => $enable] : []
                )
            );
            $this->manager->records(true);

            return $record;
        } finally {
            $zip->close();
            if ($temporary !== null) {
                $this->deleteTree($temporary);
            }
        }
    }

    /** Removes the files and the record of an extension. With $purge what it stored (extension_data) goes too. */
    public function remove(string $id, bool $purge = false): void
    {
        if (!preg_match('/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/', $id)) {
            throw new \RuntimeException('"' . $id . '" is not the id of an extension.');
        }

        $record = InstalledExtension::query()->where('ext_id', $id)->first();
        $directory = $this->manager->directory($id);
        if ($record === null && !is_dir($directory)) {
            throw new \RuntimeException('"' . $id . '" is not installed.');
        }

        $this->deleteTree($directory);
        if ($purge) {
            (new ExtensionStore($id))->flush();
        }
        InstalledExtension::query()->where('ext_id', $id)->delete();
        $this->manager->records(true);
    }

    private function open(string $file): ZipArchive
    {
        if (!is_file($file) || !is_readable($file)) {
            throw new \RuntimeException('The file ' . $file . ' does not exist or cannot be read.');
        }
        if (filesize($file) > (int) config('extensions.max_package_bytes')) {
            throw new \RuntimeException('The package is bigger than ' . round(config('extensions.max_package_bytes') / 1048576) . ' MB.');
        }

        $zip = new ZipArchive();
        if ($zip->open($file, ZipArchive::RDONLY) !== true) {
            throw new \RuntimeException('The file is not a .stratext (it is not a zip file, or it is damaged).');
        }

        return $zip;
    }

    /**
     * Checks every entry before anything is written.
     *
     * @return array{0: string, 1: Manifest} the folder in the zip that holds extension.json (empty for the top), and the manifest
     */
    private function validate(ZipArchive $zip): array
    {
        $count = $zip->numFiles;
        if ($count === 0 || $count > (int) config('extensions.max_files')) {
            throw new \RuntimeException('A package has to have between 1 and ' . config('extensions.max_files') . ' files, this one has ' . $count . '.');
        }

        $total = 0;
        $manifestAt = null;
        for ($i = 0; $i < $count; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if ($this->ignored($name)) {
                continue;
            }
            if (!$this->safeName($name)) {
                throw new \RuntimeException('The package has a file with a name that is not allowed: ' . json_encode($name));
            }
            $zip->getExternalAttributesIndex($i, $system, $attributes);
            if ($system === ZipArchive::OPSYS_UNIX && ((($attributes >> 16) & 0170000) === 0120000)) {
                throw new \RuntimeException('The package has a link (' . $name . '), which is not allowed.');
            }

            $stat = $zip->statIndex($i);
            $total += (int) ($stat['size'] ?? 0);
            if ($total > (int) config('extensions.max_unpacked_bytes')) {
                throw new \RuntimeException('The package is bigger than ' . round(config('extensions.max_unpacked_bytes') / 1048576) . ' MB when it is unpacked.');
            }

            if (preg_match('#^([^/]+/)?extension\.json$#', $name) && ($manifestAt === null || strlen($name) < strlen($manifestAt))) {
                $manifestAt = $name;
            }
        }

        if ($manifestAt === null) {
            throw new InvalidManifestException('The package has no extension.json at its top.');
        }

        $manifest = Manifest::fromJson((string) $zip->getFromName($manifestAt));
        $prefix = substr($manifestAt, 0, -strlen('extension.json'));

        foreach ($manifest->scripts() as $script) {
            if ($zip->locateName($prefix . $script) === false) {
                throw new InvalidManifestException('web.scripts names ' . $script . ' which is not in the package.');
            }
        }
        foreach ($manifest->styles() as $style) {
            if ($zip->locateName($prefix . $style) === false) {
                throw new InvalidManifestException('web.styles names ' . $style . ' which is not in the package.');
            }
        }

        return [$prefix, $manifest];
    }

    private function safeName(string $name): bool
    {
        return $name !== '' && !str_starts_with($name, '/') && !str_contains($name, '\\') && !str_contains($name, "\0")
            && !preg_match('/[\x00-\x1f]/', $name) && !preg_match('/^[A-Za-z]:/', $name)
            && !in_array('..', explode('/', $name), true);
    }

    /** What archive programs add that is not part of the extension. */
    private function ignored(string $name): bool
    {
        return str_starts_with($name, '__MACOSX/') || basename($name) === '.DS_Store' || str_contains($name, '/__MACOSX/');
    }

    private function extract(ZipArchive $zip, string $prefix, string $target): void
    {
        $this->makeDirectory($target);
        $root = realpath($target);

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if ($this->ignored($name) || !str_starts_with($name, $prefix)) {
                continue;
            }

            $relative = substr($name, strlen($prefix));
            if ($relative === '') {
                continue;
            }

            $destination = $root . '/' . rtrim($relative, '/');
            if (str_ends_with($name, '/')) {
                $this->makeDirectory($destination);
                continue;
            }

            $this->makeDirectory(dirname($destination));
            // The folder has been made inside the target, if a name could still lead somewhere else it is caught here.
            if (!str_starts_with((string) realpath(dirname($destination)), $root)) {
                throw new \RuntimeException('The package has a file that would be written outside of its folder: ' . $name);
            }

            $in = $zip->getStream($name);
            $out = $in === false ? false : fopen($destination, 'wb');
            if ($in === false || $out === false) {
                throw new \RuntimeException('The file ' . $name . ' could not be unpacked.');
            }
            stream_copy_to_stream($in, $out);
            fclose($in);
            fclose($out);
        }
    }

    private function makeDirectory(string $path): void
    {
        if (!is_dir($path) && !@mkdir($path, 0755, true) && !is_dir($path)) {
            throw new \RuntimeException('The folder ' . $path . ' could not be made, is its parent writable by the user the panel runs as?');
        }
    }

    /** Deletes a folder with everything in it. Links are removed, never followed. */
    private function deleteTree(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            @unlink($path);

            return;
        }
        if (!is_dir($path)) {
            return;
        }

        foreach (scandir($path) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                $this->deleteTree($path . '/' . $entry);
            }
        }
        @rmdir($path);
    }
}
