<?php

namespace Pterodactyl\Services\Trash;

use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Facades\Activity;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\ServerTrashItem;
use Illuminate\Database\Eloquent\Collection;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * The trash bin of a server. When an admin turned it on, deleting files, folders and schedules keeps them for a number of days
 * instead of removing them: files are moved to a folder in the root of the server (on the node, so nothing is copied and the files
 * stay on the same disk), a schedule stays in its table marked as deleted. People who may can recover them, everything else is
 * deleted for good when it expires.
 *
 * The trash bin of a server is part of its disk: what is in it counts toward the disk limit until it is emptied or expires.
 */
class TrashService
{
    public function __construct(private DaemonFileRepository $files)
    {
    }

    public function enabled(): bool
    {
        return (bool) config('trash.enabled', false);
    }

    public function retentionDays(): int
    {
        return max(1, min(365, (int) config('trash.retention_days', 30)));
    }

    /** The folder in the root of a server where deleted files wait, without slashes. */
    public function directory(): string
    {
        return trim((string) config('trash.directory', '.stratosphere-trash'), '/');
    }

    /** Whether a path (from the root of a server, however it is written) is the trash folder or something in it. */
    public function isTrashPath(string $path): bool
    {
        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                array_pop($parts);

                continue;
            }
            $parts[] = $part;
        }

        return ($parts[0] ?? null) === $this->directory();
    }

    // ---- putting things in ----------------------------------------------------------------------------------------------

    /**
     * Moves files or folders into the trash bin instead of deleting them.
     *
     * @param  list<string>  $names  names inside $root
     * @return int how many were moved
     *
     * @throws DisplayException
     */
    public function trashFiles(Server $server, ?User $user, string $root, array $names): int
    {
        $root = '/' . trim(str_replace('\\', '/', $root), '/');
        $repository = $this->files->setServer($server);

        // What they are (a folder or a file, how big) is on the node, and a name that is not there is not an error for a delete.
        $listing = collect($repository->getDirectory($root))->keyBy('name');

        $moved = 0;
        foreach ($names as $name) {
            $this->assertName($name);
            $path = trim($root . '/' . $name, '/');
            if ($this->isTrashPath($path)) {
                throw new DisplayException('The trash bin can not be put in the trash bin.');
            }

            $entry = $listing->get($name);
            if ($entry === null) {
                continue;
            }

            $uuid = Str::uuid()->toString();
            $folder = $this->directory() . '/' . $uuid;
            $repository->createDirectory($folder, '/');
            $repository->renameFiles('/', [['from' => $path, 'to' => $folder . '/' . $name]]);

            ServerTrashItem::query()->create([
                'uuid' => $uuid,
                'server_id' => $server->id,
                'type' => !empty($entry['directory']) ? ServerTrashItem::DIRECTORY : ServerTrashItem::FILE,
                'name' => $name,
                'path' => $root,
                'size' => !empty($entry['directory']) ? null : (int) ($entry['size'] ?? 0),
                'deleted_by' => $user?->id,
                'expires_at' => CarbonImmutable::now()->addDays($this->retentionDays()),
                'created_at' => now(),
            ]);
            ++$moved;
        }

        return $moved;
    }

    /** Puts a schedule in the trash bin: it is hidden and stops running, its tasks stay with it. */
    public function trashSchedule(Server $server, ?User $user, Schedule $schedule): ServerTrashItem
    {
        $item = ServerTrashItem::query()->create([
            'uuid' => Str::uuid()->toString(),
            'server_id' => $server->id,
            'type' => ServerTrashItem::SCHEDULE,
            'name' => $schedule->name,
            'schedule_id' => $schedule->id,
            'deleted_by' => $user?->id,
            'expires_at' => CarbonImmutable::now()->addDays($this->retentionDays()),
            'created_at' => now(),
        ]);
        $schedule->delete();

        return $item;
    }

    // ---- looking ----------------------------------------------------------------------------------------------------------

    /** @return Collection<int, ServerTrashItem> newest first */
    public function items(Server $server): Collection
    {
        return ServerTrashItem::query()->with('deleter')->where('server_id', $server->id)->orderByDesc('id')->get();
    }

    // ---- getting things back --------------------------------------------------------------------------------------------

    /**
     * Puts an item back. A file or folder goes back where it was; if something else is there now (or the folder is gone) the folder is
     * made again and the name gets " (restored)" added, nothing is overwritten.
     *
     * @return string where a file or folder is now (its path), or the name of the schedule
     *
     * @throws DisplayException
     */
    public function restore(Server $server, ServerTrashItem $item, ?User $user): string
    {
        $this->assertBelongs($server, $item);

        $where = $item->type === ServerTrashItem::SCHEDULE ? $this->restoreSchedule($item) : $this->restoreFile($server, $item);
        $item->delete();

        Activity::event('server:trash.restore')
            ->property(['name' => $item->name, 'type' => $item->type, 'to' => $where])
            ->log();

        return $where;
    }

    private function restoreSchedule(ServerTrashItem $item): string
    {
        $schedule = Schedule::withTrashed()->where('server_id', $item->server_id)->find($item->schedule_id);
        if ($schedule === null) {
            $item->delete();

            throw new DisplayException('This schedule is gone, it can not be recovered.');
        }

        $schedule->restore();
        // The time it was due while it was in the trash bin has passed, it must not run at once.
        $schedule->forceFill(['next_run_at' => $schedule->getNextRunDate(), 'is_processing' => false])->save();

        return $schedule->name;
    }

    private function restoreFile(Server $server, ServerTrashItem $item): string
    {
        $repository = $this->files->setServer($server);
        $folder = $this->directory() . '/' . $item->uuid;
        $parent = '/' . trim((string) $item->path, '/');

        // Where it was may not exist any more.
        if ($parent !== '/') {
            $repository->createDirectory(trim($parent, '/'), '/');
        }

        $taken = collect($repository->getDirectory($parent))->pluck('name')->all();
        $name = $this->freeName($item->name, $taken);
        $to = trim($parent . '/' . $name, '/');

        $repository->renameFiles('/', [['from' => $folder . '/' . $item->name, 'to' => $to]]);
        $this->removeFolder($server, $item);

        return '/' . $to;
    }

    // ---- getting rid of things for good ---------------------------------------------------------------------------------

    /** @throws DisplayException */
    public function delete(Server $server, ServerTrashItem $item, ?User $user = null): void
    {
        $this->assertBelongs($server, $item);

        $this->destroy($item);

        Activity::event('server:trash.delete')->property(['name' => $item->name, 'type' => $item->type])->log();
    }

    /** Deletes everything in the trash bin of a server for good. */
    public function empty(Server $server, ?User $user = null): int
    {
        $count = 0;
        foreach ($this->items($server) as $item) {
            $this->destroy($item);
            ++$count;
        }

        if ($count > 0) {
            Activity::event('server:trash.empty')->property('count', $count)->log();
        }

        return $count;
    }

    /**
     * Deletes what has been in the trash bin for longer than it is kept. A node that can not be reached leaves the item for the next
     * time, and one that answers that the file is gone lets the item go.
     *
     * @return array{deleted: int, failed: int}
     */
    public function purgeExpired(): array
    {
        $deleted = $failed = 0;

        ServerTrashItem::query()->with('server.node')->where('expires_at', '<=', now())->orderBy('id')->chunkById(100, function ($items) use (&$deleted, &$failed) {
            foreach ($items as $item) {
                try {
                    $this->destroy($item);
                    ++$deleted;
                } catch (\Throwable $exception) {
                    ++$failed;
                    Log::warning('The trash bin could not delete ' . $item->uuid . ' of server ' . $item->server_id . ': ' . $exception->getMessage());
                }
            }
        });

        return ['deleted' => $deleted, 'failed' => $failed];
    }

    private function destroy(ServerTrashItem $item): void
    {
        if ($item->type === ServerTrashItem::SCHEDULE) {
            Schedule::withTrashed()->where('id', $item->schedule_id)->forceDelete();
        } else {
            $this->removeFolder($item->server, $item);
        }

        $item->delete();
    }

    private function removeFolder(Server $server, ServerTrashItem $item): void
    {
        $this->files->setServer($server)->deleteFiles('/' . $this->directory(), [$item->uuid]);
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------------

    /** @throws DisplayException */
    private function assertName(string $name): void
    {
        if ($name === '' || $name === '.' || $name === '..' || str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, "\0")) {
            throw new DisplayException('That is not a file name.');
        }
    }

    /** @throws DisplayException */
    private function assertBelongs(Server $server, ServerTrashItem $item): void
    {
        if ($item->server_id !== $server->id) {
            throw new DisplayException('That is not in the trash bin of this server.');
        }
    }

    /**
     * @param  list<string>  $taken
     */
    private function freeName(string $name, array $taken): string
    {
        if (!in_array($name, $taken, true)) {
            return $name;
        }

        $dot = strrpos($name, '.');
        [$base, $extension] = $dot === false || $dot === 0 ? [$name, ''] : [substr($name, 0, $dot), substr($name, $dot)];

        for ($n = 1; $n < 1000; ++$n) {
            $candidate = $base . ' (restored' . ($n > 1 ? ' ' . $n : '') . ')' . $extension;
            if (!in_array($candidate, $taken, true)) {
                return $candidate;
            }
        }

        return $base . ' (restored ' . Str::random(6) . ')' . $extension;
    }
}
