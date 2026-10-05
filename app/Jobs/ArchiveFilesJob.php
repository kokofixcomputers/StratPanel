<?php

namespace Pterodactyl\Jobs;

use Pterodactyl\Models\Server;
use Illuminate\Support\Facades\Cache;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\Attributes\WithoutRelations;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;

/**
 * Runs a (potentially very slow) compress or decompress call against Wings in the background so the HTTP request
 * that started it can return immediately and the browser can be closed without cancelling the work.
 */
#[DeleteWhenMissingModels]
class ArchiveFilesJob implements ShouldQueue
{
    use Queueable;

    public const TTL = 3600;

    // A job's own timeout overrides the queue worker's default of 60 seconds.
    public int $timeout = 3600;

    public int $tries = 1;

    public function __construct(
        public readonly string $id,
        #[WithoutRelations]
        public readonly Server $server,
        public readonly string $action,
        public readonly ?string $root,
        public readonly array $items,
    ) {
    }

    public static function key(string $serverUuid, string $id): string
    {
        return "file-task:{$serverUuid}:{$id}";
    }

    public function handle(DaemonFileRepository $repository): void
    {
        $key = self::key($this->server->uuid, $this->id);
        Cache::put($key, ['status' => 'running'], self::TTL);

        try {
            $repository->setServer($this->server);

            if ($this->action === 'compress') {
                $file = $repository->compressFiles($this->root, $this->items);
            } else {
                $repository->decompressFile($this->root, $this->items[0]);
                $file = null;
            }

            Cache::put($key, ['status' => 'done', 'file' => $file], self::TTL);
        } catch (\Throwable $exception) {
            Cache::put($key, ['status' => 'failed', 'error' => $exception->getMessage()], self::TTL);
        }
    }

    public function failed(\Throwable $exception): void
    {
        Cache::put(
            self::key($this->server->uuid, $this->id),
            ['status' => 'failed', 'error' => $exception->getMessage()],
            self::TTL
        );
    }
}
