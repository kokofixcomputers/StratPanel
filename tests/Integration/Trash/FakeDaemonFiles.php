<?php

namespace Pterodactyl\Tests\Integration\Trash;

use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Exception\TransferException;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * A node in memory, for the tests of the trash bin: the files of every server, with the rules of Wings that matter here (a rename
 * does not overwrite, a folder has to exist to be listed, deleting something that is not there is fine).
 */
class FakeDaemonFiles extends DaemonFileRepository
{
    /** @var array<string, array<string, array{dir: bool, size: int}>> uuid => path => entry */
    public array $disks = [];

    /** @var list<string> */
    public array $calls = [];

    public bool $down = false;

    private string $uuid = '';

    public function __construct()
    {
        // The real one needs an application, this one needs nothing.
    }

    public function setServer($server): static
    {
        $this->uuid = $server->uuid;
        $this->disks[$this->uuid] ??= ['' => ['dir' => true, 'size' => 0]];

        return $this;
    }

    // ---- helpers for the tests ------------------------------------------------------------------------------------------

    public function seed($server, string $path, int $size = 10, bool $dir = false): void
    {
        $this->setServer($server);
        $this->mkdirs($this->dirname($this->clean($path)));
        $this->disks[$this->uuid][$this->clean($path)] = ['dir' => $dir, 'size' => $size];
    }

    public function has($server, string $path): bool
    {
        $this->setServer($server);

        return isset($this->disks[$this->uuid][$this->clean($path)]);
    }

    /** @return list<string> */
    public function paths($server): array
    {
        $this->setServer($server);

        return array_values(array_filter(array_keys($this->disks[$this->uuid]), fn ($p) => $p !== ''));
    }

    // ---- what the panel asks of a node ----------------------------------------------------------------------------------

    public function getDirectory(string $path): array
    {
        $this->down();
        $this->calls[] = 'list ' . $path;
        $dir = $this->clean($path);
        if (!isset($this->disks[$this->uuid][$dir]) || !$this->disks[$this->uuid][$dir]['dir']) {
            $this->fail(404);
        }

        $out = [];
        foreach ($this->disks[$this->uuid] as $p => $entry) {
            if ($p !== '' && $this->dirname($p) === $dir) {
                $out[] = ['name' => basename($p), 'directory' => $entry['dir'], 'file' => !$entry['dir'], 'size' => $entry['size'], 'mode' => 'rw-r--r--', 'mode_bits' => '644', 'created' => now()->toIso8601String(), 'modified' => now()->toIso8601String(), 'symlink' => false, 'mime' => 'text/plain'];
            }
        }

        return $out;
    }

    public function createDirectory(string $name, string $path): ResponseInterface
    {
        $this->down();
        $this->calls[] = 'mkdir ' . $path . '/' . $name;
        $this->mkdirs($this->clean($path . '/' . $name));

        return new Response(204);
    }

    public function renameFiles(?string $root, array $files): ResponseInterface
    {
        $this->down();
        foreach ($files as $file) {
            $from = $this->clean(($root ?? '/') . '/' . $file['from']);
            $to = $this->clean(($root ?? '/') . '/' . $file['to']);
            $this->calls[] = "rename $from -> $to";

            if (!isset($this->disks[$this->uuid][$from])) {
                $this->fail(404);
            }
            if (isset($this->disks[$this->uuid][$to])) {
                $this->fail(400);
            }
            if (!isset($this->disks[$this->uuid][$this->dirname($to)])) {
                $this->fail(404);
            }

            foreach ($this->disks[$this->uuid] as $p => $entry) {
                if ($p === $from || str_starts_with($p, $from . '/')) {
                    unset($this->disks[$this->uuid][$p]);
                    $this->disks[$this->uuid][$to . substr($p, strlen($from))] = $entry;
                }
            }
        }

        return new Response(204);
    }

    public function deleteFiles(?string $root, array $files): ResponseInterface
    {
        $this->down();
        foreach ($files as $file) {
            $path = $this->clean(($root ?? '/') . '/' . $file);
            $this->calls[] = 'delete ' . $path;
            foreach (array_keys($this->disks[$this->uuid]) as $p) {
                if ($p !== '' && ($p === $path || str_starts_with($p, $path . '/'))) {
                    unset($this->disks[$this->uuid][$p]);
                }
            }
        }

        return new Response(204);
    }

    // ---- internals --------------------------------------------------------------------------------------------------------

    private function down(): void
    {
        if ($this->down) {
            throw new DaemonConnectionException(new TransferException('node is down'));
        }
    }

    private function fail(int $status): never
    {
        throw new DaemonConnectionException(new \GuzzleHttp\Exception\ClientException('wings said no', new \GuzzleHttp\Psr7\Request('GET', '/'), new Response($status)));
    }

    private function clean(string $path): string
    {
        $parts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            $part === '..' ? array_pop($parts) : $parts[] = $part;
        }

        return implode('/', $parts);
    }

    private function dirname(string $path): string
    {
        $pos = strrpos($path, '/');

        return $pos === false ? '' : substr($path, 0, $pos);
    }

    private function mkdirs(string $path): void
    {
        $built = '';
        foreach (array_filter(explode('/', $path), fn ($p) => $p !== '') as $part) {
            $built = $built === '' ? $part : $built . '/' . $part;
            $this->disks[$this->uuid][$built] ??= ['dir' => true, 'size' => 0];
        }
    }
}
