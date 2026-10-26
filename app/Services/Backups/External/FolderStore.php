<?php

namespace Pterodactyl\Services\Backups\External;

use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;
use Pterodactyl\Exceptions\DisplayException;

/** A folder on the machine of the panel (a second disk, a mounted share). */
class FolderStore implements BackupStore
{
    public function __construct(private string $root)
    {
        $this->root = rtrim($root, '/');
    }

    private function full(string $path): string
    {
        // The paths are made from uuids, this only guards against a path that tries to leave the folder.
        if (str_contains($path, '..')) {
            throw new DisplayException('That path is not allowed.');
        }

        return $this->root . '/' . ltrim($path, '/');
    }

    public function put(string $path, StreamInterface $contents, ?int $size = null): void
    {
        $target = $this->full($path);
        if (!is_dir(dirname($target)) && !@mkdir(dirname($target), 0750, true) && !is_dir(dirname($target))) {
            throw new DisplayException('Could not make the folder ' . dirname($target) . ', does the panel have the right to write there?');
        }

        // Written under another name and moved, so a copy that was cut off never looks like a complete one.
        $partial = $target . '.part';
        $handle = @fopen($partial, 'wb');
        if (!$handle) {
            throw new DisplayException('Could not write to ' . dirname($target) . ', does the panel have the right to write there?');
        }
        try {
            while (!$contents->eof()) {
                fwrite($handle, $contents->read(1024 * 1024));
            }
        } finally {
            fclose($handle);
        }
        rename($partial, $target);
    }

    public function read(string $path): StreamInterface
    {
        $handle = @fopen($this->full($path), 'rb');
        if (!$handle) {
            throw new DisplayException('The file is not in the folder any more.');
        }

        return Utils::streamFor($handle);
    }

    public function delete(string $path): void
    {
        $target = $this->full($path);
        if (is_file($target)) {
            @unlink($target);
        }
        // An empty folder of a server is tidied up too.
        if (dirname($target) !== $this->root) {
            @rmdir(dirname($target));
        }
    }

    public function temporaryUrl(string $path, int $minutes): ?string
    {
        return null;
    }

    public function check(): void
    {
        if ($this->root === '' || $this->root[0] !== '/') {
            throw new DisplayException('Give the full path of a folder, starting with /.');
        }
        $name = '.check-' . bin2hex(random_bytes(4));
        $this->put($name, Utils::streamFor('ok'));
        $got = (string) $this->read($name);
        $this->delete($name);
        if ($got !== 'ok') {
            throw new DisplayException('What was written to the folder was not read back the same.');
        }
    }
}
