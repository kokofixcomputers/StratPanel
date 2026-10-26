<?php

namespace Pterodactyl\Services\Backups\External;

use Pterodactyl\Models\BackupDestination;

/** Makes the store of a destination. Tests put their own in with `fake()`. */
class Stores
{
    /** @var array<int|string, BackupStore> */
    private static array $fakes = [];

    public static function fake(int|string $destination, BackupStore $store): void
    {
        self::$fakes[$destination] = $store;
    }

    public static function reset(): void
    {
        self::$fakes = [];
    }

    public function for(BackupDestination $destination): BackupStore
    {
        return self::$fakes[$destination->id] ?? $this->make($destination->type, $destination->config);
    }

    /** @param  array<string, mixed>  $config */
    public function make(string $type, array $config): BackupStore
    {
        return match ($type) {
            BackupDestination::S3 => S3Store::fromConfig($config),
            BackupDestination::WEBDAV => new WebDavStore((string) ($config['url'] ?? ''), (string) ($config['username'] ?? ''), (string) ($config['password'] ?? '')),
            BackupDestination::FOLDER => new FolderStore((string) ($config['path'] ?? '')),
            default => throw new \InvalidArgumentException('Unknown backup destination type ' . $type),
        };
    }
}
