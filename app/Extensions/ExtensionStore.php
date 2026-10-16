<?php

namespace Pterodactyl\Extensions;

use Illuminate\Support\Facades\DB;

/**
 * A small key value store that belongs to one extension (the extension_data table), for what an extension has to remember without
 * making a table of its own: a message per server, a counter. Values are JSON, so anything that can be turned into JSON fits.
 */
class ExtensionStore
{
    public function __construct(private string $extension)
    {
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $value = DB::table('extension_data')->where('ext_id', $this->extension)->where('key', $key)->value('value');

        return $value === null ? $default : json_decode($value, true);
    }

    public function has(string $key): bool
    {
        return DB::table('extension_data')->where('ext_id', $this->extension)->where('key', $key)->exists();
    }

    public function put(string $key, mixed $value): void
    {
        DB::table('extension_data')->updateOrInsert(
            ['ext_id' => $this->extension, 'key' => $key],
            ['value' => json_encode($value), 'updated_at' => now(), 'created_at' => now()]
        );
    }

    public function forget(string $key): void
    {
        DB::table('extension_data')->where('ext_id', $this->extension)->where('key', $key)->delete();
    }

    /**
     * Everything stored under keys that start with a prefix.
     *
     * @return array<string, mixed>
     */
    public function all(string $prefix = ''): array
    {
        $query = DB::table('extension_data')->where('ext_id', $this->extension);
        if ($prefix !== '') {
            $query->where('key', 'like', str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $prefix) . '%');
        }

        return $query->pluck('value', 'key')->map(fn ($value) => json_decode($value, true))->all();
    }

    /** Removes everything this extension stored, which is what removing it for good does. */
    public function flush(): void
    {
        DB::table('extension_data')->where('ext_id', $this->extension)->delete();
    }
}
